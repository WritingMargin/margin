package blog

import (
	"strings"
	"testing"
)

func TestSectionThemesPersistAndRenderIndependently(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	home := theme["homepage"].(map[string]any)
	article := theme["article"].(map[string]any)
	home["background"], home["text"], home["accent"] = "#17212b", "#edf2f7", "#a9c7ff"
	article["background"], article["text"], article["accent"] = "#fbf8f1", "#352f28", "#8b432c"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
	if saved["homepage"].(map[string]any)["background"] != "#17212b" || saved["article"].(map[string]any)["background"] != "#fbf8f1" {
		t.Fatal("section colors were not saved")
	}
	for _, tc := range []struct{ path, background, text, accent, other string }{
		{"/", "#17212b", "#edf2f7", "#a9c7ff", "#fbf8f1"},
		{"/post/crawlable", "#fbf8f1", "#352f28", "#8b432c", "#17212b"},
	} {
		page := request(t, app, "GET", tc.path, nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), "--blog-background:"+tc.background, "--blog-text:"+tc.text, "--accent:"+tc.accent)
		excludesHTML(t, page.Body.String(), "--blog-background:"+tc.other)
	}
}

func TestSectionThemeColorsRejectUnsafeValues(t *testing.T) {
	app, _ := coreFixture(t)
	for _, section := range []string{"homepage", "article"} {
		for _, key := range []string{"background", "text", "accent"} {
			for _, value := range []any{"red;background:url(https://bad.example)", "#fff", nil} {
				theme := defaultTheme()
				theme[section].(map[string]any)[key] = value
				expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
			}
		}
	}
}

func TestPageStructuresPersistAndRender(t *testing.T) {
	app, _, _ := publicFixture(t)
	for _, tc := range []struct{ feed, intro, opening string }{
		{"magazine", "split", "cover-first"},
		{"list", "sidebar", "split"},
		{"grid", "centered", "centered"},
	} {
		theme := defaultTheme()
		home := object(theme["homepage"])
		article := object(theme["article"])
		home["layout"], home["heroLayout"] = tc.feed, tc.intro
		article["headerLayout"] = tc.opening
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
		saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
		if object(saved["homepage"]).str("heroLayout") != tc.intro || object(saved["article"]).str("headerLayout") != tc.opening {
			t.Fatal("structure settings were not preserved")
		}
		homepage := request(t, app, "GET", "/", nil, false)
		expectStatus(t, homepage, 200)
		containsHTML(t, homepage.Body.String(), "home-intro-"+tc.intro, "journal-layout-"+tc.feed, `class="journal-feed"`)
		page := request(t, app, "GET", "/post/crawlable", nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), "article-layout-"+tc.opening, `class="article-heading"`)
	}
}

func TestPageStructuresLegacyDefaultsAndInvalidValues(t *testing.T) {
	app, _ := coreFixture(t)
	theme := defaultTheme()
	delete(object(theme["homepage"]), "heroLayout")
	delete(object(theme["article"]), "headerLayout")
	saved := responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	if object(saved["homepage"]).str("heroLayout") != "split" || object(saved["article"]).str("headerLayout") != "standard" {
		t.Fatal("legacy designs must retain the classic structure")
	}
	for _, tc := range []struct{ section, field string }{{"homepage", "heroLayout"}, {"article", "headerLayout"}, {"homepage", "layout"}} {
		invalid := defaultTheme()
		object(invalid[tc.section])[tc.field] = "arbitrary-layout"
		expectStatus(t, request(t, app, "PUT", "/api/settings", invalid, true), 400)
	}
}

func TestArticleOpeningCoverOrderAndFallback(t *testing.T) {
	app, _, post := publicFixture(t)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "cover": "https://example.com/cover.jpg"}, true), 200)
	for _, layout := range []string{"standard", "cover-first", "split", "centered"} {
		for _, show := range []bool{true, false} {
			theme := defaultTheme()
			article := object(theme["article"])
			article["headerLayout"], article["showCover"] = layout, show
			expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
			page := request(t, app, "GET", "/post/crawlable", nil, false)
			expectStatus(t, page, 200)
			html := page.Body.String()
			if !show {
				containsHTML(t, html, `article-opening without-cover`, `<h1>Crawlable story</h1>`)
				excludesHTML(t, html, `class="article-cover"`)
				continue
			}
			if strings.Count(html, `class="article-cover"`) != 1 {
				t.Fatal("cover must render exactly once")
			}
			coverFirst := strings.Index(html, `class="article-cover"`) < strings.Index(html, `class="article-heading"`)
			if coverFirst != (layout == "cover-first") {
				t.Fatalf("incorrect cover order for %s", layout)
			}
		}
	}
}
