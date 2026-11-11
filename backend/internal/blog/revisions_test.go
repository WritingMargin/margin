package blog

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func revisionEntries(t *testing.T, a *App, path string) []Row {
	t.Helper()
	response := request(t, a, "GET", path, nil, true)
	expectStatus(t, response, 200)
	var entries []Row
	if err := json.Unmarshal(response.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	return entries
}
func testRevisionLifecycle(t *testing.T, a *App) {
	t.Helper()
	original := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "First draft", "slug": "revisions", "content": "Original words", "tags": []string{"First"}, "seo": Row{"title": "Original search title", "description": "Original description", "image": ""}}, true), 201)
	path := "/api/posts/" + original.str("id")
	latest := responseRow(t, request(t, a, "PUT", path, Row{"revision": original["revision"], "title": "Revised draft", "content": "Revised words"}, true), 200)
	entries := revisionEntries(t, a, path+"/revisions")
	if len(entries) != 2 || entries[0]["revision"] != latest["revision"] || entries[1]["version"] != float64(1) {
		t.Fatal(entries)
	}
	saved := responseRow(t, request(t, a, "GET", path+"/revisions/"+original.str("revision"), nil, true), 200)
	if saved.str("content") != "Original words" || saved.str("title") != "First draft" || object(saved["seo"]).str("title") != "Original search title" {
		t.Fatal(saved)
	}
	expectStatus(t, request(t, a, "GET", path+"/revisions", nil, false), 401)
	expectStatus(t, request(t, a, "GET", path+"/revisions/"+original.str("revision"), nil, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/posts/other/revisions/"+original.str("revision"), nil, true), 404)
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": original["revision"], "content": "Stale write"}, true), 409)
	if len(revisionEntries(t, a, path+"/revisions")) != 2 {
		t.Fatal("conflict added a revision")
	}
	assertRevisionRestore(t, a, path, original, latest, saved)
}
func assertRevisionRestore(t *testing.T, a *App, path string, original, latest, saved Row) {
	t.Helper()
	// Restoring is a new normal save, preserving the intervening version.
	restored := responseRow(t, request(t, a, "PUT", path, Row{"revision": latest["revision"], "title": saved["title"], "content": saved["content"]}, true), 200)
	if restored.str("revision") == original.str("revision") {
		t.Fatal("restore reused concurrency token")
	}
	if len(revisionEntries(t, a, path+"/revisions")) != 3 {
		t.Fatal("restore removed history")
	}
	middle := responseRow(t, request(t, a, "GET", path+"/revisions/"+latest.str("revision"), nil, true), 200)
	if middle.str("content") != "Revised words" {
		t.Fatal(middle)
	}
	expectStatus(t, request(t, a, "DELETE", path, Row{"revision": restored["revision"]}, true), 200)
	expectStatus(t, request(t, a, "GET", path+"/revisions/"+original.str("revision"), nil, true), 404)
}
func TestRevisionLifecycle(t *testing.T) { a, _ := coreFixture(t); testRevisionLifecycle(t, a) }
func TestPostgreSQLRevisionLifecycle(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testRevisionLifecycle(t, a)
}
func TestRevisionBaselineAndPagination(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Existing", "slug": "existing", "content": "Before history"}, true), 201)
	path := "/api/posts/" + post.str("id")
	a.DB.Must(context.Background(), "DELETE FROM post_revisions")
	oldRevision := post.str("revision")
	for i := 0; i < 51; i++ {
		post = responseRow(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "content": fmt.Sprintf("Save %d", i)}, true), 200)
	}
	page := revisionEntries(t, a, path+"/revisions")
	if len(page) != 50 || page[0]["version"] != float64(52) {
		t.Fatal(page)
	}
	rest := revisionEntries(t, a, path+"/revisions?before=3")
	if len(rest) != 2 || rest[1]["revision"] != oldRevision {
		t.Fatal(rest)
	}
	old := responseRow(t, request(t, a, "GET", path+"/revisions/"+oldRevision, nil, true), 200)
	if old.str("content") != "Before history" {
		t.Fatal(old)
	}
	expectStatus(t, request(t, a, "GET", path+"/revisions?before=bad", nil, true), 400)
}
func TestRevisionFailureRollsBackPost(t *testing.T) {
	a, storage := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Kept", "slug": "kept", "content": "Keep this"}, true), 201)
	path := "/api/posts/" + post.str("id")
	before := len(storage.objects)
	_, err := a.DB.SQL.Exec(`CREATE TRIGGER reject_revision BEFORE INSERT ON post_revisions BEGIN SELECT RAISE(ABORT, 'history unavailable'); END`)
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "content": "Must not persist"}, true), 500)
	current := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if current["revision"] != post["revision"] || current.str("content") != "Keep this" || len(storage.objects) != before {
		t.Fatal("save was not atomic", current)
	}
	if len(revisionEntries(t, a, path+"/revisions")) != 1 {
		t.Fatal("failed save added history")
	}
}
