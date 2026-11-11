package blog

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Browser fixtures need both a session and an owner: revisions record the owner.
// Going through setup keeps previews consistent with a real workspace.
func setupFixtureOwner(t *testing.T, a *App) *http.Cookie {
	t.Helper()
	response := request(t, a, "POST", "/api/setup", Row{"email": "preview@example.test", "password": token()}, false)
	expectStatus(t, response, 201)
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one owner session cookie, got %d", len(cookies))
	}
	return cookies[0]
}

func ownerSessionRequest(a *App, cookie *http.Cookie, method, path string, input Row) *httptest.ResponseRecorder {
	data := ""
	if input != nil {
		data = encode(input)
	}
	r := httptest.NewRequest(method, "http://blog.test"+path, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "http://blog.test")
	r.AddCookie(cookie)
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}

func TestOwnerSessionCanSaveAndReloadPost(t *testing.T) {
	a, _ := coreFixture(t)
	cookie := setupFixtureOwner(t, a)
	created := responseRow(t, ownerSessionRequest(a, cookie, "POST", "/api/posts", Row{"title": "Browser draft", "slug": "browser-draft", "content": "Original content"}), 201)
	path := "/api/posts/" + created.str("id")
	saved := responseRow(t, ownerSessionRequest(a, cookie, "PUT", path, Row{"revision": created["revision"], "title": "Browser save verified", "content": "Persisted browser session content", "status": "published"}), 200)
	if saved.str("revision") == created.str("revision") {
		t.Fatal("save did not create a new revision")
	}
	author := object(saved["author"])
	if author.str("kind") != "owner" || author.str("name") != "preview@example.test" {
		t.Fatal(author)
	}
	reloaded := responseRow(t, ownerSessionRequest(a, cookie, "GET", path, nil), 200)
	if reloaded.str("content") != "Persisted browser session content" || reloaded.str("revision") != saved.str("revision") {
		t.Fatal(reloaded)
	}
	page := responseRow(t, ownerSessionRequest(a, cookie, "GET", "/api/posts/page", nil), 200)
	assertHomepagePage(t, page, 1, 10, 1, 1)
	if object(page["posts"].([]any)[0]).str("title") != "Browser save verified" {
		t.Fatal(page)
	}
}
