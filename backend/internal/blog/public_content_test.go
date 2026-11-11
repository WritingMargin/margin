package blog

import (
	"strings"
	"testing"
)

func TestPublicContentUsesIndependentDesigns(t *testing.T) {
	app, _ := coreFixture(t)
	theme := defaultTheme()
	for _, kind := range []string{"guide"} {
		theme[kind] = map[string]any(object(theme["article"]))
	}
	// Use independent clones to avoid coupling the test's design maps.
	guide := object(defaultTheme()["article"])
	guide["background"] = "#123456"
	guide["headerLayout"] = "centered"
	theme["guide"] = map[string]any(guide)
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, kind := range []string{"article", "guide"} {
		responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "Content " + kind, "slug": "render-" + kind, "content": "## Start\n\nRead the instructions.", "contentType": kind, "status": "published"}, true), 201)
		result := request(t, app, "GET", "/post/render-"+kind, nil, false)
		expectStatus(t, result, 200)
		html := result.Body.String()
		if !strings.Contains(html, `data-content-type="`+kind+`"`) {
			t.Fatal("missing type marker", kind)
		}
		if kind == "guide" && (!strings.Contains(html, "--blog-background:#123456") || !strings.Contains(html, "article-layout-centered")) {
			t.Fatal("guide design not rendered")
		}
		if kind != "guide" && strings.Contains(html, "--blog-background:#123456") {
			t.Fatal("guide design leaked", kind)
		}
	}
}
