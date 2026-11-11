package blog

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestSiteSettingsPersistAcrossDatabaseReopen(t *testing.T) {
	fixture, storage := coreFixture(t)
	filename := filepath.Join(t.TempDir(), "settings.db")
	db, err := OpenDatabase("", filename)
	if err != nil {
		t.Fatal(err)
	}
	db.Must(context.Background(), "INSERT INTO api_tokens(token_hash,name) VALUES($1,$2)", hash("owner"), "Settings test")
	app := NewApp(db, storage, fixture.Client, nil)
	expectStatus(t, request(t, app, "PUT", "/api/settings/domain", Row{"url": "journal.example.com"}, true), 200)
	media := defaultMediaSettings()
	object(media["image"])["frame"] = "plain"
	expectStatus(t, request(t, app, "PUT", "/api/settings/media", media, true), 200)
	seo := defaultSEO()
	seo["title"] = "Persistent title"
	seo["indexing"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	if err = db.SQL.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = OpenDatabase("", filename)
	if err != nil {
		t.Fatal(err)
	}
	defer db.SQL.Close()
	app = NewApp(db, storage, fixture.Client, nil)
	domain := responseRow(t, request(t, app, "GET", "/api/settings/domain", nil, true), 200)
	savedMedia := responseRow(t, request(t, app, "GET", "/api/settings/media", nil, true), 200)
	if object(savedMedia["image"]).str("frame") != "plain" {
		t.Fatal(savedMedia)
	}
	savedSEO := responseRow(t, request(t, app, "GET", "/api/settings/seo", nil, true), 200)
	if domain.str("url") != "https://journal.example.com" || savedSEO.str("title") != "Persistent title" || savedSEO.yes("indexing") {
		t.Fatalf("settings changed after reopening: %v %v", domain, savedSEO)
	}
}

func TestDomainControlsPublicationLinks(t *testing.T) {
	app, _, _ := publicFixture(t)
	t.Setenv("PUBLIC_URL", "https://deployment.example.test")
	domain := responseRow(t, request(t, app, "PUT", "/api/settings/domain", Row{"url": " Blog.Example.com/ "}, true), 200)
	if domain.str("url") != "https://blog.example.com" || domain.str("serverUrl") != "https://deployment.example.test" {
		t.Fatal(domain)
	}
	for _, path := range []string{"/", "/post/crawlable", "/read/crawlable", "/rss.xml", "/robots.txt", "/sitemap.xml", "/llms.txt", "/posts/crawlable.md"} {
		response := request(t, app, "GET", path, nil, false)
		expectStatus(t, response, 200)
		containsHTML(t, response.Body.String(), "https://blog.example.com/")
		excludesHTML(t, response.Body.String(), "https://deployment.example.test/")
	}
	if app.newsletterOrigin(context.Background()) != "https://blog.example.com" {
		t.Fatal("newsletter links must use the configured publication domain")
	}
	for _, origin := range []string{"https://blog.example.com", "https://other.example.com"} {
		r := httptest.NewRequest("PUT", "https://blog.example.com/api/settings/seo", strings.NewReader(encode(defaultSEO())))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("Authorization", "Bearer owner")
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		status := 200
		if origin == "https://other.example.com" {
			status = 403
		}
		expectStatus(t, w, status)
	}
	// Canonical domain changes must not reject mutations from the deployment origin.
	r := httptest.NewRequest("PUT", "https://deployment.example.test/api/settings/domain", strings.NewReader(`{"url":""}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://deployment.example.test")
	r.Header.Set("Authorization", "Bearer owner")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	expectStatus(t, w, 200)
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `rel="canonical" href="https://deployment.example.test/"`)
}

func TestSiteSettingsValidationAndAuthentication(t *testing.T) {
	app, _ := coreFixture(t)
	for _, name := range []string{"domain", "seo"} {
		expectStatus(t, request(t, app, "GET", "/api/settings/"+name, nil, false), 401)
		expectStatus(t, request(t, app, "PUT", "/api/settings/"+name, Row{}, false), 401)
	}
	for _, domain := range []string{"javascript:alert(1)", "https://user:secret@example.com", "http://example.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#fragment", "https://example.com:443", "https://example.com:", "https://-bad.example", "https://localhost", "https://127.0.0.1", "https://example.com\r\nX-Header: bad"} {
		t.Run(domain, func(t *testing.T) {
			expectStatus(t, request(t, app, "PUT", "/api/settings/domain", Row{"url": domain}, true), 400)
		})
	}
	for _, patch := range []Row{{"image": "javascript:alert(1)"}, {"image": "https://user:secret@example.com/image.png"}, {"indexing": "false"}, {"title": strings.Repeat("a", 121)}, {"googleVerification": `<meta content="token">`}, {"unknown": true}} {
		seo := defaultSEO()
		for key, value := range patch {
			seo[key] = value
		}
		expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 400)
	}
}

func TestSEOIsPublishedInServerHTML(t *testing.T) {
	app, _, post := publicFixture(t)
	seo := Row{"title": "Notes & ideas", "description": "A considered journal.", "image": "https://images.example.test/share.png", "indexing": true, "googleVerification": "verified_token-123"}
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	// Saving a designer theme must not overwrite independent SEO or domain settings.
	expectStatus(t, request(t, app, "PUT", "/api/settings", defaultTheme(), true), 200)
	home := request(t, app, "GET", "/", nil, false)
	containsHTML(t, home.Body.String(), "<title>Notes &amp; ideas</title>", `name="description" content="A considered journal."`, `property="og:image" content="https://images.example.test/share.png"`, `name="twitter:card" content="summary_large_image"`, `name="google-site-verification" content="verified_token-123"`)
	article := request(t, app, "GET", "/post/crawlable", nil, false)
	containsHTML(t, article.Body.String(), "<title>Crawlable story —", `name="description" content="Public introduction"`, `property="og:image" content="https://images.example.test/share.png"`)
	expectStatus(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "cover": "https://images.example.test/article.png"}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="https://images.example.test/article.png"`)
	seo["title"] = `</title><script>alert(1)</script>`
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	excludesHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `<script>alert(1)</script>`)
}

func TestBlogSEOControlsHomepageAndFeedWithoutChangingPosts(t *testing.T) {
	app, _, _ := publicFixture(t)
	t.Setenv("PUBLIC_URL", "https://publication.example/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	seo := defaultSEO()
	seo["title"] = "Publication-wide search title"
	seo["description"] = "Independent stories & ideas from our team."
	expectStatus(t, request(t, app, "PUT", "/blog/api/settings/seo", seo, true), 200)
	saved := responseRow(t, request(t, app, "GET", "/blog/api/settings/seo", nil, true), 200)
	if saved.str("description") != seo.str("description") {
		t.Fatal("blog SEO was not saved")
	}
	home := request(t, app, "GET", "/blog/", nil, false).Body.String()
	containsHTML(t, home, `<title>Publication-wide search title</title>`, `name="description" content="Independent stories &amp; ideas from our team."`, `property="og:description" content="Independent stories &amp; ideas from our team."`, `rel="canonical" href="https://publication.example/blog/"`)
	feed := request(t, app, "GET", "/blog/rss.xml", nil, false).Body.String()
	containsHTML(t, feed, `<description>Independent stories &amp; ideas from our team.</description>`, `<description>Public introduction</description>`)
	article := request(t, app, "GET", "/blog/post/crawlable", nil, false).Body.String()
	containsHTML(t, article, `name="description" content="Public introduction"`)
	excludesHTML(t, article, `<title>Publication-wide search title</title>`)
	seo["description"] = ""
	expectStatus(t, request(t, app, "PUT", "/blog/api/settings/seo", seo, true), 200)
	feed = request(t, app, "GET", "/blog/rss.xml", nil, false).Body.String()
	excludesHTML(t, feed, "Independent stories &amp; ideas from our team.")
	containsHTML(t, feed, "<description>"+rssXML(app.settings(context.Background()).str("description"))+"</description>")
}

func TestSEOIndexingControlsAllPublicRepresentations(t *testing.T) {
	app, _, _ := publicFixture(t)
	seo := defaultSEO()
	seo["indexing"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	for _, path := range []string{"/", "/post/crawlable", "/read/crawlable", "/rss.xml", "/llms.txt", "/llms-full.txt", "/posts/crawlable.md"} {
		response := request(t, app, "GET", path, nil, false)
		expectStatus(t, response, 200)
		if response.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
			t.Fatalf("%s missing noindex", path)
		}
	}
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `name="robots" content="noindex, nofollow"`)
	robots := request(t, app, "GET", "/robots.txt", nil, false).Body.String()
	containsHTML(t, robots, "Allow: /\n")
	excludesHTML(t, robots, "Sitemap:", "Disallow: /\n")
	excludesHTML(t, request(t, app, "GET", "/sitemap.xml", nil, false).Body.String(), "<url>")
	seo["indexing"] = true
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	if request(t, app, "GET", "/", nil, false).Header().Get("X-Robots-Tag") != "" {
		t.Fatal("indexing remained disabled after saving")
	}
	containsHTML(t, request(t, app, "GET", "/sitemap.xml", nil, false).Body.String(), "/post/crawlable")
}
