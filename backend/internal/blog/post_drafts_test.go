package blog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDraftPreviewURLAndSessionAccess(t *testing.T) {
	a, _, _ := publicFixture(t)
	cookie := setupFixtureOwner(t, a)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("private-preview"), true), 201)
	if post.str("draftUrl") != "http://blog.test/draft/post/private-preview" {
		t.Fatal(post)
	}
	path := "/api/posts/" + post.str("id")
	post = responseRow(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "slug": "new-preview", "content": "PRIVATE PREVIEW BODY", "seo": Row{"title": "", "description": "", "image": "", "noindex": false}}, true), 200)
	if post.str("draftUrl") != "http://blog.test/draft/post/new-preview" {
		t.Fatal(post)
	}
	for _, owner := range []bool{false, true} {
		response := request(t, a, "GET", "/draft/post/new-preview", nil, owner)
		expectStatus(t, response, 401)
		containsHTML(t, response.Body.String(), "Sign in as admin")
		excludesHTML(t, response.Body.String(), "PRIVATE PREVIEW BODY")
	}
	response := ownerSessionRequest(a, cookie, "GET", "/draft/post/new-preview", nil)
	expectStatus(t, response, 200)
	containsHTML(t, response.Body.String(), "PRIVATE PREVIEW BODY", "Draft preview", `"preview":true`)
	if response.Header().Get("X-Robots-Tag") != "noindex, nofollow" || !strings.Contains(response.Header().Get("Cache-Control"), "no-store") {
		t.Fatal(response.Header())
	}
	expectStatus(t, ownerSessionRequest(a, cookie, "GET", "/draft/post/private-preview", nil), 404)
	expectStatus(t, request(t, a, "GET", "/post/new-preview", nil, false), 404)
	response = ownerSessionRequest(a, cookie, "HEAD", "/draft/post/new-preview", nil)
	expectStatus(t, response, 200)
	if response.Body.Len() != 0 {
		t.Fatal("HEAD leaked body")
	}
	a.DB.Must(context.Background(), "DELETE FROM sessions")
	expectStatus(t, ownerSessionRequest(a, cookie, "GET", "/draft/post/new-preview", nil), 401)
}

func TestStagedDraftLifecycle(t *testing.T) {
	for _, kind := range []string{"article", "guide"} {
		t.Run(kind, func(t *testing.T) {
			a, _ := coreFixture(t)
			testStagedDraftLifecycle(t, a, kind)
		})
	}
}

func TestStagedDraftConflictsAndDiscard(t *testing.T) {
	a, _ := coreFixture(t)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "content": "Original", "status": "published"}, true), 201)
	path := "/api/posts/" + live.str("id")
	reader, writer := roleToken(t, a, "reader"), roleToken(t, a, "writer")
	expectStatus(t, tokenRequest(a, reader, "PUT", path+"/draft", Row{"revision": live["revision"]}), 403)
	expectStatus(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"content": "missing revision"}), 428)
	expectStatus(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": live["revision"], "status": "published"}), 400)
	draft := responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "Staged"}), 200)
	live = responseRow(t, request(t, a, "PUT", path, Row{"revision": live["revision"], "content": "Concurrent live edit"}, true), 200)
	for _, operation := range []struct{ method, suffix string }{{"PUT", "/draft"}, {"POST", "/draft/publish"}} {
		expectStatus(t, request(t, a, operation.method, path+operation.suffix, Row{"revision": draft["revision"]}, true), 409)
	}
	retained := responseRow(t, request(t, a, "GET", path+"/draft", nil, true), 200)
	if retained.str("content") != "Staged" {
		t.Fatal(retained)
	}
	expectStatus(t, tokenRequest(a, writer, "DELETE", path+"/draft", Row{"revision": live["revision"]}), 409)
	expectStatus(t, tokenRequest(a, writer, "DELETE", path+"/draft", Row{"revision": draft["revision"]}), 200)
	base := responseRow(t, request(t, a, "GET", path+"/draft", nil, true), 200)
	if base.str("content") != "Concurrent live edit" || base.str("revision") != live.str("revision") {
		t.Fatal(base)
	}
}

func TestDraftPreviewMountedURLAndReaderDenied(t *testing.T) {
	a, _ := coreFixture(t)
	cookie := setupFixtureOwner(t, a)
	reader := roleToken(t, a, "reader")
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	t.Setenv("PUBLIC_URL", "https://stories.example.test/journal")
	cookie.Name = sessionCookieName("margin_session")
	post := responseRow(t, request(t, a, "POST", "/journal/api/posts", draftInput("mounted"), true), 201)
	if post.str("draftUrl") != "https://stories.example.test/journal/draft/post/mounted" {
		t.Fatal(post)
	}
	response := ownerSessionRequest(a, cookie, "GET", "/journal/draft/post/mounted", nil)
	expectStatus(t, response, 200)
	r := httptest.NewRequest(http.MethodGet, "http://blog.test/journal/draft/post/mounted", nil)
	r.Header.Set("Authorization", "Bearer "+reader)
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 401)
}

