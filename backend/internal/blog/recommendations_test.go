package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func relatedIDs(t *testing.T, a *App, slug string) []string {
	t.Helper()
	response := responseRow(t, request(t, a, "GET", "/api/public/posts/"+slug, nil, false), 200)
	ids := []string{}
	for _, value := range response["relatedPosts"].([]any) {
		ids = append(ids, object(value).str("id"))
	}
	return ids
}
func TestRecommendationsLatestAndManual(t *testing.T) {
	a, _ := coreFixture(t)
	oldest := readableFixturePost(t, a, "published", "oldest", "One")
	middle := readableFixturePost(t, a, "published", "middle", "Two")
	latest := readableFixturePost(t, a, "published", "latest", "Three")
	readableFixturePost(t, a, "draft", "secret", "Do not disclose")
	a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1 WHERE id=$2", "2025-01-01T00:00:00.000Z", oldest["id"])
	a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1 WHERE id=$2", "2025-02-01T00:00:00.000Z", middle["id"])
	a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1 WHERE id=$2", "2025-03-01T00:00:00.000Z", latest["id"])
	if encode(relatedIDs(t, a, "oldest")) != encode([]string{latest.str("id"), middle.str("id")}) {
		t.Fatal("latest posts missing or out of order")
	}
	settings := Row{"mode": "manual", "postIds": []string{oldest.str("id"), middle.str("id")}}
	latest = responseRow(t, request(t, a, "PUT", "/api/posts/"+latest.str("id"), Row{"revision": latest["revision"], "recommendations": settings}, true), 200)
	if encode(relatedIDs(t, a, "latest")) != encode(settings["postIds"]) {
		t.Fatal("manual order ignored")
	}
	latest = responseRow(t, request(t, a, "PUT", "/api/posts/"+latest.str("id"), Row{"revision": latest["revision"], "content": "Edited"}, true), 200)
	if encode(latest["recommendations"]) != encode(settings) {
		t.Fatal("normal edit lost manual settings")
	}
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", oldest["id"])
	if encode(relatedIDs(t, a, "latest")) != encode([]string{middle.str("id")}) {
		t.Fatal("withdrawn recommendation exposed or backfilled")
	}
	page := request(t, a, "GET", "/post/latest", nil, false)
	containsHTML(t, page.Body.String(), "A little more to explore", `href="/post/middle"`)
	excludesHTML(t, page.Body.String(), `href="/post/oldest"`, "Do not disclose")
	responseRow(t, request(t, a, "PUT", "/api/posts/"+latest.str("id"), Row{"revision": latest["revision"], "recommendations": Row{"mode": "manual", "postIds": []string{}}}, true), 200)
	if len(relatedIDs(t, a, "latest")) != 0 {
		t.Fatal("manual empty should hide section")
	}
}
func TestRecommendationsRejectInvalidSelection(t *testing.T) {
	a, _ := coreFixture(t)
	source := readableFixturePost(t, a, "draft", "source", "Body")
	other := readableFixturePost(t, a, "published", "other", "Other")
	draft := readableFixturePost(t, a, "draft", "private", "Private")
	for _, ids := range [][]string{{source.str("id")}, {draft.str("id")}, {"not-an-id"}, {uuid()}, {other.str("id"), other.str("id")}, {uuid(), uuid(), uuid()}} {
		expectStatus(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), Row{"revision": source["revision"], "recommendations": Row{"mode": "manual", "postIds": ids}}, true), 400)
	}
	expectStatus(t, request(t, a, "GET", "/api/recommendations", nil, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/posts/"+source.str("id")+"/recommendations", nil, false), 401)
}
func TestSmartRecommendationsSavedAtPublishAndManualWins(t *testing.T) {
	a, _ := coreFixture(t)
	firstPost := readableFixturePost(t, a, "published", "first", "First")
	secondPost := readableFixturePost(t, a, "published", "second", "Second")
	thirdPost := readableFixturePost(t, a, "published", "third", "Third")
	readableFixturePost(t, a, "draft", "private", "NEVER SEND PRIVATE")
	source := readableFixturePost(t, a, "draft", "source", "Source content")
	calls := 0
	selected := []string{thirdPost.str("id"), firstPost.str("id")}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != "https://central.example/v1/generations/recommendations" || r.Header.Get("Idempotency-Key") == "" {
			t.Fatal("wrong AI destination", r.URL)
		}
		var input Row
		json.NewDecoder(r.Body).Decode(&input)
		excludesHTML(t, encode(input), "NEVER SEND PRIVATE", `"slug":"private"`)
		if object(input["source"]).str("content") != "Draft edit" {
			t.Fatal(input)
		}
		return fixtureResponse(Row{"postIds": selected}), nil
	})
	source = responseRow(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), Row{"revision": source["revision"], "content": "Draft edit", "recommendations": Row{"mode": "smart", "postIds": []string{}}}, true), 200)
	if calls != 0 {
		t.Fatal("saving a draft called AI")
	}
	source = responseRow(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), Row{"revision": source["revision"], "status": "published"}, true), 200)
	if calls != 1 || encode(relatedIDs(t, a, "source")) != encode(selected) {
		t.Fatal("Central selection not persisted")
	}
	request(t, a, "GET", "/post/source", nil, false)
	if calls != 1 {
		t.Fatal("reader called AI")
	}
	responseRow(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), Row{"revision": source["revision"], "recommendations": Row{"mode": "manual", "postIds": []string{secondPost.str("id")}}}, true), 200)
	if calls != 1 || encode(relatedIDs(t, a, "source")) != encode([]string{secondPost.str("id")}) {
		t.Fatal("manual selection called AI")
	}
}
func TestSmartFailureDoesNotPublishOrSwitchMethods(t *testing.T) {
	a, _ := coreFixture(t)
	readableFixturePost(t, a, "published", "candidate", "Other")
	source := readableFixturePost(t, a, "draft", "source", "Body")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		response := fixtureResponse(Row{"error": "Service unavailable", "code": "AI_UNAVAILABLE"})
		response.StatusCode = 503
		return response, nil
	})
	input := Row{"revision": source["revision"], "status": "published", "recommendations": Row{"mode": "smart", "postIds": []string{}}}
	expectStatus(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), input, true), 503)
	if a.getPost(context.Background(), source.str("id")).str("status") != "draft" {
		t.Fatal("failure published post")
	}
	expectStatus(t, request(t, a, "GET", "/api/public/posts/source", nil, false), 404)
	t.Setenv("AI_SERVICE_TOKEN", "")
	got := responseRow(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), input, true), 503)
	if got.str("code") != "ACCOUNT_REQUIRED" {
		t.Fatal(got)
	}
}
func TestSmartRecommendationsRejectInvalidSelections(t *testing.T) {
	a, _ := coreFixture(t)
	candidate := readableFixturePost(t, a, "published", "candidate", "Other")
	source := readableFixturePost(t, a, "draft", "source", "Body")
	for _, ids := range []any{nil, "invalid", []string{uuid()}, []string{candidate.str("id"), candidate.str("id")}, []string{uuid(), uuid(), uuid()}} {
		a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return fixtureResponse(Row{"postIds": ids}), nil })
		expectStatus(t, request(t, a, "PUT", "/api/posts/"+source.str("id"), Row{"revision": source["revision"], "status": "published", "recommendations": Row{"mode": "smart", "postIds": []string{}}}, true), 502)
	}
	if a.getPost(context.Background(), source.str("id")).str("revision") != source.str("revision") {
		t.Fatal("failed selection changed revision")
	}
}
func TestOrdinaryRecommendationsNeverContactCentral(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("JEV_API_KEY", "ignored-provider-key")
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("ordinary publishing contacted AI")
		return nil, nil
	})
	readableFixturePost(t, a, "published", "first", "One")
	readableFixturePost(t, a, "published", "second", "Two")
	if len(relatedIDs(t, a, "second")) != 1 {
		t.Fatal("latest-post recommendations missing")
	}
}
