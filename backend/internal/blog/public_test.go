package blog

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func publicFixture(t *testing.T) (*App, *testStorage, Row) {
	t.Helper()
	app, storage := coreFixture(t)
	app.Web = fstest.MapFS{
		"public-manifest.json":   {Data: []byte(`{"src/public-entry.tsx":{"file":"public-assets/entry.js","css":["public-assets/entry.css"]}}`)},
		"index.html":             {Data: []byte(`<html><body>Workspace<script nonce="__MARGIN_NONCE__">window.boot=true</script><script>window.stream=true</script></body></html>`)},
		"public-assets/entry.js": {Data: []byte("/* compiled public entry */")},
	}
	item := responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "Crawlable story", "slug": "crawlable", "excerpt": "Public introduction", "status": "published", "content": "# Server content\n\nReadable **without JavaScript**.\n\n[Tabs]\n[Tab title=\"First\"]\nFirst panel\n[/Tab]\n[Tab title=\"Second\"]\nSecond panel content\n[/Tab]\n[/Tabs]"}, true), 201)
	return app, storage, item
}
func containsHTML(t *testing.T, html string, fragments ...string) {
	t.Helper()
	for _, fragment := range fragments {
		if !strings.Contains(html, fragment) {
			t.Fatalf("missing %q in HTML: %s", fragment, html)
		}
	}
}
func excludesHTML(t *testing.T, html string, fragments ...string) {
	t.Helper()
	for _, fragment := range fragments {
		if strings.Contains(html, fragment) {
			t.Fatalf("unexpected %q in HTML", fragment)
		}
	}
}
func TestPublicHTMLContentAndMetadata(t *testing.T) {
	app, _, post := publicFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	expectStatus(t, request(t, app, "PUT", "/api/settings/turnstile", Row{"siteKey": "site", "secretKey": "secret"}, true), 200)
	app.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,$3,$4,$5,TRUE)", "approved", post["id"], "Reader", "private@example.test", "Approved comment")
	app.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,$3,$4,$5,FALSE)", "pending", post["id"], "Reader", "pending@example.test", "Pending comment")
	home := request(t, app, "GET", "/", nil, false)
	expectStatus(t, home, 200)
	containsHTML(t, home.Body.String(), `href="/post/crawlable"`, `<h2>Crawlable story</h2>`)
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), `<summary class="article-share-button">Share</summary>`, `aria-label="Article link" readonly value="http://blog.test/post/crawlable"`)
	containsHTML(t, page.Body.String(), `<h1>Crawlable story</h1>`, `Readable <strong>without JavaScript</strong>`, `Second panel content`, `Approved comment`, `rel="canonical" href="http://blog.test/post/crawlable"`, `application/ld+json`, `BlogPosting`, `public-assets/entry.js`)
	excludesHTML(t, page.Body.String(), "private@example.test", "Pending comment", "content_key", "Opening the journal")
	if page.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("HTML must reflect publication changes")
	}
}
func TestPublicPrivacyPageAndFooter(t *testing.T) {
	app, _, _ := publicFixture(t)
	for _, path := range []string{"/", "/post/crawlable", "/privacy"} {
		page := request(t, app, "GET", path, nil, false)
		expectStatus(t, page, http.StatusOK)
		containsHTML(t, page.Body.String(), `href="/privacy">Privacy</a>`)
	}
	privacy := request(t, app, "GET", "/privacy", nil, false)
	containsHTML(t, privacy.Body.String(), "Privacy —", "Analytics records the country, not your IP address.", "Contact this publication’s owner", `rel="canonical" href="http://blog.test/privacy"`)
	excludesHTML(t, privacy.Body.String(), `id="public-data"`, `public-assets/entry.js`)
}
func TestPublicHTMLPublicationChanges(t *testing.T) {
	app, _, post := publicFixture(t)
	draft := responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "draft"}, true), 200)
	expectStatus(t, request(t, app, "GET", "/post/crawlable", nil, true), 404)
	excludesHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), "Crawlable story")
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": draft["revision"], "status": "published", "content": "Freshly edited article"}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), "Freshly edited article")
	expectStatus(t, request(t, app, "GET", "/does-not-exist", nil, false), 404)
	expectStatus(t, request(t, app, "GET", "/newsletter/invalid", nil, false), 404)
}

type unavailablePublicStorage struct{ Storage }