func TestMCPStagedDraftWorkflow(t *testing.T) {
	a, _ := coreFixture(t)
	writer := mcpTestSession(t, a, roleToken(t, a, "writer"))
	publisher := mcpTestSession(t, a, roleToken(t, a, "publisher"))
	draft := mcpCall(t, writer, "create_post", Row{"input": draftInput("mcp-draft")}, 201)
	if !strings.Contains(draft.str("draftUrl"), "/draft/post/mcp-draft") {
		t.Fatal(draft)
	}
	live := mcpCall(t, publisher, "update_post", Row{"action": "publish", "id": draft["id"], "input": Row{"revision": draft["revision"]}}, 200)
	initial := mcpCall(t, writer, "get_post", Row{"view": "draft", "id": live["id"]}, 200)
	staged := mcpCall(t, writer, "update_post", Row{"action": "save_draft", "id": live["id"], "input": Row{"revision": initial["revision"], "content": "MCP staged"}}, 200)
	read := mcpCall(t, writer, "get_post", Row{"id": live["id"]}, 200)
	if read.str("content") == "MCP staged" {
		t.Fatal("MCP changed live content")
	}
	published := mcpCall(t, publisher, "update_post", Row{"fields": []string{"content", "revision"}, "action": "publish", "id": live["id"], "input": Row{"revision": staged["revision"]}}, 200)
	if published.str("content") != "MCP staged" {
		t.Fatal(published)
	}
}

func assertDraftPreservesPublicPost(t *testing.T, a *App, path string, live Row) {
	t.Helper()
	read := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if read.str("content") != "ORIGINAL LIVE BODY" || read.str("revision") != live.str("revision") {
		t.Fatal("live changed", read)
	}
	for _, public := range []string{"/post/live-story", "/api/public/posts/live-story", "/rss.xml", "/sitemap.xml", "/llms-full.txt", "/posts/live-story.md", "/api/public/search?q=STAGED"} {
		response := request(t, a, "GET", public, nil, false)
		expectStatus(t, response, 200)
		excludesHTML(t, response.Body.String(), "STAGED SECRET", "staged-slug", "Staged title")
	}
}

func assertPartialDraft(t *testing.T, draft Row) {
	t.Helper()
	if draft.str("content") != "STAGED SECRET BODY" || draft.str("slug") != "staged-slug" || draft.str("tableOfContents") != "top" {
		t.Fatal("partial edit lost draft fields", draft)
	}
}

func assertPublishedDraft(t *testing.T, published Row) {
	t.Helper()
	if published.str("content") != "STAGED SECRET BODY" || published.str("status") != "published" || published.str("excerpt") != "Draft excerpt" || published.str("draftUrl") != "" {
		t.Fatal(published)
	}
}

func TestStagedDraftPublishDoesNotConsumeConcurrentEdit(t *testing.T) {
	a, storage := coreFixture(t)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "race", "content": "Live body", "status": "published"}, true), 201)
	path := "/api/posts/" + live.str("id")
	staged := responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "Reviewed draft"}, true), 200)
	var newer Row
	storage.onGet = func(string) {
		storage.onGet = nil
		newer = responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": staged["revision"], "content": "Concurrent draft edit"}, true), 200)
	}
	expectStatus(t, request(t, a, "POST", path+"/draft/publish", Row{"revision": staged["revision"]}, true), 409)
	current := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	draft := responseRow(t, request(t, a, "GET", path+"/draft", nil, true), 200)
	if current.str("revision") != live.str("revision") || draft.str("revision") != newer.str("revision") || draft.str("content") != "Concurrent draft edit" {
		t.Fatal(current, draft)
	}
	if len(storage.objects) != 3 {
		t.Fatal("failed publication leaked content storage", len(storage.objects))
	}
}

func TestDraftPreviewRechecksAfterStorageRead(t *testing.T) {
	a, storage := coreFixture(t)
	cookie := setupFixtureOwner(t, a)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("recheck"), true), 201)
	storage.onGet = func(string) {
		storage.onGet = nil
		a.DB.Must(context.Background(), "UPDATE posts SET status='published' WHERE id=$1", post["id"])
	}
	expectStatus(t, ownerSessionRequest(a, cookie, "GET", "/draft/post/recheck", nil), 404)
}

func TestStagedDraftSlugReservationAndDeletion(t *testing.T) {
	a, storage := coreFixture(t)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "content": "Original", "status": "published"}, true), 201)
	path := "/api/posts/" + live.str("id")
	staged := responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": live["revision"], "slug": "reserved"}, true), 200)
	expectStatus(t, request(t, a, "POST", "/api/posts", draftInput("reserved"), true), 409)
	if len(storage.objects) != 2 {
		t.Fatal("failed writes leaked objects", len(storage.objects))
	}
	other := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Other", "slug": "other", "content": "Other", "status": "published"}, true), 201)
	otherPath := "/api/posts/" + other.str("id")
	expectStatus(t, request(t, a, "PUT", otherPath+"/draft", Row{"revision": other["revision"], "slug": "reserved"}, true), 409)
	expectStatus(t, request(t, a, "PUT", path+"/draft", Row{"revision": staged["revision"], "slug": "other"}, true), 409)
	expectStatus(t, request(t, a, "DELETE", path, Row{"revision": live["revision"]}, true), 200)
	if a.savedPostDraft(context.Background(), live.str("id")) != nil {
		t.Fatal("deletion left a draft")
	}
	responseRow(t, request(t, a, "POST", "/api/posts", draftInput("reserved"), true), 201)
}

