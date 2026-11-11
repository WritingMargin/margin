package blog

import (
	"testing"
	"testing/fstest"
)

func TestWorkspaceStartupUsesPublicationBranding(t *testing.T) {
	for _, base := range []string{"", "/blog", "/myblog"} {
		t.Run(base, func(t *testing.T) {
			app, _ := coreFixture(t)
			t.Setenv("MARGIN_BASE_PATH", base)
			app.Web = fstest.MapFS{"index.html": {Data: []byte(`<html><body><main id="margin-startup" role="status">` + startupPlaceholder + `</main><script nonce="__MARGIN_NONCE__">window.boot=true</script></body></html>`)}}
			theme := defaultTheme()
			theme["name"], theme["background"], theme["text"], theme["accent"] = `Notes & <Ideas>`, "#112233", "#ddeeff", "#bb8855"
			theme["logo"] = "https://images.example.test/logo.svg"
			home := object(theme["homepage"])
			home["font"], home["width"] = "plex-mono", "narrow"
			expectStatus(t, request(t, app, "PUT", base+"/api/settings", theme, true), 200)
			for _, kind := range []string{"blog", "article", "research"} {
				expectStatus(t, request(t, app, "PUT", base+"/api/settings/publication", Row{"type": kind}, true), 200)
				page := request(t, app, "GET", base+"/admin/posts/new", nil, false)
				expectStatus(t, page, 200)
				containsHTML(t, page.Body.String(), `Opening Notes &amp; &lt;Ideas&gt;…`, publicationLabels[kind].Navigation+" workspace is loading.", `src="https://images.example.test/logo.svg"`, "--blog-background:#112233", "--blog-text:#ddeeff", "--accent:#bb8855", "IBM Plex Mono", "--home-width:760px", `href="`+base+`/"`)
				excludesHTML(t, page.Body.String(), "Opening the journal", "data-margin-startup", "<Ideas>", "__MARGIN_NONCE__")
				if page.Header().Get("Cache-Control") != "no-store" {
					t.Fatal("workspace branding must not be cached")
				}
			}
		})
	}
}

func TestWorkspaceStartupEscapesBranding(t *testing.T) {
	theme := defaultTheme()
	theme["name"] = `<script>alert("test")</script>`
	page := workspaceStartup(startupPlaceholder, theme)
	containsHTML(t, page, "&lt;script&gt;", `/api/public/brand.svg`)
	excludesHTML(t, page, "<script>", "data-margin-startup")
	if got := workspaceStartup("older workspace build", theme); got != "older workspace build" {
		t.Fatal("changed a document without a startup placeholder")
	}
}
