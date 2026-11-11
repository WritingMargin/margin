package blog

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func searchFixture(t *testing.T) *App {
	t.Helper()
	app, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://journal.example.com")
	responseRow(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true}, true), 200)
	app.DB.Must(context.Background(), "DELETE FROM search_notifications")
	return app
}
func searchPost(t *testing.T, app *App, status string) Row {
	t.Helper()
	return responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "Searchable article", "slug": "searchable", "content": "Text", "status": status}, true), 201)
}
func queuedSearchURLs(app *App) []Row {
	return app.DB.Must(context.Background(), "SELECT * FROM search_notifications ORDER BY url")
}
func TestSearchEnginesSettingsAndVerification(t *testing.T) {
	app, _ := coreFixture(t)
	expectStatus(t, request(t, app, "GET", "/api/settings/search-engines", nil, false), 401)
	expectStatus(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true}, false), 401)
	expectStatus(t, request(t, app, "POST", "/api/settings/search-engines/submit", Row{}, false), 401)
	expectStatus(t, request(t, app, "GET", "/indexnow.txt", nil, false), 404)
	expectStatus(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true}, true), 400)
	t.Setenv("PUBLIC_URL", "https://journal.example.com")
	saved := responseRow(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true}, true), 200)
	if !saved.yes("enabled") || saved["pending"] != float64(1) {
		t.Fatal(saved)
	}
	key := request(t, app, "GET", "/indexnow.txt", nil, false)
	expectStatus(t, key, 200)
	if !indexNowKeyPattern.MatchString(key.Body.String()) {
		t.Fatal("invalid verification key")
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": false}, true), 200)
	expectStatus(t, request(t, app, "GET", "/indexnow.txt", nil, false), 404)
	expectStatus(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true}, true), 200)
	if got := request(t, app, "GET", "/indexnow.txt", nil, false).Body.String(); got != key.Body.String() {
		t.Fatal("key changed on re-enable")
	}
}
func TestIndexNowQueuesPublishedLifecycleOnly(t *testing.T) {
	app := searchFixture(t)
	post := searchPost(t, app, "draft")
	if len(queuedSearchURLs(app)) != 0 {
		t.Fatal("draft was queued")
	}
	post = responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "published"}, true), 200)
	if len(queuedSearchURLs(app)) != 2 {
		t.Fatal("publication did not queue post and homepage")
	}
	app.DB.Must(context.Background(), "DELETE FROM search_notifications")
	post = responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "slug": "renamed"}, true), 200)
	rows := queuedSearchURLs(app)
	if len(rows) != 3 || rows[1].str("url") != "https://journal.example.com/post/renamed" || rows[2].str("url") != "https://journal.example.com/post/searchable" {
		t.Fatal(rows)
	}
	app.DB.Must(context.Background(), "DELETE FROM search_notifications")
	expectStatus(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": "stale", "title": "Conflict"}, true), 409)
	if len(queuedSearchURLs(app)) != 0 {
		t.Fatal("conflicting save was queued")
	}
	post = responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "draft"}, true), 200)
	if len(queuedSearchURLs(app)) != 2 {
		t.Fatal("withdrawal was not queued")
	}
	app.DB.Must(context.Background(), "DELETE FROM search_notifications")
	expectStatus(t, request(t, app, "DELETE", "/api/posts/"+post.str("id"), Row{"revision": post["revision"]}, true), 200)
	if len(queuedSearchURLs(app)) != 0 {
		t.Fatal("draft deletion was queued")
	}
	post = searchPost(t, app, "published")
	app.DB.Must(context.Background(), "DELETE FROM search_notifications")
	expectStatus(t, request(t, app, "DELETE", "/api/posts/"+post.str("id"), Row{"revision": post["revision"]}, true), 200)
	if len(queuedSearchURLs(app)) != 2 {
		t.Fatal("published deletion was not queued")
	}
}
func TestIndexNowRetryAndPayload(t *testing.T) {
	app := searchFixture(t)
	searchPost(t, app, "published")
	calls := 0
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		assertIndexNowPayload(t, r)
		return &http.Response{StatusCode: 429, Header: http.Header{"Retry-After": []string{"600"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})
	app.processSearchNotifications(context.Background())
	rows := queuedSearchURLs(app)
	if rows[0].str("status") != "retrying" || rows[0]["attempts"] != int64(1) {
		t.Fatal(rows)
	}
	app.processSearchNotifications(context.Background())
	if calls != 1 {
		t.Fatal("ignored retry delay")
	}
	app.DB.Must(context.Background(), "UPDATE search_notifications SET next_attempt=0")
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 202, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})
	app.processSearchNotifications(context.Background())
	status := responseRow(t, request(t, app, "GET", "/api/settings/search-engines", nil, true), 200)
	if status["pending"] != float64(0) || status["lastSubmission"] == nil {
		t.Fatal(status)
	}
	if queuedSearchURLs(app)[0].str("status") != "verification_pending" {
		t.Fatal("202 claimed verified indexing")
	}
}
func TestIndexNowNoIndexAndOriginChange(t *testing.T) {
	app := searchFixture(t)
	searchPost(t, app, "published")
	calls := 0
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) { calls++; return fixtureResponse(Row{}), nil })
	seo := defaultSEO()
	seo["indexing"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	app.processSearchNotifications(context.Background())
	expectStatus(t, request(t, app, "POST", "/api/settings/search-engines/submit", Row{}, true), 400)
	if calls != 0 {
		t.Fatal("submitted noindex site")
	}
	seo["indexing"] = true
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	t.Setenv("PUBLIC_URL", "https://other.example.com")
	app.processSearchNotifications(context.Background())
	if calls != 0 {
		t.Fatal("submitted URLs for a previous domain")
	}
}
func TestIndexNowWorkerPreservesNewerQueuedRevision(t *testing.T) {
	app := searchFixture(t)
	post := searchPost(t, app, "published")
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "title": "Newer content"}, true), 200)
		return fixtureResponse(Row{}), nil
	})
	app.processSearchNotifications(context.Background())
	for _, row := range queuedSearchURLs(app) {
		if row.str("status") != "queued" {
			t.Fatal("older response overwrote newer pending change", row)
		}
	}
}
func TestIndexNowSubpathAndPrivateOrigins(t *testing.T) {
	app := searchFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("PUBLIC_URL", "https://journal.example.com/blog")
	responseRow(t, request(t, app, "POST", "/blog/api/posts", Row{"title": "Post", "slug": "nested", "content": "Text", "status": "published"}, true), 201)
	expectStatus(t, request(t, app, "GET", "/blog/indexnow.txt", nil, false), 200)
	rows := queuedSearchURLs(app)
	if rows[1].str("url") != "https://journal.example.com/blog/post/nested" {
		t.Fatal(rows)
	}
	for _, origin := range []string{"https://localhost", "https://127.0.0.1", "http://journal.example.com", "https://myblog.local", "https://journal.example.com:443"} {
		t.Setenv("PUBLIC_URL", origin)
		if app.searchOrigin(context.Background()) != "" {
			t.Fatal("accepted non-public origin", origin)
		}
	}
}

