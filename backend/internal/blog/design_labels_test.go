package blog

import (
	"context"
	"strings"
	"testing"
)

func TestDesignLabelsPersistAndRender(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	objectField(theme, "homepage")["tagline"] = "Ideas <script>"
	theme["footerTitle"] = "Our <footer>"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
	if objectField(saved, "homepage").str("tagline") != "Ideas <script>" || saved.str("footerTitle") != "Our <footer>" {
		t.Fatal("custom labels were not saved")
	}
	home := request(t, app, "GET", "/", nil, false).Body.String()
	containsHTML(t, home, "Ideas &lt;script&gt;", `class="footer-title">Our &lt;footer&gt;`)
	excludesHTML(t, home, "AN INDEPENDENT BLOG")
	article := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, article, `class="footer-title">Our &lt;footer&gt;`)
	objectField(theme, "homepage")["showTagline"] = false
	theme["showFooterTitle"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, path := range []string{"/", "/post/crawlable"} {
		page := request(t, app, "GET", path, nil, false).Body.String()
		excludesHTML(t, page, "Ideas &lt;script&gt;", "footer-title", "live-dot")
		containsHTML(t, page, "Powered by", "Follow via RSS", `class="public-brand"`)
	}
}

func TestDesignLabelsLegacyDefaults(t *testing.T) {
	app, _, _ := publicFixture(t)
	old := defaultTheme()
	delete(old, "footerTitle")
	delete(old, "showFooterTitle")
	delete(old, "showFooterLogo")
	delete(objectField(old, "homepage"), "tagline")
	delete(objectField(old, "homepage"), "showTagline")
	app.DB.Must(context.Background(), "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=excluded.theme", encode(old))
	saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
	if saved["showFooterTitle"] != true || saved["showFooterLogo"] != false || objectField(saved, "homepage")["showTagline"] != true {
		t.Fatal("existing publications must keep their labels")
	}
	page := request(t, app, "GET", "/", nil, false).Body.String()
	containsHTML(t, page, "AN INDEPENDENT BLOG", `class="footer-title">Margin`)
}

func TestDesignLabelsValidation(t *testing.T) {
	app, _ := coreFixture(t)
	for _, key := range []string{"tagline", "showTagline", "footerTitle", "showFooterTitle"} {
		theme := defaultTheme()
		target := theme
		if key == "tagline" || key == "showTagline" {
			target = objectField(theme, "homepage")
		}
		target[key] = strings.Repeat("x", 151)
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}

func TestFooterDesignPersistsAndRendersSafely(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	theme["footerDescription"] = "A final <note>"
	theme["footerLinks"] = []any{Row{"label": "About <us>", "url": "/about"}, Row{"label": "Elsewhere", "url": "https://example.test"}}
	theme["footerLayout"] = "centered"
	theme["footerBackground"] = "#112233"
	theme["footerText"] = "#ffffff"
	theme["footerFont"] = "playfair"
	theme["showFooterLogo"] = true
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, path := range []string{"/", "/post/crawlable", "/privacy"} {
		html := request(t, app, "GET", path, nil, false).Body.String()
		containsHTML(t, html, "A final &lt;note&gt;", "About &lt;us&gt;", `href="/about"`, `data-layout="centered"`, "background-color:#112233", "Playfair Display", `class="footer-logo"`)
		excludesHTML(t, html, "A final <note>")
	}
}

func TestFooterDesignRejectsUnsafeLinks(t *testing.T) {
	app, _ := coreFixture(t)
	for _, href := range []string{"javascript:alert(1)", "//evil.example", "https://user:pass@example.test", "https://"} {
		theme := defaultTheme()
		theme["footerLinks"] = []any{Row{"label": "Bad", "url": href}}
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}

func TestFooterLinkUsesPublicationBasePath(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	if got := footerLinkURL("/post/hello"); got != "/journal/post/hello" {
		t.Fatalf("internal link = %q", got)
	}
	if got := footerLinkURL("https://example.test/about"); got != "https://example.test/about" {
		t.Fatalf("external link = %q", got)
	}
}
