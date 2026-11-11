package blog

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func assertIcon(t *testing.T, app *App, url string) {
	t.Helper()
	response := request(t, app, "GET", "/favicon.ico", nil, false)
	expectStatus(t, response, 302)
	if response.Header().Get("Location") != url || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("favicon must resolve the current saved logo without caching: %v", response.Header())
	}
	for _, path := range []string{"/", "/post/crawlable", "/read/crawlable", "/newsletter/confirm", "/newsletter/unsubscribe"} {
		page := request(t, app, "GET", path, nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), `<link rel="icon" href="`+url+`">`)
	}
}

func TestBlogIconFollowsPublishedDesign(t *testing.T) {
	app, _, _ := publicFixture(t)
	assertIcon(t, app, "/api/public/brand.svg")
	// An actual one-pixel PNG exercises the same upload/save flow as the designer.
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	created := responseRow(t, uploadRequest(t, app, "/api/settings/logo", "image/png", png), 201)
	logo := created.str("url")
	assertIcon(t, app, "/api/public/brand.svg")
	expectStatus(t, request(t, app, "GET", logo, nil, false), 404)
	theme := defaultTheme()
	theme["logo"] = logo
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	assertIcon(t, app, logo)
	icon := request(t, app, "GET", logo, nil, false)
	expectStatus(t, icon, 200)
	if !bytes.Equal(icon.Body.Bytes(), png) || icon.Header().Get("Content-Type") != "image/png" {
		t.Fatal("reader icon must use the uploaded image")
	}
	theme["logo"] = "https://images.example.test/new-logo.png"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	assertIcon(t, app, theme.str("logo"))
	expectStatus(t, request(t, app, "GET", logo, nil, false), 404)
	theme["logo"] = ""
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	assertIcon(t, app, "/api/public/brand.svg")
}

func TestMarginLogoWithoutFrontendAssets(t *testing.T) {
	app, _ := coreFixture(t)
	response := request(t, app, "GET", "/api/public/brand.svg", nil, false)
	expectStatus(t, response, 200)
	if response.Header().Get("Content-Type") != "image/svg+xml" || !bytes.Equal(response.Body.Bytes(), marginLogo) {
		t.Fatal("Margin logo must be embedded in the Go server")
	}
	head := request(t, app, "HEAD", "/api/public/brand.svg", nil, false)
	expectStatus(t, head, 200)
	if head.Body.Len() != 0 {
		t.Fatal("HEAD must not return the logo body")
	}
}
