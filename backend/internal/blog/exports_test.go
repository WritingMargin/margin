package blog

import (
	"context"
	"mime"
	"strings"
	"testing"
)

func TestArticleDownloadsStandaloneAndSafe(t *testing.T) {
	a, _ := coreFixture(t)
	readableFixturePost(t, a, "published", "download", "## Full story\n\nCafé 日本語 — **read offline**.\n\n[Tabs]\n[Tab title=\"First\"]\nFirst section\n[/Tab]\n[Tab title=\"Second\"]\nSecond section\n[/Tab]\n[/Tabs]\n\n<script>alert('unsafe')</script>\n\n[Bad](javascript:alert(1))")
	t.Setenv("AI_SERVICE_URL", "")
	t.Setenv("AI_SERVICE_TOKEN", "")
	response := request(t, a, "GET", "/posts/download.md?download=1", nil, false)
	expectStatus(t, response, 200)
	kind, params, err := mime.ParseMediaType(response.Header().Get("Content-Disposition"))
	if err != nil || kind != "attachment" || params["filename"] != "download.md" {
		t.Fatal("invalid attachment", response.Header())
	}
	containsHTML(t, response.Body.String(), "# Article download", "## Full story", "Café 日本語", "**read offline**")
	inline := request(t, a, "GET", "/posts/download.md", nil, false)
	if inline.Header().Get("Content-Disposition") != "" || inline.Body.String() != response.Body.String() {
		t.Fatal("inline markdown must retain its readable content")
	}
	printed := request(t, a, "GET", "/post/download/print", nil, false)
	expectStatus(t, printed, 200)
	containsHTML(t, printed.Body.String(), "Article download", "Café 日本語", "<strong>read offline</strong>", "First section", "Second section", "Save as PDF", "@media print", "http://blog.test/post/download", "?download=1")
	excludesHTML(t, printed.Body.String(), "<script>alert", `href="javascript:`, "public-comments", "Writer’s desk")
	if printed.Header().Get("Cache-Control") != "no-store" || printed.Header().Get("X-Robots-Tag") != "noindex, follow" {
		t.Fatal(printed.Header())
	}
	nonce := strings.Split(strings.Split(printed.Body.String(), `<script nonce="`)[1], `"`)[0]
	containsHTML(t, printed.Header().Get("Content-Security-Policy"), "script-src 'nonce-"+nonce+"'")
	excludesHTML(t, printed.Body.String(), "window.addEventListener('load',()=>window.print()")
	pdf := request(t, a, "GET", "/post/download/print?download=pdf", nil, false)
	expectStatus(t, pdf, 200)
	containsHTML(t, pdf.Body.String(), "window.addEventListener('load',()=>window.print()", "Café 日本語")
	page := request(t, a, "GET", "/post/download", nil, false)
	containsHTML(t, page.Body.String(), `<details class="article-downloads"><summary aria-label="Save this post">`, `href="/posts/download.md?download=1"`, `href="/post/download/print?download=pdf"`, "Download as PDF")
}

func TestPrintVideoRemainsAccessibleAsLink(t *testing.T) {
	markup := string(printContent(`[Video src="https://media.example.test/film.mp4?x=1&y=2"]`, "https://blog.example.test/post/story"))
	containsHTML(t, markup, `href="https://media.example.test/film.mp4?x=1&amp;y=2"`, "Watch video online")
	excludesHTML(t, markup, "<video")
}

func TestArticleDownloadsNeverExposePrivateOrStaleContent(t *testing.T) {
	for _, route := range []string{"/posts/secret.md?download=1", "/post/secret/print"} {
		t.Run(route, func(t *testing.T) {
			a, storage := coreFixture(t)
			row := readableFixturePost(t, a, "draft", "secret", "SECRET BODY")
			expectStatus(t, request(t, a, "GET", route, nil, true), 404)
			a.DB.Must(context.Background(), "UPDATE posts SET status='published' WHERE id=$1", row["id"])
			storage.onGet = func(string) {
				a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", row["id"])
			}
			response := request(t, a, "GET", route, nil, false)
			expectStatus(t, response, 404)
			excludesHTML(t, response.Body.String(), "SECRET BODY")
			if response.Header().Get("Content-Disposition") != "" {
				t.Fatal("error must not become a downloaded article")
			}
		})
	}
}

func TestArticleDownloadsErrorsAndMount(t *testing.T) {
	a, storage := coreFixture(t)
	readableFixturePost(t, a, "published", "export", "Exported body")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("PUBLIC_URL", "https://journal.example.test/blog")
	for _, route := range []string{"/blog/posts/export.md?download=1", "/blog/post/export/print"} {
		expectStatus(t, request(t, a, "GET", route, nil, false), 200)
		expectStatus(t, request(t, a, "HEAD", route, nil, false), 200)
	}
	printed := request(t, a, "GET", "/blog/post/export/print", nil, false)
	containsHTML(t, printed.Body.String(), `href="https://journal.example.test/blog/posts/export.md?download=1"`, `href="https://journal.example.test/blog/post/export"`)
	a.Storage = rssFailedStorage{storage}
	for _, route := range []string{"/blog/posts/export.md?download=1", "/blog/post/export/print"} {
		response := request(t, a, "GET", route, nil, false)
		expectStatus(t, response, 503)
		excludesHTML(t, response.Body.String(), "Exported body", "<!doctype")
	}
}
