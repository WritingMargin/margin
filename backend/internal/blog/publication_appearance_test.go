package blog

import (
	"context"
	"testing"
)

func TestPublicationAppearancePersistsAndRendersOnHomepageAndArticle(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	theme["background"], theme["text"] = "#182028", "#eef2f6"
	theme["imageBorder"], theme["videoBorder"] = "bold", "none"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
	if saved.str("background") != "#182028" || saved.str("videoBorder") != "none" {
		t.Fatal("appearance was not saved")
	}
	for _, path := range []string{"/", "/post/crawlable"} {
		page := request(t, app, "GET", path, nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), `<html lang="en" data-public-theme style=`, "--blog-background:#182028", "--blog-text:#eef2f6", "--image-border-width:2px", "--video-border-width:0px")
	}
}

func TestPublicationAppearanceLegacyDefaultsAndValidation(t *testing.T) {
	app, _ := coreFixture(t)
	old := defaultTheme()
	for _, key := range []string{"background", "text", "imageBorder", "videoBorder"} {
		delete(old, key)
	}
	app.DB.Must(context.Background(), "INSERT INTO settings(id,theme) VALUES(1,$1)", encode(old))
	saved := responseRow(t, request(t, app, "GET", "/api/settings", nil, true), 200)
	if saved.str("background") != "#ffffff" || saved.str("imageBorder") != "subtle" {
		t.Fatal("older themes must acquire appearance defaults")
	}
	for _, key := range []string{"background", "text", "imageBorder", "videoBorder"} {
		invalid := defaultTheme()
		invalid[key] = "red;background:url(https://bad.example)"
		expectStatus(t, request(t, app, "PUT", "/api/settings", invalid, true), 400)
	}
}

func TestPublicationMediaFrameOverridesAndRSSIsolation(t *testing.T) {
	source := "[Image src=\"https://example.com/default.png\"]\n\n[Image src=\"https://example.com/plain.png\" frame=\"plain\"]\n\n[Video src=\"https://example.com/movie.mp4\" frame=\"border\"]\n\n:video{src=\"https://example.com/inline.mp4\" frame=\"plain\"}"
	markup := renderMarkdown(source, "https://example.com/post/test", true)
	containsHTML(t, markup, `class="md-media md-frame-auto"`, `class="md-media md-frame-plain"`, `class="md-media md-frame-border md-video-figure"`, `class="md-media md-frame-plain md-video-figure"`)
	excludesHTML(t, rssMarkdown(source, "https://example.com/post/test"), "md-frame-")
	unsafe := renderMarkdown("[Image src=\"https://example.com/a.png\" frame=\"invalid\"]", "https://example.com/post/test", true)
	containsHTML(t, unsafe, `class="md-media md-frame-auto"`)
}