func assertIndexNowPayload(t *testing.T, r *http.Request) {
	t.Helper()
	if r.URL.String() != "https://api.indexnow.org/indexnow" || r.Method != "POST" {
		t.Fatal(r.URL)
	}
	var payload Row
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.str("host") != "journal.example.com" || payload.str("keyLocation") != "https://journal.example.com/indexnow.txt" {
		t.Fatal(payload)
	}
	if len(arrayValue(payload, "urlList")) != 2 {
		t.Fatal(payload)
	}
	if strings.Contains(encode(payload), "Searchable article") {
		t.Fatal("content sent to IndexNow")
	}
}

func TestIndexNowOutboxSurvivesAppRestart(t *testing.T) {
	app := searchFixture(t)
	searchPost(t, app, "published")
	reopened := NewApp(app.DB, app.Storage, app.Client, nil)
	calls := 0
	reopened.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) { calls++; return fixtureResponse(Row{}), nil })}
	reopened.processSearchNotifications(context.Background())
	if calls != 1 {
		t.Fatal("pending notifications were not recovered")
	}
	for _, row := range queuedSearchURLs(reopened) {
		if row.str("status") != "submitted" {
			t.Fatal(row)
		}
	}
}
func TestIndexNowFailureDoesNotPreventPublishing(t *testing.T) {
	app := searchFixture(t)
	calls := 0
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 503, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("unavailable"))}, nil
	})
	post := searchPost(t, app, "published")
	if calls != 0 {
		t.Fatal("publication made a synchronous search request")
	}
	app.processSearchNotifications(context.Background())
	if calls != 1 || app.getPost(context.Background(), post.str("id")).str("status") != "published" {
		t.Fatal("provider outage affected post")
	}
	for _, row := range queuedSearchURLs(app) {
		if row.str("status") != "retrying" {
			t.Fatal(row)
		}
	}
}
func TestIndexNowSubmitAllExcludesDraftsAndRejectsCustomURLs(t *testing.T) {
	app := searchFixture(t)
	searchPost(t, app, "draft")
	expectStatus(t, request(t, app, "POST", "/api/settings/search-engines/submit", Row{}, true), 200)
	if rows := queuedSearchURLs(app); len(rows) != 1 || rows[0].str("url") != "https://journal.example.com/" {
		t.Fatal(rows)
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings/search-engines", Row{"enabled": true, "key": "attacker"}, true), 400)
	expectStatus(t, request(t, app, "POST", "/api/settings/search-engines/submit", Row{"url": "https://another.example.com/private"}, true), 400)
}
