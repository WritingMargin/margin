package blog

import (
	"encoding/xml"
	"os"
	"testing"
)

type dynamicFeed struct {
	Channel struct {
		Items []struct {
			Description string `xml:"description"`
			Content     string `xml:"encoded"`
		} `xml:"item"`
	} `xml:"channel"`
}

func dynamicExportFixture(t *testing.T) *App {
	t.Helper()
	app, _ := coreFixture(t)
	source, err := os.ReadFile("rss_testdata/dynamic-post.md")
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("PUBLIC_URL", "http://127.0.0.1:54939")
	responseRow(t, request(t, app, "POST", "/api/posts", Row{
		"title": "Interactive content export test", "slug": "dynamic-export-test", "excerpt": "Tabs, a gallery, video, charts, diagrams and a 3D scene in RSS and PDF.",
		"status": "published", "content": string(source),
	}, true), 201)
	return app
}

func dynamicFeedContent(t *testing.T, feed string) string {
	t.Helper()
	var parsed dynamicFeed
	if err := xml.Unmarshal([]byte(feed), &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Channel.Items) != 1 {
		t.Fatal("expected one feed item")
	}
	if parsed.Channel.Items[0].Description == "" {
		t.Fatal("missing summary")
	}
	return parsed.Channel.Items[0].Content
}

func TestDynamicContentExports(t *testing.T) {
	app := dynamicExportFixture(t)
	rss := request(t, app, "GET", "/rss.xml", nil, false)
	expectStatus(t, rss, 200)
	feed := dynamicFeedContent(t, rss.Body.String())
	assertRSSSafeHTML(t, feed)
	print := request(t, app, "GET", "/post/dynamic-export-test/print", nil, false)
	expectStatus(t, print, 200)
	for _, content := range []string{feed, print.Body.String()} {
		containsHTML(t, content, "For readers", "For writers", "This second panel must not disappear", "First slide:", "Second slide:", "Example video", "Response times", "Compute node", "flowchart LR")
		containsHTML(t, content, "http://127.0.0.1:54939/sample-one.svg", "http://127.0.0.1:54939/sample-two.svg", "language-chart", "language-mermaid", "Rotation and animation are available in the online article.")
		excludesHTML(t, content, "<iframe", "<canvas", "[Tabs", "[Carousel", "[Chart]")
	}
}
