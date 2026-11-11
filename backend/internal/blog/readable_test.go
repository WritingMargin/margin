package blog

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"testing"
)

func readableFixturePost(t *testing.T, a *App, status, slug, source string) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Article " + slug, "slug": slug, "excerpt": "Introduction " + slug, "content": source, "status": status, "tags": []string{"Readability", "Go"}}, true), 201)
}
func requireReadableText(t *testing.T, body string, values ...string) {
	t.Helper()
	for _, value := range values {
		if !strings.Contains(body, value) {
			t.Errorf("missing readable content %q", value)
		}
	}
}
func TestReadablePublishedContentWithoutJSOrCentral(t *testing.T) {
	a, _ := coreFixture(t)
	readableFixturePost(t, a, "published", "hello", "## Full article\n\nA **complete** paragraph, accessible without JavaScript.\n\n<script>sourceOnly()</script>")
	t.Setenv("AI_SERVICE_TOKEN", "")
	for _, path := range []string{"/read/hello", "/posts/hello.md", "/llms-full.txt"} {
		t.Run(path, func(t *testing.T) {
			response := request(t, a, "GET", path, nil, false)
			expectStatus(t, response, 200)
			requireReadableText(t, response.Body.String(), "Article hello", "Introduction hello", "Full article", "complete", "accessible without JavaScript.", "Readability", "Go", "http://blog.test/post/hello")
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("public readable response was cacheable")
			}
			switch path {
			case "/posts/hello.md":
				if response.Header().Get("Content-Type") != "text/markdown; charset=utf-8" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
					t.Fatal(response.Header())
				}
				requireReadableText(t, response.Body.String(), "<script>sourceOnly()</script>")
			case "/read/hello":
				requireReadableText(t, response.Body.String(), `<link rel="canonical" href="http://blog.test/post/hello">`, `<strong>complete</strong>`, `<time datetime=`)
				if !strings.Contains(response.Header().Get("Content-Security-Policy"), "script-src 'none'") {
					t.Fatal("read view permits scripts")
				}
			}
		})
	}
	t.Run("HEAD", func(t *testing.T) {
		for _, path := range []string{"/llms.txt", "/llms-full.txt", "/read/hello", "/posts/hello.md"} {
			expectStatus(t, request(t, a, http.MethodHead, path, nil, false), 200)
		}
	})
}
func TestReadableMarkdownIncludesPublicAuthor(t *testing.T) {
	a, _ := coreFixture(t)
	readableFixturePost(t, a, "published", "byline", "Article body")
	for _, path := range []string{"/posts/byline.md", "/llms-full.txt"} {
		response := request(t, a, "GET", path, nil, false)
		expectStatus(t, response, 200)
		if strings.Contains(response.Body.String(), "Author:") {
			t.Fatal("unset author appeared in", path)
		}
	}
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", Row{"name": "Alex Writer", "website": "https://example.test/alex"}, true), 200)
	for _, path := range []string{"/posts/byline.md", "/posts/byline.md?download=1", "/llms-full.txt"} {
		response := request(t, a, "GET", path, nil, false)
		expectStatus(t, response, 200)
		requireReadableText(t, response.Body.String(), "Author: Alex Writer\n", "Author URL: https://example.test/alex\n")
	}
}
func TestReadableIndexNeverListsDraftsOrFetchesBodies(t *testing.T) {
	a, s := coreFixture(t)
	readableFixturePost(t, a, "published", "visible", "Published full body")
	readableFixturePost(t, a, "draft", "secret-draft", "TOP SECRET BODY")
	reads := 0
	s.onGet = func(string) { reads++ }
	response := request(t, a, "GET", "/llms.txt", nil, false)
	expectStatus(t, response, 200)
	requireReadableText(t, response.Body.String(), "http://blog.test/read/visible", "http://blog.test/posts/visible.md", "http://blog.test/llms-full.txt")
	if strings.Contains(response.Body.String(), "secret") || reads != 0 {
		t.Fatal("index leaked a draft or loaded bodies")
	}
	full := request(t, a, "GET", "/llms-full.txt", nil, false)
	expectStatus(t, full, 200)
	requireReadableText(t, full.Body.String(), "Published full body")
	if strings.Contains(full.Body.String(), "SECRET") || strings.Contains(full.Body.String(), "secret-draft") {
		t.Fatal("full collection leaked draft")
	}
}
func TestReadablePrivateAndMissingArticlesReturn404(t *testing.T) {
	a, _ := coreFixture(t)
	readableFixturePost(t, a, "draft", "secret", "TOP SECRET BODY")
	for _, path := range []string{"/read/secret", "/posts/secret.md", "/read/missing", "/posts/missing.md", "/posts/secret.html"} {
		t.Run(path, func(t *testing.T) {
			response := request(t, a, "GET", path, nil, false)
			expectStatus(t, response, 404)
			if strings.Contains(response.Body.String(), "TOP SECRET") {
				t.Fatal("private content leaked")
			}
		})
	}
}
func TestReadableWithdrawalDuringStorageRead(t *testing.T) {
	for _, path := range []string{"/read/withdrawn", "/posts/withdrawn.md", "/llms-full.txt"} {
		t.Run(path, func(t *testing.T) {
			a, s := coreFixture(t)
			post := readableFixturePost(t, a, "published", "withdrawn", "WITHDRAWN BODY")
			s.onGet = func(string) {
				a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
			}
			response := request(t, a, "GET", path, nil, false)
			expectStatus(t, response, 404)
			if strings.Contains(response.Body.String(), "WITHDRAWN BODY") {
				t.Fatal("withdrawn content leaked")
			}
		})
	}
}
func TestReadableCollectionRechecksEarlierArticles(t *testing.T) {
	a, s := coreFixture(t)
	earlier := readableFixturePost(t, a, "published", "first", "EARLIER BODY")
	later := readableFixturePost(t, a, "published", "second", "LATER BODY")
	a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1 WHERE id=$2", "2026-10-01T00:00:00.000Z", later["id"])
	reads := 0
	s.onGet = func(string) {
		reads++
		if reads == 2 {
			a.DB.Must(context.Background(), "UPDATE posts SET revision='changed' WHERE id=$1", earlier["id"])
		}
	}
	response := request(t, a, "GET", "/llms-full.txt", nil, false)
	expectStatus(t, response, 404)
	if strings.Contains(response.Body.String(), "BODY") {
		t.Fatal("partial collection exposed stale article")
	}
}
func TestReadableStorageFailuresReturn503Atomically(t *testing.T) {
	a, s := coreFixture(t)
	readableFixturePost(t, a, "published", "broken", "BODY")
	a.Storage = rssFailedStorage{s}
	for _, path := range []string{"/read/broken", "/posts/broken.md", "/llms-full.txt"} {
		t.Run(path, func(t *testing.T) {
			response := request(t, a, "GET", path, nil, false)
			expectStatus(t, response, 503)
			if strings.Contains(response.Body.String(), "# Article") || strings.Contains(response.Body.String(), "<!doctype") {
				t.Fatal("partial article returned")
			}
		})
	}
}