func (unavailablePublicStorage) Get(context.Context, string) ([]byte, error) {
	return nil, errors.New("private storage error")
}
func TestPublicHTMLErrors(t *testing.T) {
	app, _, _ := publicFixture(t)
	app.Storage = unavailablePublicStorage{app.Storage}
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	expectStatus(t, page, 503)
	containsHTML(t, page.Body.String(), "Please try again shortly")
	excludesHTML(t, page.Body.String(), "private storage error")
	if page.Header().Get("X-Robots-Tag") != "noindex" {
		t.Fatal("error page must not be indexed")
	}
}
func TestPublicHTMLSafeBootstrap(t *testing.T) {
	app, _, post := publicFixture(t)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "title": "</script><script>alert(1)</script>", "content": "<script>alert(2)</script>\n\n[bad](javascript:alert(3))"}, true), 200)
	html := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, html, `\u003c/script\u003e`, `id="public-data"`)
	excludesHTML(t, html, `<script>alert(`, `href="javascript:`)
}
func TestPublicDiscovery(t *testing.T) {
	app, _, post := publicFixture(t)
	t.Setenv("PUBLIC_URL", "https://journal.example.test")
	robots := request(t, app, "GET", "/robots.txt", nil, false)
	expectStatus(t, robots, 200)
	containsHTML(t, robots.Body.String(), "Allow: /", "Disallow: /admin", "Sitemap: https://journal.example.test/sitemap.xml")
	sitemap := request(t, app, "GET", "/sitemap.xml", nil, false)
	expectStatus(t, sitemap, 200)
	containsHTML(t, sitemap.Body.String(), "https://journal.example.test/post/crawlable", "https://journal.example.test/privacy", "<lastmod>")
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "draft"}, true), 200)
	excludesHTML(t, request(t, app, "GET", "/sitemap.xml", nil, false).Body.String(), "crawlable")
}
func TestWorkspaceHTMLNonceAndRoutes(t *testing.T) {
	app, _, _ := publicFixture(t)
	page := request(t, app, "GET", "/admin/posts/example", nil, false)
	expectStatus(t, page, 200)
	excludesHTML(t, page.Body.String(), "__MARGIN_NONCE__")
	nonce := strings.Split(strings.Split(page.Body.String(), `nonce="`)[1], `"`)[0]
	containsHTML(t, page.Header().Get("Content-Security-Policy"), "'nonce-"+nonce+"'")
	if strings.Count(page.Body.String(), `nonce="`+nonce+`"`) != 2 {
		t.Fatal("all compiled inline scripts need the request nonce")
	}
	if page.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
		t.Fatal("workspace must not be indexed")
	}
	expectStatus(t, request(t, app, "GET", "/public-assets/entry.js", nil, false), 200)
	head := httptest.NewRecorder()
	app.ServeHTTP(head, httptest.NewRequest("HEAD", "http://blog.test/post/crawlable", nil))
	if head.Code != 200 || head.Body.Len() != 0 {
		t.Fatal("HEAD must return headers without HTML")
	}
	// The renderer does not require any frontend assets to provide readable public content.
	app.Web = fs.FS(nil)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), "Readable <strong>without JavaScript</strong>")
}

func TestWorkspaceErrorDocumentWithoutFrontendAssets(t *testing.T) {
	app, _ := coreFixture(t)
	for _, web := range []fs.FS{nil, fstest.MapFS{}} {
		app.Web = web
		for _, signedIn := range []bool{false, true} {
			page := request(t, app, "GET", "/admin/posts/example", nil, signedIn)
			expectStatus(t, page, 503)
			containsHTML(t, page.Body.String(), "Your workspace is taking a moment.", "<style>", "<svg", "#5b7048", `class="retry"`, `href="/"`)
			excludesHTML(t, page.Body.String(), `rel="stylesheet"`, "<script", "public-assets/", `<img`, "Writer’s desk")
			if page.Header().Get("Cache-Control") != "no-store" || page.Header().Get("Retry-After") != "5" {
				t.Fatal("unavailable workspace must be retryable and not cached")
			}
		}
	}
	head := httptest.NewRecorder()
	app.ServeHTTP(head, httptest.NewRequest("HEAD", "http://blog.test/admin", nil))
	if head.Code != 503 || head.Body.Len() != 0 {
		t.Fatal("HEAD error must return headers without a body")
	}
}

func TestMountedErrorPageWithoutFrontendAssets(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	app.Web = nil
	page := request(t, app, "GET", "/blog/admin", nil, false)
	expectStatus(t, page, 503)
	containsHTML(t, page.Body.String(), `href="/blog/"`, "Your workspace is taking a moment.")
	missing := request(t, app, "GET", "/blog/missing", nil, false)
	expectStatus(t, missing, 404)
	containsHTML(t, missing.Body.String(), "This page could not be found.", "<style>")
	excludesHTML(t, missing.Body.String(), `class="retry"`)
}
