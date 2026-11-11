package blog

import (
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCarArticleAlongsideHeartExports(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "http://127.0.0.1:4173")
	for _, post := range []struct{ folder, slug, title string }{
		{"heart-atlas", "inside-the-human-heart", "A closer look at the human heart"},
		{"car-atlas", "inside-an-electric-car", "Under the skin of an electric car"},
	} {
		source, err := os.ReadFile("../../../examples/" + post.folder + "/article.md")
		if err != nil {
			t.Fatal(err)
		}
		responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": post.title, "slug": post.slug, "status": "published", "excerpt": "An interactive field guide.", "content": string(source)}, true), 201)
	}
	feed := request(t, app, "GET", "/rss.xml", nil, false)
	expectStatus(t, feed, 200)
	var parsed dynamicFeed
	if err := xml.Unmarshal(feed.Body.Bytes(), &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Channel.Items) != 2 {
		t.Fatal("both articles must coexist in one feed")
	}
	var content string
	for _, item := range parsed.Channel.Items {
		if strings.Contains(item.Content, "Explore the electric coupe") {
			content = item.Content
		}
	}
	assertRSSSafeHTML(t, content)
	print := request(t, app, "GET", "/post/inside-an-electric-car/print", nil, false)
	expectStatus(t, print, 200)
	markdown := request(t, app, "GET", "/posts/inside-an-electric-car.md?download=1", nil, false)
	expectStatus(t, markdown, 200)
	for _, body := range []string{content, print.Body.String()} {
		containsHTML(t, body, "car-poster.jpg", "car-exploded.jpg", "car-power-flow.jpg", "Stores electrical energy for propulsion.", "Chassis and axles", "Motor and reduction gear", "Power electronics", "Tyres → road", "Explanation")
		excludesHTML(t, body, "language-scene", "&quot;shape&quot;", "<canvas")
	}
	containsHTML(t, markdown.Header().Get("Content-Disposition"), "attachment", "inside-an-electric-car.md")
	source, _ := os.ReadFile("../../../examples/car-atlas/article.md")
	if !strings.Contains(markdown.Body.String(), string(source)) {
		t.Fatal("car source changed during download")
	}
	if out := os.Getenv("CAR_EXPORT_DIR"); out != "" {
		saveCarExportSamples(t, out, feed.Body.String(), content, print.Body.String(), markdown.Body.String())
	}
}

func saveCarExportSamples(t *testing.T, out, feed, content, print, markdown string) {
	t.Helper()
	files := map[string]string{
		"rss.xml": feed, "print.html": print, "inside-an-electric-car.md": markdown,
		"rss-reader.html":                                    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Car article · RSS content</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:18px/1.6 Georgia}img{max-width:100%;max-height:400px}figure{margin:24px 0}figcaption{font-size:14px;color:#555}dt{font-weight:bold}dd{margin:0 0 12px}</style><h1>Under the skin of an electric car</h1>` + content + `</html>`,
		"../../posts/inside-an-electric-car.md":              markdown,
		"../../post/inside-an-electric-car/print/index.html": print,
		"../rss.xml":    feed,
		"../../rss.xml": feed,
	}
	for name, body := range files {
		target := filepath.Join(out, name)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestSceneComponentDescriptionsAreEscaped(t *testing.T) {
	output := rssScene(`{"title":"Car","objects":[{"label":"Battery","description":"Stores energy. <script>alert(1)</script>"}]}`)
	containsHTML(t, output, "<strong>Battery</strong>", "Stores energy. &lt;script&gt;")
	excludesHTML(t, output, "<script>")
}
