package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func ownerMailFixture(t *testing.T) (*App, *[]Row) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.example.test")
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "owner@example.test", "unused")
	messages := []Row{}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true, "effectiveSenderEmail": "notes@margin.dev"}), nil
		case "/v1/newsletter/owner-verification":
			var input Row
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			messages = append(messages, input)
			return fixtureResponse(Row{"accepted": true}), nil
		default:
			t.Fatalf("unexpected service route %s", r.URL.Path)
			return nil, nil
		}
	})
	return a, &messages
}

func TestOwnerEmailVerificationLifecycle(t *testing.T) {
	a, messages := ownerMailFixture(t)
	ctx := context.Background()
	if a.ownerEmail(ctx).yes("verified") {
		t.Fatal("existing owner was automatically verified")
	}
	result := responseRow(t, request(t, a, "POST", "/api/account/email-verification", Row{}, true), 202)
	if result.str("status") != "sent" || len(*messages) != 1 {
		t.Fatal(result)
	}
	value := (*messages)[0].str("verificationToken")
	if (*messages)[0].str("to") != "owner@example.test" {
		t.Fatal("sent to wrong recipient")
	}
	stored := first(a.DB.Must(ctx, "SELECT * FROM owner_email_verification"))
	if stored.str("token_hash") != hash(value) || strings.Contains(encode(stored), value) {
		t.Fatal("raw verification token stored")
	}
	responseRow(t, request(t, a, "POST", "/api/account/email-verification", Row{}, true), 202)
	if len(*messages) != 1 {
		t.Fatal("resend cooldown did not prevent duplicate delivery")
	}
	verified := request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false)
	expectStatus(t, verified, 200)
	assertOwnerEmailConfirmed(t, a, value, verified)
	responseRow(t, request(t, a, "POST", "/api/account/email-verification", Row{}, true), 202)
	if len(*messages) != 1 {
		t.Fatal("verified owner was emailed again")
	}
}

func assertOwnerEmailConfirmed(t *testing.T, a *App, value string, verified *httptest.ResponseRecorder) {
	t.Helper()
	ctx := context.Background()
	if verified.Header().Get("Set-Cookie") != "" || !a.ownerEmail(ctx).yes("verified") {
		t.Fatal("verification created a session or did not verify")
	}
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false), 400)
	if first(a.DB.Must(ctx, "SELECT token_hash FROM owner_email_verification"))["token_hash"] != nil {
		t.Fatal("token not consumed")
	}
	if len(a.DB.Must(ctx, "SELECT * FROM newsletter_subscribers")) != 0 {
		t.Fatal("owner was subscribed")
	}
}

func TestOwnerEmailExpiryRotationAndAddressBinding(t *testing.T) {
	a, messages := ownerMailFixture(t)
	ctx := context.Background()
	request(t, a, "POST", "/api/account/email-verification", Row{}, true)
	firstToken := (*messages)[0].str("verificationToken")
	a.DB.Must(ctx, "UPDATE owner_email_verification SET last_requested_at=$1", "2000-01-01T00:00:00.000Z")
	responseRow(t, request(t, a, "POST", "/api/account/email-verification", Row{}, true), 202)
	value := (*messages)[1].str("verificationToken")
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": firstToken}, false), 400)
	a.DB.Must(ctx, "UPDATE owner_email_verification SET expires_at=$1", "2000-01-01T00:00:00.000Z")
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false), 400)
	a.DB.Must(ctx, "UPDATE owner_email_verification SET expires_at=$1", "2100-01-01T00:00:00.000Z")
	a.DB.Must(ctx, "UPDATE admins SET email=$1", "changed@example.test")
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false), 400)
	if a.ownerEmail(ctx).yes("verified") {
		t.Fatal("changed email inherited verification")
	}
	a.DB.Must(ctx, "UPDATE admins SET email=$1", "owner@example.test")
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false), 200)
	a.DB.Must(ctx, "UPDATE admins SET email=$1", "changed@example.test")
	if a.ownerEmail(ctx).yes("verified") {
		t.Fatal("changed email inherited verified status")
	}
}

