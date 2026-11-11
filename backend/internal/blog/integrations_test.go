package blog

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func paidAccount() Row {
	return Row{"entitlements": Row{"active": true, "planId": "starter", "expiresAt": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)}}
}
func expectPanicCode(t *testing.T, code string, run func()) {
	t.Helper()
	defer func() {
		value := recover()
		e, ok := value.(*HTTPError)
		if !ok || e.Code != code {
			t.Fatalf("got %#v, want code %s", value, code)
		}
	}()
	run()
	t.Fatal("expected error")
}
func TestEntitlementsRejectExpiredAndUntrustedFlags(t *testing.T) {
	row := Row{"active": true, "planId": "starter", "expiresAt": time.Now().Add(-time.Hour).Format(time.RFC3339), "integrations": true}
	if entitlements(row).yes("ai") {
		t.Fatal("expired entitlement accepted")
	}
	row["expiresAt"] = time.Now().Add(time.Hour).Format(time.RFC3339)
	result := entitlements(row)
	if !result.yes("ai") || result.yes("integrations") {
		t.Fatal(result)
	}
}
func TestAccessRejectsRedirectsAndInvalidAccount(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://other.example/account"}}, Body: io.NopCloser(strings.NewReader("{}"))}, nil
	})
	expectPanicCode(t, "ACCOUNT_UNAVAILABLE", func() { a.access(context.Background()) })
	a.Client = &http.Client{Transport: testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"entitlements": Row{"active": true}}), nil
	})}
	expectPanicCode(t, "ACCOUNT_UNAVAILABLE", func() { a.access(context.Background()) })
}
func TestSummaryContractAndIdempotency(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "ignored-provider-key")
	t.Setenv("AI_MODE", "openai")
	a, _ := coreFixture(t)
	id := uuid()
	var received string
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		if r.URL.String() != "https://central.example/v1/generations/summaries" {
			t.Fatal("summary bypassed Central", r.URL)
		}
		received = r.Header.Get("Idempotency-Key")
		return fixtureResponse(Row{"summaries": []Row{{"platform": "x", "text": "Draft"}}}), nil
	})
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Article", "slug": "article", "content": "Body", "status": "published"}, true), 201)
	input := Row{"postId": post["id"], "title": "Article", "content": "Body", "tone": "natural", "platforms": []string{"x"}}
	r := httptest.NewRequest("POST", "http://blog.test/api/ai/summaries", strings.NewReader(encode(input)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer owner")
	r.Header.Set("Idempotency-Key", id)
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	saved := responseRow(t, w, 201)
	if received != id || saved.str("sourceHash") != hash(`{"title":"Article","content":"Body"}`) {
		t.Fatal(received, saved)
	}
	history := responseRow(t, request(t, a, "GET", "/api/ai/history?postId="+post.str("id"), nil, true), 200)
	if len(history["summaries"].([]any)) != 1 {
		t.Fatal(history)
	}
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	expectStatus(t, request(t, a, "POST", "/api/ai/summaries", input, true), 409)
}
func TestGeneratedAssetWithdrawalDuringRead(t *testing.T) {
	a, s := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Art", "slug": "art", "content": "Body", "status": "published"}, true), 201)
	ctx := context.Background()
	id := uuid()
	url := "/api/assets/" + id + ".png"
	a.DB.Must(ctx, "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7)", id, post["id"], "assets/"+id, "prompt", "minimal", "1024x1024", "hash")
	a.DB.Must(ctx, "UPDATE posts SET cover=$1 WHERE id=$2", url, post["id"])
	s.Put(ctx, "assets/"+id, []byte("image"))
	expectStatus(t, request(t, a, "GET", url, nil, false), 200)
	s.onGet = func(string) { a.DB.Must(ctx, "UPDATE posts SET status='draft' WHERE id=$1", post["id"]) }
	expectStatus(t, request(t, a, "GET", url, nil, false), 404)
}
func TestNewsletterConfirmationAndUnsubscribe(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	var mail Row
	sends := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "central.example" {
			t.Fatal("Email escaped Central")
		}
		if r.URL.Path == "/v1/newsletter/status" {
			return fixtureResponse(Row{"ready": true, "defaultSenderEmail": "margin@margin.dev", "effectiveSenderEmail": "margin@margin.dev"}), nil
		}
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		sends++
		data, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(data, &mail); err != nil {
			t.Fatal(err)
		}
		return fixtureResponse(Row{"accepted": true}), nil
	})
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", Row{"enabled": true, "delivery": "managed", "senderEmail": ""}, true), 200)
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/subscribe", Row{"email": "Reader@Example.com"}, false), 202)
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/subscribe", Row{"email": "reader@example.com"}, false), 202)
	if sends != 1 {
		t.Fatal(sends)
	}
	token := mail.str("confirmationToken")
	unsubscribe := mail.str("unsubscribeToken")
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": token}, false), 200)
	expectStatus(t, request(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": token}, false), 400)
	t.Setenv("AI_SERVICE_TOKEN", "")
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": unsubscribe}, false), 200)
	row := first(a.DB.Must(context.Background(), "SELECT * FROM newsletter_subscribers"))
	if row.str("status") != "unsubscribed" || row["confirmation_hash"] != nil {
		t.Fatal(row)
	}
}
func TestImageValidationAndPricingFailure(t *testing.T) {
	expectPanicCode(t, "PRICING_INVALID", func() { validPricing(Row{}) })
}

func TestSourceHashMatchesJavaScriptSeparators(t *testing.T) {
	input := Row{"title": "A\u2028B", "content": "C\u2029D literal \\u2028"}
	expected := "{\"title\":\"A\u2028B\",\"content\":\"C\u2029D literal \\\\u2028\"}"
	if sourceHash(input) != hash(expected) {
		t.Fatalf("hash mismatch: %s", unescapeJSONSeparators(encode(input)))
	}
}

func TestNewsletterFailureReleasesReservation(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	sends := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/newsletter/status" {
			return fixtureResponse(Row{"ready": true, "defaultSenderEmail": "margin@margin.dev", "effectiveSenderEmail": "margin@margin.dev"}), nil
		}
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		sends++
		response := fixtureResponse(Row{"error": "Delivery failed"})
		response.StatusCode = 502
		return response, nil
	})
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", Row{"enabled": true, "delivery": "managed", "senderEmail": ""}, true), 200)
	input := Row{"email": "reader@example.com"}
	expectStatus(t, request(t, a, "POST", "/api/public/newsletter/subscribe", input, false), 502)
	row := first(a.DB.Must(context.Background(), "SELECT * FROM newsletter_subscribers"))
	if row["last_requested_at"] != nil || row["confirmation_hash"] != nil {
		t.Fatal(row)
	}
	expectStatus(t, request(t, a, "POST", "/api/public/newsletter/subscribe", input, false), 502)
	input["website"] = "spam"
	expectStatus(t, request(t, a, "POST", "/api/public/newsletter/subscribe", input, false), 202)
	if sends != 2 {
		t.Fatal(sends)
	}
}
func TestSummaryPublicationRecheckedAfterProvider(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Article", "slug": "article", "content": "Body", "status": "published"}, true), 201)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
		return fixtureResponse(Row{"summaries": []Row{{"platform": "x", "text": "Draft"}}}), nil
	})
	input := Row{"postId": post["id"], "title": "Article", "content": "Body", "tone": "natural", "platforms": []string{"x"}}
	expectStatus(t, request(t, a, "POST", "/api/ai/summaries", input, true), 409)
	if len(a.DB.Must(context.Background(), "SELECT * FROM ai_summaries")) != 0 {
		t.Fatal("summary inserted for withdrawn article")
	}
}

func TestImageUsesCentralEvenWithLocalProviderKeys(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_MODE", "openai")
	t.Setenv("OPENAI_API_KEY", "ignored-provider-key")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://central.example/v1/generations/image" {
			t.Fatal("image bypassed Central", r.URL)
		}
		return fixtureResponse(Row{"png": "iVBORw0KGgo=", "prompt": "A diagram"}), nil
	})
	prompt, data := a.aiImage(context.Background(), Row{"prompt": "A diagram"}, uuid())
	if prompt != "A diagram" || !pngSignature(data) {
		t.Fatal("invalid central image")
	}
}
