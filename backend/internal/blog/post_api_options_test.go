package blog

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"
)

func responseRows(t *testing.T, w *httptest.ResponseRecorder) []Row {
	t.Helper()
	expectStatus(t, w, 200)
	var rows []Row
	if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestPostFieldSelectionAndRevisionUpdates(t *testing.T) {
	a, _ := coreFixture(t)
	created := responseRow(t, request(t, a, "POST", "/api/posts?fields=id,revision", draftInput("selected"), true), 201)
	assertFieldKeys(t, created, "id", "revision")
	path := "/api/posts/" + created.str("id")
	item := responseRow(t, request(t, a, "GET", path+"?fields=title,content", nil, true), 200)
	assertSelectedRow(t, item, Row{"title": "Test article", "content": "A searchable article"})
	updated := responseRow(t, request(t, a, "PUT", path+"?fields=id,status,revision", Row{"revision": created["revision"], "status": "published"}, true), 200)
	assertFieldKeys(t, updated, "id", "status", "revision")
	if updated.str("revision") == created.str("revision") {
		t.Fatal(updated)
	}
	for _, url := range []string{"/api/posts?fields=id,title", "/api/public/posts?fields=id,title", "/api/posts/search?q=searchable&fields=id,title", "/api/public/search?q=searchable&fields=id,title"} {
		rows := responseRows(t, request(t, a, "GET", url, nil, true))
		if len(rows) != 1 {
			t.Fatal(url, rows)
		}
		assertSelectedRow(t, rows[0], Row{"id": created["id"], "title": "Test article"})
	}
	item = responseRow(t, request(t, a, "GET", "/api/public/posts/selected?fields=title", nil, false), 200)
	assertSelectedRow(t, item, Row{"title": "Test article"})
	rows := responseRows(t, request(t, a, "GET", path+"/revisions?fields=revision,status", nil, true))
	if len(rows) != 2 {
		t.Fatal(rows)
	}
	assertFieldKeys(t, rows[0], "revision", "status")
	item = responseRow(t, request(t, a, "GET", path+"/revisions/"+created.str("revision")+"?fields=content,status", nil, true), 200)
	assertSelectedRow(t, item, Row{"content": "A searchable article", "status": "draft"})
	full := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	assertFieldKeys(t, full, "id", "title", "slug", "excerpt", "status", "tags", "cover", "coverMode", "seo", "createdAt", "updatedAt", "revision", "content", "recommendations", "author", "featured", "tableOfContents", "contentType", "publicationState", "warnings")
}

func TestInvalidFieldsRejectBeforeMutationAndPreserveErrors(t *testing.T) {
	a, _ := coreFixture(t)
	for _, fields := range []string{"", "unknown", "content_key", "id,", "*", "seo.title", "id&fields=title"} {
		result := responseRow(t, request(t, a, "POST", "/api/posts?fields="+fields, draftInput("invalid"), true), 400)
		if result.str("code") != "INVALID_FIELDS" {
			t.Fatal(result)
		}
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM posts")) != 0 {
		t.Fatal("invalid field selection created a post")
	}
	expectStatus(t, request(t, a, "GET", "/api/posts?fields=id", nil, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/tokens?fields=id", nil, true), 400)
	expectStatus(t, request(t, a, "GET", "/api/posts?fields=content", nil, true), 400)
	rows := responseRows(t, request(t, a, "GET", "/api/posts?fields=id", nil, true))
	if rows == nil || len(rows) != 0 {
		t.Fatal("empty list should be []", rows)
	}
}

func TestPostStatusFilteringAndArchivePrivacy(t *testing.T) {
	a, _ := coreFixture(t)
	posts := map[string]Row{}
	for _, status := range []string{"draft", "published", "archived"} {
		input := draftInput(status)
		input["status"] = status
		posts[status] = responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	}
	for _, prefix := range []string{"/api/posts?", "/api/posts/search?q=searchable&"} {
		for _, status := range []string{"draft", "published", "archived", "all"} {
			rows := responseRows(t, request(t, a, "GET", prefix+"status="+status+"&fields=id,status", nil, true))
			assertStatusRows(t, rows, status)
		}
		for _, invalid := range []string{"", "deleted", "PUBLISHED", "draft&status=published"} {
			expectStatus(t, request(t, a, "GET", prefix+"status="+invalid, nil, true), 400)
		}
	}
	assertStatusRows(t, responseRows(t, request(t, a, "GET", "/api/posts", nil, true)), "all")
	assertStatusRows(t, responseRows(t, request(t, a, "GET", "/api/public/posts?status=all", nil, false)), "published")
	expectStatus(t, request(t, a, "GET", "/api/public/posts?status=archived", nil, false), 400)
	expectStatus(t, request(t, a, "GET", "/api/public/search?q=searchable&status=draft", nil, false), 400)
	for _, path := range []string{"/api/public/posts/archived?fields=content", "/post/archived", "/posts/archived.md", "/read/archived"} {
		expectStatus(t, request(t, a, "GET", path, nil, false), 404)
	}
	archived := posts["archived"]
	restored := responseRow(t, request(t, a, "PUT", "/api/posts/"+archived.str("id"), Row{"revision": archived["revision"], "status": "published"}, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/archived", nil, false), 200)
	responseRow(t, request(t, a, "PUT", "/api/posts/"+archived.str("id"), Row{"revision": restored["revision"], "status": "archived"}, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/archived", nil, false), 404)
}

func assertStatusRows(t *testing.T, rows []Row, status string) {
	t.Helper()
	want := 1
	if status == "all" {
		want = 3
	}
	if len(rows) != want {
		t.Fatal(status, rows)
	}
	for _, row := range rows {
		if status != "all" && row.str("status") != status {
			t.Fatal(status, row)
		}
	}
}

func TestMountedPostOptionsAndRoleRestrictions(t *testing.T) {
	a, _ := coreFixture(t)
	key := roleToken(t, a, "writer")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	created := responseRow(t, tokenRequest(a, key, "POST", "/blog/api/posts?fields=id,revision", draftInput("mounted")), 201)
	rows := responseRows(t, tokenRequest(a, key, "GET", "/blog/api/posts?status=draft&fields=id", nil))
	if len(rows) != 1 || len(rows[0]) != 1 {
		t.Fatal(rows)
	}
	expectStatus(t, tokenRequest(a, key, "PUT", "/blog/api/posts/"+created.str("id"), Row{"revision": created["revision"], "status": "published"}), 403)
}

func assertSelectedRow(t *testing.T, actual, expected Row) {
	t.Helper()
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("got %#v, want %#v", actual, expected)
	}
}
func assertFieldKeys(t *testing.T, row Row, fields ...string) {
	t.Helper()
	if len(row) != len(fields) {
		t.Fatal(row, fields)
	}
	for _, field := range fields {
		if _, ok := row[field]; !ok {
			t.Fatal("missing field", field, row)
		}
	}
}
