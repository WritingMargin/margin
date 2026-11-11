package blog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const researchTestURL = "https://doi.org/10.1234/margin"

func researchWritingFixture(t *testing.T, a *App, actions []Row) {
	t.Helper()
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		input := object(payload["input"])
		if !input.yes("canSaveResearch") || !input.yes("researchMode") || input["postId"] != nil {
			t.Fatalf("unexpected tool capabilities: %v", input)
		}
		return fixtureResponse(Row{"plan": writingTestPlan(), "researchActions": actions, "researchSources": []Row{
			{"url": researchTestURL, "title": "Evidence", "excerpt": "Study abstract"},
			{"url": "javascript:alert(1)", "title": "Invalid", "excerpt": ""},
		}}), nil
	})
}
func writingResearchRequest(t *testing.T, a *App, key, postID string) *httptest.ResponseRecorder {
	t.Helper()
	input := Row{"mode": "ideas", "brief": "Find a paper, save the source and keep a private note.", "postId": postID, "researchMode": true}
	req := httptest.NewRequest("POST", "http://blog.test/api/ai/writing", strings.NewReader(encode(input)))
	req.Header.Set("Authorization", "Bearer owner")
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, req)
	return w
}
func TestWritingResearchSavesOnceAndStaysPrivate(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-agent"), true), 201)
	id := post.str("id")
	key := uuid()
	researchWritingFixture(t, a, []Row{{"kind": "save_source", "url": researchTestURL}, {"kind": "save_thinking_note", "title": "Follow up", "body": "Compare the samples."}})
	a.DB.Must(t.Context(), "INSERT INTO research_sources(id,post_id,url,title,excerpt) VALUES($1,$2,$3,$4,$5)", uuid(), id, researchTestURL, "Title chosen by the author", "Previously saved excerpt.")
	var previous string
	for range 2 {
		result := responseRow(t, writingResearchRequest(t, a, key, id), 200)
		if len(result["researchSources"].([]any)) != 1 || object(result["researchSaved"])["notes"] != float64(1) {
			t.Fatal(result)
		}
		saved := object(result["researchSaved"])
		assertSavedArtifacts(t, saved)
		if previous != "" && previous != encode(saved) {
			t.Fatal("retry changed saved records")
		}
		previous = encode(saved)
	}
	if len(a.DB.Must(t.Context(), "SELECT id FROM research_sources WHERE post_id=$1", id)) != 1 || len(a.DB.Must(t.Context(), "SELECT id FROM writing_notes WHERE post_id=$1", id)) != 1 {
		t.Fatal("research was lost or duplicated on retry")
	}
	if a.getPost(t.Context(), id).str("revision") != post.str("revision") {
		t.Fatal("assistant modified the article")
	}
}
func assertSavedArtifacts(t *testing.T, saved Row) {
	t.Helper()
	source := object(saved["sourceItems"].([]any)[0])
	note := object(saved["noteItems"].([]any)[0])
	if source.str("title") != "Title chosen by the author" || source.str("excerpt") != "Previously saved excerpt." || source.str("url") != researchTestURL {
		t.Fatal(source)
	}
	if note.str("id") == "" || note.str("title") != "Follow up" || note.str("body") != "Compare the samples." {
		t.Fatal(note)
	}
}
func TestWritingResearchRejectsUnverifiedActionAtomically(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-rollback"), true), 201)
	researchWritingFixture(t, a, []Row{{"kind": "save_thinking_note", "title": "Private note", "body": "Must be rolled back."}, {"kind": "save_source", "url": "https://example.com/invented"}})
	expectStatus(t, writingResearchRequest(t, a, uuid(), post.str("id")), 502)
	if len(a.DB.Must(t.Context(), "SELECT id FROM writing_notes")) != 0 {
		t.Fatal("saved partial research actions")
	}
}
func TestWritingResearchRequiresOptInAndASavedPost(t *testing.T) {
	a, _ := coreFixture(t)
	input := Row{"mode": "questions", "brief": "Ask a question", "postId": uuid()}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 400)
	input["researchMode"] = true
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 404)
	delete(input, "postId")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if object(payload["input"]).yes("canSaveResearch") {
			t.Fatal("unsaved draft can mutate private storage")
		}
		return fixtureResponse(Row{"plan": writingTestPlan(), "researchActions": []Row{{"kind": "save_thinking_note", "title": "Private note", "body": "Should not save."}}}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	if got["researchSaved"] != nil || len(a.DB.Must(t.Context(), "SELECT id FROM writing_notes")) != 0 {
		t.Fatal(got)
	}
}

func TestWritingResearchNeedsOAuthDraftPermission(t *testing.T) {
	a := oauthFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-permission"), true), 201)
	input := Row{"mode": "ideas", "brief": "Save a note", "postId": post.str("id"), "researchMode": true}
	scopes := "administration:manage content:draft"
	_, limited := oauthSelectedTokens(t, a, scopes, []string{"administration:manage"}, "https://blog.test/api")
	expectStatus(t, tokenRequest(a, limited.str("access_token"), "POST", "/api/ai/writing", input), 403)
	_, allowed := oauthSelectedTokens(t, a, scopes, []string{"administration:manage", "content:draft"}, "https://blog.test/api")
	researchWritingFixture(t, a, []Row{{"kind": "save_thinking_note", "title": "Remember", "body": "A private note."}})
	expectStatus(t, tokenRequest(a, allowed.str("access_token"), "POST", "/api/ai/writing", input), 200)
}

func TestWritingResearchSavePreservesSelectedMetadata(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("selected-research"), true), 201)
	link := "https://doi.org/10.1000/a(2025)"
	researchWritingFixture(t, a, []Row{{"kind": "save_source", "url": link}})
	input := Row{"mode": "ideas", "brief": "Save this paper: " + link, "researchMode": true, "postId": post.str("id"), "researchSources": []Row{{"url": link, "title": "Selected paper title", "excerpt": "Selected abstract."}}}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	row := first(a.DB.Must(t.Context(), "SELECT title,excerpt FROM research_sources WHERE post_id=$1 AND url=$2", post.str("id"), link))
	if row.str("title") != "Selected paper title" || row.str("excerpt") != "Selected abstract." {
		t.Fatal(row)
	}
}
