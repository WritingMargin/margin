package blog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func roleToken(t *testing.T, a *App, role string) string {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/tokens", Row{"name": role, "role": role}, true), 201).str("token")
}

func tokenRequest(a *App, key, method, path string, input any) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://blog.test"+path, strings.NewReader(encode(input)))
	r.Header.Set("Authorization", "Bearer "+key)
	if input != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}

func draftInput(slug string) Row {
	return Row{"title": "Test article", "slug": slug, "content": "A searchable article"}
}

func TestTokenRolesDraftPublicationLifecycle(t *testing.T) {
	a, _ := coreFixture(t)
	reader, writer, publisher := roleToken(t, a, "reader"), roleToken(t, a, "writer"), roleToken(t, a, "publisher")
	expectStatus(t, tokenRequest(a, reader, "POST", "/api/posts", draftInput("denied")), 403)
	post := responseRow(t, tokenRequest(a, writer, "POST", "/api/posts", draftInput("draft")), 201)
	path := "/api/posts/" + post.str("id")
	expectStatus(t, tokenRequest(a, reader, "GET", path, nil), 200)
	expectStatus(t, tokenRequest(a, reader, "HEAD", path, nil), 200)
	expectStatus(t, tokenRequest(a, reader, "PUT", path, Row{"revision": post["revision"], "content": "Forbidden"}), 403)
	post = responseRow(t, tokenRequest(a, writer, "PUT", path, Row{"revision": post["revision"], "content": "Edited draft"}), 200)
	for _, status := range []string{"published", "archived"} {
		expectStatus(t, tokenRequest(a, writer, "PUT", path, Row{"revision": post["revision"], "status": status}), 403)
		input := draftInput("denied-" + status)
		input["status"] = status
		expectStatus(t, tokenRequest(a, writer, "POST", "/api/posts", input), 403)
	}
	post = responseRow(t, tokenRequest(a, publisher, "PUT", path, Row{"revision": post["revision"], "status": "published"}), 200)
	for _, input := range []Row{{"content": "Forbidden"}, {"status": "draft"}, {"status": "archived"}, {"title": "Forbidden"}} {
		input["revision"] = post["revision"]
		expectStatus(t, tokenRequest(a, writer, "PUT", path, input), 403)
	}
	post = responseRow(t, tokenRequest(a, publisher, "PUT", path, Row{"revision": post["revision"], "status": "archived"}), 200)
	expectStatus(t, tokenRequest(a, writer, "PUT", path, Row{"revision": post["revision"], "status": "draft"}), 403)
	expectStatus(t, tokenRequest(a, reader, "GET", path, nil), 200)
	post = responseRow(t, tokenRequest(a, publisher, "PUT", path, Row{"revision": post["revision"], "status": "draft"}), 200)
	expectStatus(t, tokenRequest(a, writer, "DELETE", path, Row{"revision": post["revision"]}), 403)
	expectStatus(t, tokenRequest(a, publisher, "DELETE", path, Row{"revision": post["revision"]}), 200)
}

func TestRestrictedTokensCannotEscalateOrAccessAdministration(t *testing.T) {
	a, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher"} {
		key := roleToken(t, a, role)
		for _, route := range []string{"GET /api/tokens", "POST /api/tokens", "PATCH /api/tokens/" + hash(key), "DELETE /api/tokens/" + hash("owner"), "POST /api/tokens/cli/approve", "GET /api/settings", "PUT /api/settings", "GET /api/account", "POST /api/ai/summaries", "POST /api/newsletter/smtp/test", "GET /api/comments", "GET /api/storage", "POST /api/settings/logo", "POST /api/posts/unknown/future-operation"} {
			method, path, _ := strings.Cut(route, " ")
			expectStatus(t, tokenRequest(a, key, method, path, Row{"role": "owner"}), 403)
		}
		expectStatus(t, tokenRequest(a, key, "DELETE", "/api/tokens/"+hash(key), nil), 200)
		expectStatus(t, tokenRequest(a, key, "GET", "/api/posts", nil), 401)
	}
}

func TestTokenRoleDefaultsChangesAndValidation(t *testing.T) {
	a, _ := coreFixture(t)
	created := responseRow(t, request(t, a, "POST", "/api/tokens", Row{"name": "Default"}, true), 201)
	if created.str("role") != "reader" {
		t.Fatal(created)
	}
	key := created.str("token")
	path := "/api/tokens/" + hash(key)
	expectStatus(t, tokenRequest(a, key, "POST", "/api/posts", draftInput("default")), 403)
	responseRow(t, request(t, a, "PATCH", path, Row{"role": "writer"}, true), 200)
	expectStatus(t, tokenRequest(a, key, "POST", "/api/posts", draftInput("promoted")), 201)
	responseRow(t, request(t, a, "PATCH", path, Row{"role": "reader"}, true), 200)
	expectStatus(t, tokenRequest(a, key, "POST", "/api/posts", draftInput("demoted")), 403)
	for _, role := range []any{"admin", "", nil, 123} {
		expectStatus(t, request(t, a, "POST", "/api/tokens", Row{"role": role}, true), 400)
		expectStatus(t, request(t, a, "PATCH", path, Row{"role": role}, true), 400)
	}
	expectStatus(t, request(t, a, "PATCH", path, Row{}, true), 400)
	expectStatus(t, request(t, a, "PATCH", "/api/tokens/missing", Row{"role": "reader"}, true), 404)
	containsHTML(t, request(t, a, "GET", "/api/tokens", nil, true).Body.String(), `"role":"reader"`, `"role":"owner"`)
}

func TestTokenRoleCannotBeOverriddenByOwnerCookie(t *testing.T) {
	a, _ := coreFixture(t)
	key := roleToken(t, a, "reader")
	a.DB.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("session"), "2099-01-01T00:00:00.000Z")
	r := httptest.NewRequest("GET", "http://blog.test/api/settings", nil)
	r.AddCookie(&http.Cookie{Name: "margin_session", Value: "session"})
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 200)
	r.Header.Set("Authorization", "Bearer "+key)
	w = httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 403)
	r.Header.Set("Authorization", "Bearer invalid")
	w = httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 401)
}

func TestWriterConcurrentPublishCannotOverwriteLivePost(t *testing.T) {
	a, storage := coreFixture(t)
	writer := roleToken(t, a, "writer")
	post := responseRow(t, tokenRequest(a, writer, "POST", "/api/posts", draftInput("racing")), 201)
	var once sync.Once
	storage.onGet = func(string) {
		once.Do(func() {
			a.DB.Must(context.Background(), "UPDATE posts SET status='published',revision='concurrent' WHERE id=$1", post["id"])
		})
	}
	expectStatus(t, tokenRequest(a, writer, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "title": "Forbidden live edit"}), 409)
	current := a.getPost(context.Background(), post.str("id"))
	if current.str("revision") != "concurrent" || current.str("status") != "published" {
		t.Fatal(current)
	}
}
