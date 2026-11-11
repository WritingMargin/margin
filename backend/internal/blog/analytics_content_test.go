package blog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
)

func testAnalyticsContent(t *testing.T, a *App) {
	t.Helper()
	ctx := context.Background()
	for i, label := range analyticsContentTypes[:8] {
		post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": label, "slug": "content-" + labelSlug(i), "content": "An article to read.", "status": "published", "tags": []string{label, "Shared", "shared"}}, true), 201)
		batch := analyticsPayload(post)
		batch["activeMs"] = (i + 1) * 1000
		analyticsSubmit(t, a, batch)
		a.DB.Must(ctx, `INSERT INTO analytics_classifications(post_id,revision,content_type,writing_style) VALUES($1,$2,$3,$4)`, post["id"], post["revision"], label, analyticsWritingStyles[i])
	}
	// Homepage time never contributes to content classification or tags.
	analyticsSubmit(t, a, analyticsPayload(nil))
	report := responseRow(t, request(t, a, "GET", "/api/analytics?pageSize=2", nil, true), 200)
	tag := object(report["tags"].([]any)[0])
	if tag.str("label") != "shared" {
		t.Fatal(tag)
	}
	assertAnalyticsNumber(t, tag, "views", 8)
	assertAnalyticsNumber(t, tag, "articles", 8)
	assertAnalyticsNumber(t, tag, "active_ms", 36000)
	assertAnalyticsNumber(t, object(report["classificationCoverage"]), "classified_views", 8)
	assertAnalyticsNumber(t, object(report["classificationCoverage"]), "views", 8)
	for _, key := range []string{"tags", "contentTypes", "writingStyles"} {
		next := responseRow(t, request(t, a, "GET", "/api/analytics?pageSize=2&"+key+"Offset=2", nil, true), 200)
		if len(next[key].([]any)) != 2 || encode(report[key]) == encode(next[key]) {
			t.Fatal("content pagination failed", key)
		}
	}
	a.DB.Must(ctx, `UPDATE analytics_visits SET revision='older' WHERE post_id IS NOT NULL`)
	report = responseRow(t, request(t, a, "GET", "/api/analytics", nil, true), 200)
	types := report["contentTypes"].([]any)
	if len(types) != 1 || object(types[0]).str("label") != "Unclassified" {
		t.Fatal(types)
	}
	assertAnalyticsNumber(t, object(report["classificationCoverage"]), "classified_views", 0)
	home := responseRow(t, request(t, a, "GET", "/api/analytics?page=home", nil, true), 200)
	if len(home["tags"].([]any)) != 0 || len(home["writingStyles"].([]any)) != 0 {
		t.Fatal("homepage leaked into content")
	}
}
func labelSlug(i int) string            { return string(rune('a' + i)) }
func TestAnalyticsContent(t *testing.T) { a, _ := coreFixture(t); testAnalyticsContent(t, a) }
func TestAnalyticsPostgresContent(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testAnalyticsContent(t, a)
}

func TestAnalyticsClassificationCacheAndRecovery(t *testing.T) {
	a, post := interactionFixture(t)
	calls := 0
	var firstID string
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		if r.URL.String() != "https://central.example/v1/generations/classification" {
			t.Fatal(r.URL)
		}
		assertClassificationInput(t, r, post)
		calls++
		id := r.Header.Get("Idempotency-Key")
		if calls == 1 {
			firstID = id
			return nil, errors.New("lost response")
		}
		if id != firstID {
			t.Fatal("retry changed paid generation ID")
		}
		return fixtureResponse(Row{"contentType": "Essay", "writingStyle": "Reflective"}), nil
	})
	input := Row{"postId": post["id"], "revision": post["revision"]}
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", input, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", input, true), 503)
	for range 2 {
		result := responseRow(t, request(t, a, "POST", "/api/analytics/classification", input, true), 200)
		if result.str("content_type") != "Essay" {
			t.Fatal(result)
		}
	}
	if calls != 2 {
		t.Fatal("cached classification charged again", calls)
	}
	config := responseRow(t, request(t, a, "GET", "/api/analytics/classification", nil, true), 200)
	assertAnalyticsNumber(t, config, "pending", 0)
	input["revision"] = "stale"
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", input, true), 409)
}
func TestAnalyticsClassificationFailureAllowsNewAttempt(t *testing.T) {
	a, post := interactionFixture(t)
	calls := 0
	firstID := ""
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		calls++
		if calls == 1 {
			firstID = r.Header.Get("Idempotency-Key")
			response := fixtureResponse(Row{"error": "Failure, credits returned.", "code": "AI_GENERATION_FAILED"})
			response.StatusCode = 503
			return response, nil
		}
		if r.Header.Get("Idempotency-Key") == firstID {
			t.Fatal("replayed failed generation")
		}
		return fixtureResponse(Row{"contentType": "Tutorial", "writingStyle": "Instructional"}), nil
	})
	input := Row{"postId": post["id"], "revision": post["revision"]}
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", input, true), 503)
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", input, true), 200)
}
func TestAnalyticsClassificationRejectsUnknownLabels(t *testing.T) {
	a, post := interactionFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		return fixtureResponse(Row{"contentType": "Invented", "writingStyle": "Reflective"}), nil
	})
	expectStatus(t, request(t, a, "POST", "/api/analytics/classification", Row{"postId": post["id"], "revision": post["revision"]}, true), 502)
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_classifications")) != 0 {
		t.Fatal("invalid labels persisted")
	}
}

func assertClassificationInput(t *testing.T, r *http.Request, post Row) {
	t.Helper()
	input := Row{}
	if json.NewDecoder(r.Body).Decode(&input) != nil || input.str("title") != post.str("title") || input.str("content") == "" {
		t.Fatal(input)
	}
}

func TestAnalyticsClassificationEligibility(t *testing.T) {
	a, post := interactionFixture(t)
	check := func(page string, published, pending int) {
		t.Helper()
		result := responseRow(t, request(t, a, "GET", "/api/analytics/classification?page="+page, nil, true), 200)
		assertAnalyticsNumber(t, result, "published", float64(published))
		assertAnalyticsNumber(t, result, "pending", float64(pending))
		if len(result["queue"].([]any)) != pending {
			t.Fatal(result)
		}
	}
	check("", 1, 1)
	check("home", 0, 0)
	a.DB.Must(context.Background(), `INSERT INTO analytics_classifications(post_id,revision,content_type,writing_style) VALUES($1,$2,'Essay','Reflective')`, post["id"], post["revision"])
	check(post.str("id"), 1, 0)
	a.DB.Must(context.Background(), `UPDATE posts SET status='draft' WHERE id=$1`, post["id"])
	check("", 0, 0)
	check(post.str("id"), 0, 0)
}
