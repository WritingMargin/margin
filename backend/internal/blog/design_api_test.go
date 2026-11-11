package blog

import (
	"context"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"net/http"
	"strings"
	"testing"
)

func TestBlogDesignPatchValidationAndConflict(t *testing.T) {
	app, _ := coreFixture(t)
	testBlogDesignPatch(t, app)
}
func testBlogDesignPatch(t *testing.T, app *App) {
	t.Helper()
	app.Client = &http.Client{Transport: testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("design editing must not fetch central templates")
		return nil, nil
	})}
	before := responseRow(t, request(t, app, "GET", "/api/settings/design", nil, true), 200)
	changes := Row{"homepage": Row{"layout": "grid", "showSearch": false}, "article": Row{"bodySize": "large", "tableOfContents": Row{"style": "outlined", "maxDepth": float64(3)}}}
	candidate := responseRow(t, request(t, app, "POST", "/api/settings/design/validate", Row{"changes": changes}, true), 200)
	unchanged := responseRow(t, request(t, app, "GET", "/api/settings/design", nil, true), 200)
	if encode(before) != encode(unchanged) {
		t.Fatal("validation saved changes")
	}
	saved := responseRow(t, request(t, app, "PUT", "/api/settings/design", Row{"revision": candidate["revision"], "changes": changes}, true), 200)
	if encode(saved["design"]) != encode(candidate["design"]) {
		t.Fatal("saved and validated candidate differ")
	}
	assertDesignPreserved(t, object(before["design"]), object(saved["design"]))
	// A stale patch cannot overwrite either a prior MCP change or an editor save.
	expectStatus(t, request(t, app, "PUT", "/api/settings/design", Row{"revision": before["revision"], "changes": Row{"name": "stale"}}, true), 409)
	editor := object(saved["design"])
	editor["name"] = "Changed in editor"
	expectStatus(t, request(t, app, "PUT", "/api/settings", editor, true), 200)
	expectStatus(t, request(t, app, "PUT", "/api/settings/design", Row{"revision": saved["revision"], "changes": Row{"name": "stale"}}, true), 409)
	expectStatus(t, request(t, app, "PUT", "/api/settings/design", Row{"changes": changes}, true), 428)
	latest := responseRow(t, request(t, app, "GET", "/api/settings/design", nil, true), 200)
	for _, patch := range []Row{{"name": nil}, {"unknown": true}, {"homepage": Row{"sections": []any{}}}, {"article": Row{"tableOfContents": Row{"width": 10}}}} {
		expectStatus(t, request(t, app, "PUT", "/api/settings/design", Row{"revision": latest["revision"], "changes": patch}, true), 400)
	}
	after := responseRow(t, request(t, app, "GET", "/api/settings/design", nil, true), 200)
	if encode(after) != encode(latest) {
		t.Fatal("invalid patch changed saved design")
	}
}
func assertDesignPreserved(t *testing.T, before, after Row) {
	t.Helper()
	for _, key := range []string{"name", "description", "comments", "guide"} {
		if encode(before[key]) != encode(after[key]) {
			t.Fatalf("changed unrelated field %s", key)
		}
	}
	for _, key := range []string{"title", "description", "showImages", "pageSize"} {
		if encode(object(before["homepage"])[key]) != encode(object(after["homepage"])[key]) {
			t.Fatalf("changed unrelated homepage field %s", key)
		}
	}
}
func TestBlogDesignOwnerOnlyAndMounted(t *testing.T) {
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher"} {
		key := roleToken(t, app, role)
		expectStatus(t, tokenRequest(app, key, "GET", "/api/settings/design", nil), 403)
		expectStatus(t, tokenRequest(app, key, "POST", "/api/settings/design/validate", Row{"changes": Row{}}), 403)
		expectStatus(t, tokenRequest(app, key, "PUT", "/api/settings/design", Row{"revision": "x", "changes": Row{}}), 403)
	}
	expectStatus(t, request(t, app, "GET", "/api/settings/design", nil, false), 401)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	expectStatus(t, request(t, app, "GET", "/blog/api/settings/design", nil, true), 200)
}
func TestMCPBlogCustomisation(t *testing.T) {
	app, _, _ := publicFixture(t)
	session := mcpTestSession(t, app, "owner")
	before := mcpCall(t, session, "get_blog_design", Row{}, 200)
	sections := []any{
		Row{"id": "welcome", "component": "hero", "variant": "centered", "props": Row{"source": "latest", "title": Row{"bind": "blog.title"}, "description": Row{"bind": "content.description", "fallback": "Latest writing"}, "image": "", "buttonLabel": "Read the story", "buttonHref": Row{"bind": "content.url", "fallback": "#posts"}}},
		Row{"id": "stories", "component": "post-feed"},
	}
	changes := Row{"name": "An MCP publication", "homepage": Row{"sections": sections, "sectionSpacing": "compact"}, "article": Row{"headerLayout": "split"}, "showFooterLogo": true, "footerDescription": "A thoughtful closing line.", "footerLinks": []any{Row{"label": "About", "url": "/post/about"}}}
	candidate := mcpCall(t, session, "validate_blog_design", Row{"input": Row{"changes": changes}}, 200)
	if candidate["revision"] != before["revision"] {
		t.Fatal("validation changed revision")
	}
	saved := mcpCall(t, session, "update_blog_design", Row{"input": Row{"revision": candidate["revision"], "changes": changes}}, 200)
	page := request(t, app, "GET", "/", nil, false)
	containsHTML(t, page.Body.String(), "An MCP publication", "Read the story", "A thoughtful closing line.", `href="/post/about"`, `class="footer-logo"`)
	page = request(t, app, "GET", "/post/crawlable", nil, false)
	containsHTML(t, page.Body.String(), "article-layout-split")
	// Null clears an override; arrays replace instead of merging by index.
	saved = mcpCall(t, session, "update_blog_design", Row{"input": Row{"revision": saved["revision"], "changes": Row{"homepage": Row{"sections": []any{Row{"id": "only-feed", "component": "post-feed"}}}}}}, 200)
	if len(object(object(saved["design"])["homepage"])["sections"].([]any)) != 1 {
		t.Fatal("sections were not replaced")
	}
	saved = mcpCall(t, session, "update_blog_design", Row{"input": Row{"revision": saved["revision"], "changes": Row{"homepage": Row{"sections": nil}}}}, 200)
	if _, exists := object(object(saved["design"])["homepage"])["sections"]; exists {
		t.Fatal("null did not remove optional override")
	}
	mcpCall(t, session, "update_blog_design", Row{"input": Row{"revision": before["revision"], "changes": Row{"name": "stale"}}}, 409)
	mcpCall(t, session, "validate_blog_design", Row{"input": Row{"changes": Row{"homepage": Row{"sections": []any{Row{"id": "unsafe", "component": "script"}}}}}}, 400)
	// Reading resources is static and does not expose the current publication data.
	guide, err := session.ReadResource(context.Background(), &mcp.ReadResourceParams{URI: "margin://design/guide"})
	if err != nil || strings.Contains(guide.Contents[0].Text, "An MCP publication") {
		t.Fatal("invalid design reference", err)
	}
}

func TestBlogDesignConcurrentPatches(t *testing.T) {
	app, _ := coreFixture(t)
	initial := responseRow(t, request(t, app, "GET", "/api/settings/design", nil, true), 200)
	start := make(chan struct{})
	statuses := make(chan int, 2)
	for _, name := range []string{"First edit", "Second edit"} {
		go func() {
			<-start
			statuses <- tokenRequest(app, "owner", "PUT", "/api/settings/design", Row{"revision": initial["revision"], "changes": Row{"name": name}}).Code
		}()
	}
	close(start)
	counts := map[int]int{}
	for range 2 {
		counts[<-statuses]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent edits overwrote each other: %v", counts)
	}
}
func TestBlogDesignPostgreSQL(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	app, _ := postgresApp(t, db)
	testBlogDesignPatch(t, app)
}
