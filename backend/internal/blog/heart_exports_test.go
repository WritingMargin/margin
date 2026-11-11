package blog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Exercise the real download handlers using the checked-in scientific article.
// Optionally retain responses for manual RSS/browser/PDF inspection.
func TestHeartArticleExports(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "http://127.0.0.1:4173")
	source, err := os.ReadFile("../../../examples/heart-atlas/article.md")
	if err != nil {
		t.Fatal(err)
	}
	responseRow(t, request(t, app, "POST", "/api/posts", Row{
		"title": "A closer look at the human heart", "slug": "inside-the-human-heart",
		"excerpt": "An interactive field guide to heart anatomy and blood flow.",
		"status":  "published", "content": string(source),
	}, true), 201)
	feed := request(t, app, "GET", "/rss.xml", nil, false)
	print := request(t, app, "GET", "/post/inside-the-human-heart/print", nil, false)
	markdown := request(t, app, "GET", "/posts/inside-the-human-heart.md?download=1", nil, false)
	expectStatus(t, feed, 200)
	expectStatus(t, print, 200)
	expectStatus(t, markdown, 200)
	html := dynamicFeedContent(t, feed.Body.String())
	assertRSSSafeHTML(t, html)
	for _, body := range []string{html, print.Body.String()} {
		containsHTML(t, body, "A heart in three dimensions", "72 beats/minute", "heart-poster.jpg", "heart-cutaway.jpg", "1. Right atrium", "13. Septum", "In the lungs", "In the body", "Question", "Explanation")
		excludesHTML(t, body, "language-scene", "language-illustration", "&quot;shapes&quot;", "<canvas", "[Scene", "[Illustration")
	}
	if !strings.Contains(markdown.Body.String(), string(source)) {
		t.Fatal("Markdown must preserve the complete authored source")
	}
	containsHTML(t, markdown.Header().Get("Content-Disposition"), "attachment", "inside-the-human-heart.md")
	if out := os.Getenv("HEART_EXPORT_DIR"); out != "" {
		if err := os.MkdirAll(out, 0755); err != nil {
			t.Fatal(err)
		}
		files := map[string]string{"rss.xml": feed.Body.String(), "print.html": print.Body.String(), "inside-the-human-heart.md": markdown.Body.String(), "rss-reader.html": `<!doctype html><html lang="en"><meta charset="utf-8"><title>Heart article · RSS content</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:18px/1.6 Georgia}img{max-width:100%;max-height:400px}figure{margin:24px 0}figcaption{font-size:14px;color:#555}dt{font-weight:bold}dd{margin:0 0 12px}pre{white-space:pre-wrap}</style><h1>A closer look at the human heart</h1>` + html + `</html>`}
		downloadDir := filepath.Join(out, "../posts")
		if err := os.MkdirAll(downloadDir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(downloadDir, "inside-the-human-heart.md"), markdown.Body.Bytes(), 0644); err != nil {
			t.Fatal(err)
		}
		for name, content := range files {
			if err := os.WriteFile(filepath.Join(out, name), []byte(content), 0644); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestSceneStaticFallbackSafety(t *testing.T) {
	payload := `{"title":"Heart <script>","description":"Safe text","poster":{"src":"/heart.jpg?x=1&y=2","alt":"A heart <img onerror=alert(1)>"},"objects":[{"label":"Muscle <script>"}]}`
	for _, source := range []string{"[Scene]\n" + payload + "\n[/Scene]", "```scene\n" + payload + "\n```"} {
		html := rssMarkdown(source, "https://example.test/post/heart")
		containsHTML(t, html, `src="https://example.test/heart.jpg?x=1&amp;y=2"`, "Muscle &lt;script&gt;")
		excludesHTML(t, html, "<script>", "<img onerror")
		containsHTML(t, html, `alt="A heart &lt;img onerror=alert(1)&gt;"`)
	}
	for _, src := range []string{"javascript:alert(1)", "//evil.test/x", "data:image/svg+xml,bad", "https://user:password@example.test/a.jpg", "/\\evil.test/x"} {
		if rssPosterHTML(&rssPoster{Src: src, Alt: "Bad"}) != "" {
			t.Fatalf("unsafe poster accepted: %s", src)
		}
	}
	containsHTML(t, rssScene("{bad json"), "language-scene", "{bad json")
}
