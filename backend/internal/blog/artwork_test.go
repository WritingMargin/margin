package blog

import (
	"encoding/base64"
	"testing"
)

func TestArtworkLegacyAndValidation(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	home := objectField(theme, "homepage")
	for _, key := range []string{"artworkType", "artworkEmoji", "artworkImage"} {
		delete(home, key)
	}
	saved := responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	if objectField(saved, "homepage").str("artworkType") != "logo" {
		t.Fatal("legacy designs must default to their blog logo")
	}
	for _, url := range []string{"javascript:alert(1)", "data:image/svg+xml,bad", "/api/public/logos/../secret"} {
		home["artworkImage"] = url
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}

func TestArtworkEmojiAndMountedImage(t *testing.T) {
	app, _, _ := publicFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	theme := defaultTheme()
	home := objectField(theme, "homepage")
	home["artworkType"], home["artworkEmoji"] = "emoji", "🌿<script>"
	expectStatus(t, request(t, app, "PUT", "/blog/api/settings", theme, true), 200)
	page := request(t, app, "GET", "/blog/", nil, false).Body.String()
	containsHTML(t, page, `<span class="art-emoji">🌿&lt;script&gt;</span>`)
	home["artworkType"], home["artworkImage"] = "image", ""
	expectStatus(t, request(t, app, "PUT", "/blog/api/settings", theme, true), 200)
	containsHTML(t, request(t, app, "GET", "/blog/", nil, false).Body.String(), `class="art-logo" src="/blog/api/public/brand.svg"`)
}

func TestArtworkUploadPublication(t *testing.T) {
	app, _, _ := publicFixture(t)
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	created := responseRow(t, uploadRequest(t, app, "/api/settings/logo", "image/png", png), 201)
	url := created.str("url")
	expectStatus(t, request(t, app, "GET", url, nil, false), 404)
	theme := defaultTheme()
	home := objectField(theme, "homepage")
	home["artworkType"], home["artworkImage"] = "image", url
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", url, nil, false), 200)
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `class="art-logo" src="`+url+`"`)
	assertIcon(t, app, "/api/public/brand.svg")
	home["showArtwork"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", url, nil, false), 404)
	excludesHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `class="journal-art"`)
}
