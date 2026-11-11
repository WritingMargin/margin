package blog

import (
	"context"
	"net/http/httptest"
	"testing"
)

func TestUnpublishKeepsStagedWorkAndLiveHistory(t *testing.T) {
	a, _ := coreFixture(t)
	testUnpublishKeepsStagedWork(t, a)
}

func TestPostgreSQLUnpublishKeepsStagedWork(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testUnpublishKeepsStagedWork(t, a)
}

func testUnpublishKeepsStagedWork(t *testing.T, a *App) {
	t.Helper()
	cookie := setupFixtureOwner(t, a)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Published", "slug": "published", "content": "Last live version", "status": "published", "contentType": "guide"}, true), 201)
	path := "/api/posts/" + live.str("id")
	draft := responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "Work in progress", "slug": "working", "title": "Working title"}, true), 200)
	// Even if the live base diverged, withdrawal must preserve both versions.
	live = responseRow(t, request(t, a, "PUT", path, Row{"revision": live["revision"], "content": "Latest live correction"}, true), 200)
	writer := roleToken(t, a, "writer")
	expectStatus(t, tokenRequest(a, writer, "PUT", path, Row{"revision": live["revision"], "status": "draft"}), 403)
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": draft["revision"], "status": "draft"}, true), 409)
	private := responseRow(t, request(t, a, "PUT", path, Row{"revision": live["revision"], "status": "draft"}, true), 200)
	if private.str("status") != "draft" || private.str("content") != "Work in progress" || private.str("draftUrl") != "http://blog.test/draft/post/working" {
		t.Fatal(private)
	}
	if a.savedPostDraft(context.Background(), live.str("id")) != nil {
		t.Fatal("left two working drafts")
	}
	history := responseRow(t, request(t, a, "GET", path+"/revisions/"+live.str("revision"), nil, true), 200)
	if history.str("content") != "Latest live correction" {
		t.Fatal("lost latest live history", history)
	}
	for _, url := range []string{"/post/published", "/api/public/posts/published", "/posts/published.md", "/post/working"} {
		expectStatus(t, request(t, a, "GET", url, nil, false), 404)
	}
	for _, url := range []string{"/rss.xml", "/sitemap.xml", "/llms-full.txt", "/api/public/search?q=Latest"} {
		response := request(t, a, "GET", url, nil, false)
		expectStatus(t, response, 200)
		excludesHTML(t, response.Body.String(), "Latest live correction", "Work in progress", "/post/published")
	}
	preview := ownerSessionRequest(a, cookie, "GET", "/draft/post/working", nil)
	expectStatus(t, preview, 200)
	containsHTML(t, preview.Body.String(), "Work in progress")
}

func TestUnpublishRejectsConcurrentDraftEdit(t *testing.T) {
	a, storage := coreFixture(t)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "content": "Original", "status": "published"}, true), 201)
	path := "/api/posts/" + live.str("id")
	draft := responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": live["revision"], "content": "Old draft"}, true), 200)
	storage.onGet = func(string) {
		storage.onGet = nil
		responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": draft["revision"], "content": "Concurrent draft"}, true), 200)
	}
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": live["revision"], "status": "draft"}, true), 409)
	current := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	staged := responseRow(t, request(t, a, "GET", path+"/draft", nil, true), 200)
	if current.str("status") != "published" || staged.str("content") != "Concurrent draft" {
		t.Fatal(current, staged)
	}
	if len(storage.objects) != 3 {
		t.Fatal("failed unpublish leaked storage")
	}
}

func TestCLIUnpublishWithPendingDraft(t *testing.T) {
	a, _ := coreFixture(t)
	server := httptest.NewServer(a)
	defer server.Close()
	t.Setenv("MARGIN_URL", server.URL)
	t.Setenv("MARGIN_TOKEN", "owner")
	t.Setenv("MARGIN_CONFIG_DIR", t.TempDir())
	live := runCLIResult(t, []string{"create", "--title", "CLI", "--slug", "cli", "--text", "Live", "--publish", "--json"}, "", 0)
	runCLIResult(t, []string{"push", live.str("id"), "--draft", "--file", "-", "--revision", live.str("revision"), "--json"}, "CLI staged body", 0)
	private := runCLIResult(t, []string{"unpublish", live.str("id"), "--revision", live.str("revision"), "--json"}, "", 0)
	if private.str("status") != "draft" || private.str("content") != "CLI staged body" || private.str("draftUrl") == "" {
		t.Fatal(private)
	}
	expectStatus(t, request(t, a, "GET", "/post/cli", nil, false), 404)
}