var readableUnsafeHTML = regexp.MustCompile(`(?i)<(?:script|iframe|object|embed|base|form)\b|<[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*?\s+on[a-z]+\s*=|(?:href|src)="(?:javascript|data):`)

func TestReadableHTMLRejectsExecutableArticleMarkup(t *testing.T) {
	a, _ := coreFixture(t)
	source := "# Safe heading\n\n<script>alert('unsafe')</script>\n\n<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert(1))\n\n[Image src=\"javascript:alert(1)\" alt=\"test\"]\n\n**Safe full paragraph**\n\n[Video src=\"https://youtu.be/dQw4w9WgXcQ\"]"
	post := readableFixturePost(t, a, "published", "unsafe", source)
	a.DB.Must(context.Background(), "UPDATE posts SET title=$1,excerpt=$2 WHERE id=$3", `<script>alert("title")</script>`, `<img src=x onerror=alert(2)>`, post["id"])
	response := request(t, a, "GET", "/read/unsafe", nil, false)
	expectStatus(t, response, 200)
	markup := response.Body.String()
	if readableUnsafeHTML.MatchString(markup) {
		t.Fatal("executable HTML escaped sanitization", readableUnsafeHTML.FindString(markup))
	}
	requireReadableText(t, markup, "Safe heading", "<strong>Safe full paragraph</strong>", "&lt;script&gt;", `https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ`)
}
func TestReadableUnsafeMatcherIgnoresQuotedMetadata(t *testing.T) {
	for _, markup := range []string{`<img src="x" onerror="alert(1)">`, `<script>alert(1)</script>`, `<a href="javascript:alert(1)">unsafe</a>`} {
		if !readableUnsafeHTML.MatchString(markup) {
			t.Fatal("unsafe HTML matcher missed", markup)
		}
	}
	if readableUnsafeHTML.MatchString(`<meta content="&lt;img src=x onerror=alert(1)&gt;">`) {
		t.Fatal("escaped text incorrectly treated as executable")
	}
}