func TestOwnerEmailPrivateStatusAndInput(t *testing.T) {
	a, _ := ownerMailFixture(t)
	for _, method := range []string{"GET", "POST"} {
		expectStatus(t, request(t, a, method, "/api/account/email-verification", Row{}, false), 401)
	}
	expectStatus(t, request(t, a, "POST", "/api/account/email-verification", Row{"email": "other@example.test"}, true), 400)
	expectStatus(t, request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": "invalid"}, false), 400)
	public := responseRow(t, request(t, a, "GET", "/api/session", nil, false), 200)
	if public["ownerEmail"] != nil || strings.Contains(encode(public), "owner@example.test") {
		t.Fatal("owner email leaked")
	}
	private := responseRow(t, request(t, a, "GET", "/api/session", nil, true), 200)
	if object(private["ownerEmail"]).str("email") != "owner@example.test" {
		t.Fatal(private)
	}
	a.DB.Must(context.Background(), "INSERT INTO api_tokens(token_hash,name,role) VALUES($1,$2,$3)", hash("reader"), "Reader", "reader")
	r := httptest.NewRequest("GET", "/api/account/email-verification", nil)
	r.Header.Set("Authorization", "Bearer reader")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 403)
}

func TestOwnerEmailSingleUseConcurrentConfirmation(t *testing.T) {
	a, _ := ownerMailFixture(t)
	value := newsletterToken()
	a.reserveOwnerVerification(context.Background(), value)
	results := make(chan int, 2)
	var workers sync.WaitGroup
	for range 2 {
		workers.Go(func() {
			results <- request(t, a, "POST", "/api/public/owner-email/verify", Row{"token": value}, false).Code
		})
	}
	workers.Wait()
	close(results)
	counts := map[int]int{}
	for status := range results {
		counts[status]++
	}
	if counts[200] != 1 || counts[400] != 1 {
		t.Fatal(counts)
	}
}

func TestOwnerSignupVerificationDoesNotBlockAccess(t *testing.T) {
	a, messages := ownerMailFixture(t)
	a.DB.Must(context.Background(), "DELETE FROM admins")
	response := request(t, a, "POST", "/api/setup", Row{"email": "owner@example.test", "password": "a-long-test-password"}, false)
	expectStatus(t, response, 201)
	if len(*messages) != 1 || response.Header().Get("Set-Cookie") == "" {
		t.Fatal("signup did not send and allow access")
	}
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.test", "password": "a-long-test-password"}, false), 200)
}

func TestOwnerVerificationDeliveryFailureCanRetry(t *testing.T) {
	a, _ := ownerMailFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		if r.URL.Path == "/v1/newsletter/status" {
			return fixtureResponse(Row{"ready": true}), nil
		}
		return fixtureResponse(Row{"accepted": false}), nil
	})
	expectStatus(t, request(t, a, "POST", "/api/account/email-verification", Row{}, true), 503)
	row := first(a.DB.Must(context.Background(), "SELECT * FROM owner_email_verification"))
	if row["token_hash"] != nil || row["last_requested_at"] != nil {
		t.Fatal("failed delivery left an active token or cooldown")
	}
	a.DB.Must(context.Background(), "DELETE FROM admins")
	result := responseRow(t, request(t, a, "POST", "/api/setup", Row{"email": "owner@example.test", "password": "a-long-test-password"}, false), 201)
	if !result.yes("authenticated") || object(result["emailVerification"]).str("status") != "unavailable" {
		t.Fatal(result)
	}
}

func TestOwnerVerificationMountedLinkAndEscaping(t *testing.T) {
	content := ownerVerificationHTML("https://example.test/myblog", `<script>bad</script>`, strings.Repeat("a", 64))
	containsHTML(t, content, `https://example.test/myblog/admin/verify-email#`, "&lt;script&gt;")
	excludesHTML(t, content, "<script>", "/newsletter/")
}

func TestOwnerVerificationMountedRoutes(t *testing.T) {
	for _, base := range []string{"", "/blog", "/myblog"} {
		t.Run(base, func(t *testing.T) {
			a, messages := ownerMailFixture(t)
			t.Setenv("MARGIN_BASE_PATH", base)
			responseRow(t, request(t, a, "POST", base+"/api/account/email-verification", Row{}, true), 202)
			message := (*messages)[0]
			if message.str("publicUrl") != "https://blog.example.test"+base {
				t.Fatal(message["publicUrl"])
			}
			expectStatus(t, request(t, a, "POST", base+"/api/public/owner-email/verify", Row{"token": message["verificationToken"]}, false), 200)
			if err := a.DB.initialize(); err != nil {
				t.Fatal(err)
			}
			if !a.ownerEmail(context.Background()).yes("verified") {
				t.Fatal("verification did not survive schema initialization")
			}
		})
	}
}