func TestOrdinaryDraftEndpoints(t *testing.T) {
	a, _ := coreFixture(t)
	writer := roleToken(t, a, "writer")
	draft := responseRow(t, tokenRequest(a, writer, "POST", "/api/posts", draftInput("ordinary")), 201)
	path := "/api/posts/" + draft.str("id") + "/draft"
	draft = responseRow(t, tokenRequest(a, writer, "PUT", path, Row{"revision": draft["revision"], "content": "Updated ordinary draft"}), 200)
	if draft.str("draftUrl") != "http://blog.test/draft/post/ordinary" {
		t.Fatal(draft)
	}
	expectStatus(t, tokenRequest(a, writer, "DELETE", path, Row{"revision": draft["revision"]}), 404)
	published := responseRow(t, request(t, a, "POST", path+"/publish", Row{"revision": draft["revision"]}, true), 200)
	if published.str("content") != "Updated ordinary draft" {
		t.Fatal(published)
	}
}

func TestOAuthStagedDraftCapabilities(t *testing.T) {
	a := oauthFixture(t)
	_, draftTokens := oauthSelectedTokens(t, a, "content:draft", []string{"content:draft"}, "https://blog.test/api")
	_, publishTokens := oauthSelectedTokens(t, a, "content:publish", []string{"content:publish"}, "https://blog.test/api")
	writer, publisher := draftTokens.str("access_token"), publishTokens.str("access_token")
	live := responseRow(t, tokenRequest(a, publisher, "POST", "/api/posts", Row{"title": "Scoped", "slug": "scoped", "content": "Live", "status": "published"}), 201)
	path := "/api/posts/" + live.str("id")
	expectStatus(t, tokenRequest(a, publisher, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "No draft capability"}), 403)
	draft := responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "Scoped draft"}), 200)
	expectStatus(t, tokenRequest(a, writer, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}), 403)
	expectStatus(t, tokenRequest(a, publisher, "DELETE", path+"/draft", Row{"revision": draft["revision"]}), 403)
	published := responseRow(t, tokenRequest(a, publisher, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}), 200)
	if published.str("content") != "Scoped draft" {
		t.Fatal(published)
	}
}

func TestPostgreSQLStagedDraftLifecycle(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testStagedDraftLifecycle(t, a, "guide")
}

func testStagedDraftLifecycle(t *testing.T, a *App, kind string) {
	t.Helper()
	cookie := setupFixtureOwner(t, a)
	writer := roleToken(t, a, "writer")
	input := draftInput("live-story")
	input["status"], input["content"], input["contentType"] = "published", "ORIGINAL LIVE BODY", kind
	live := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	path := "/api/posts/" + live.str("id")
	initial := responseRow(t, tokenRequest(a, writer, "GET", path+"/draft", nil), 200)
	if initial.str("revision") != live.str("revision") || initial.str("baseRevision") != live.str("revision") {
		t.Fatal(initial)
	}
	draft := responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": initial["revision"], "content": "STAGED SECRET BODY", "title": "Staged title", "slug": "staged-slug", "tableOfContents": "top"}), 200)
	if draft.str("status") != "draft" || draft.str("draftUrl") != "http://blog.test/draft/post/staged-slug" || draft.str("contentType") != kind {
		t.Fatal(draft)
	}
	assertDraftPreservesPublicPost(t, a, path, live)
	preview := ownerSessionRequest(a, cookie, "GET", "/draft/post/staged-slug", nil)
	expectStatus(t, preview, 200)
	containsHTML(t, preview.Body.String(), "STAGED SECRET BODY", "Staged title")
	expectStatus(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": initial["revision"], "content": "STALE"}), 409)
	draft = responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": draft["revision"], "excerpt": "Draft excerpt"}), 200)
	assertPartialDraft(t, draft)
	expectStatus(t, tokenRequest(a, writer, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}), 403)
	published := responseRow(t, request(t, a, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}, true), 200)
	assertPublishedDraft(t, published)
	expectStatus(t, request(t, a, "GET", "/post/live-story", nil, false), 404)
	containsHTML(t, request(t, a, "GET", "/post/staged-slug", nil, false).Body.String(), "STAGED SECRET BODY")
	expectStatus(t, ownerSessionRequest(a, cookie, "GET", "/draft/post/staged-slug", nil), 404)
	expectStatus(t, request(t, a, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}, true), 409)
}
