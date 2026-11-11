package blog

import "testing"

func TestContentsDesignPersistsAndRenders(t *testing.T) {
	app, _, post := publicFixture(t)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "tableOfContents": "right", "content": "## First\n\n### Detail\n\n## Last"}, true), 200)
	theme := defaultTheme()
	design := map[string]any{"title": "Explore <this>", "style": "filled", "numbered": true, "maxDepth": float64(2), "sticky": false, "width": float64(260), "radius": float64(0), "background": "#eef2ff", "text": "#123456", "accent": "#654321"}
	object(theme["article"])["tableOfContents"] = design
	saved := responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	if object(object(saved["article"])["tableOfContents"])["width"] != float64(260) {
		t.Fatal("design not saved")
	}
	output := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, output, `data-style="filled"`, `data-numbered="true"`, `data-sticky="false"`, `--toc-width:260px`, `--toc-radius:0px`, `--toc-background:#eef2ff`, `Explore &lt;this&gt;`, `href="#section-last"`, `id="article-section-2"`)
	excludesHTML(t, output, `href="#section-detail">Detail</a>`)
	catalog := templateCatalogFixture(t)
	object(object(catalog["article"].([]any)[0])["design"])["tableOfContents"] = design
	if !validTemplateCatalog(catalog) {
		t.Fatal("catalog rejected contents design")
	}
	design["title"] = ""
	excludesHTML(t, sectionedArticle("## First", "https://example.com/", true, "top", design, ""), "<strong>")
	design["maxDepth"] = float64(1)
	excludesHTML(t, sectionedArticle("## First", "https://example.com/", true, "top", design, ""), "article-toc-layout")
}

func TestContentsDesignValidation(t *testing.T) {
	app, _ := coreFixture(t)
	for _, invalid := range []any{nil, Row{"style": "custom"}, Row{"width": 321}, Row{"width": 180.5}, Row{"sticky": "false"}, Row{"maxDepth": 0}, Row{"radius": -1}, Row{"accent": "red;display:none"}, Row{"unknown": true}} {
		theme := defaultTheme()
		object(theme["article"])["tableOfContents"] = invalid
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}
