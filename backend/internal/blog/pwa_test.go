package blog

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"strings"
	"testing"
)

func TestPWAManifestUsesLiveBrandingAndStableIdentity(t *testing.T) {
	app, _ := coreFixture(t)
	theme := defaultTheme()
	theme["name"], theme["accent"], theme["background"] = "Ada's Notes", "#123456", "#fafafa"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	initial := responseRow(t, request(t, app, "GET", "/manifest.webmanifest", nil, false), 200)
	assertPWAFields(t, initial, Row{"name": "Ada's Notes", "theme_color": "#123456", "background_color": "#fafafa", "scope": "/", "start_url": "/", "display": "standalone"})
	settings := defaultPWA()
	settings["name"], settings["shortName"], settings["startPage"] = "Ada's Pocket Notes", "Notes", "workspace"
	settings["themeColor"], settings["backgroundColor"] = "#aabbcc", "#112233"
	responseRow(t, request(t, app, "PUT", "/api/settings/pwa", settings, true), 200)
	changed := responseRow(t, request(t, app, "GET", "/manifest.webmanifest", nil, false), 200)
	assertPWAFields(t, changed, Row{"id": initial.str("id"), "name": "Ada's Pocket Notes", "short_name": "Notes", "start_url": "/admin", "theme_color": "#aabbcc"})
	theme["name"] = "Renamed publication"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	overridden := responseRow(t, request(t, app, "GET", "/manifest.webmanifest", nil, false), 200)
	if overridden.str("name") != "Ada's Pocket Notes" {
		t.Fatal("design overwrote explicit PWA override")
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", defaultPWA(), true), 200)
	reset := responseRow(t, request(t, app, "GET", "/manifest.webmanifest", nil, false), 200)
	if reset.str("name") != "Renamed publication" || reset.str("id") != initial.str("id") {
		t.Fatal("reset did not restore live branding")
	}
}

func TestPWAMountPathsAndDiscovery(t *testing.T) {
	for _, base := range []string{"", "/blog", "/public/notes"} {
		t.Run(base, func(t *testing.T) {
			app, _, _ := publicFixture(t)
			t.Setenv("MARGIN_BASE_PATH", base)
			response := request(t, app, "GET", base+"/manifest.webmanifest", nil, false)
			manifest := responseRow(t, response, 200)
			assertPWAFields(t, manifest, Row{"id": base + "/", "scope": base + "/", "start_url": base + "/"})
			if response.Header().Get("Content-Type") != "application/manifest+json; charset=utf-8" || response.Header().Get("Cache-Control") != "no-cache" {
				t.Fatal(response.Header())
			}
			for _, item := range manifest["icons"].([]any) {
				icon := object(item)
				if !strings.HasPrefix(icon.str("src"), base+"/pwa/icon/") {
					t.Fatal(icon)
				}
				expectStatus(t, request(t, app, "GET", icon.str("src"), nil, false), 200)
			}
			for _, path := range []string{"/", "/post/crawlable", "/newsletter/confirm"} {
				page := request(t, app, "GET", base+path, nil, false)
				expectStatus(t, page, 200)
				containsHTML(t, page.Body.String(), `<link rel="manifest" href="`+base+`/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="`+base+`/pwa/icon/180.png">`)
			}
			for _, path := range []string{"/manifest.webmanifest", "/pwa/icon/180.png"} {
				head := request(t, app, "HEAD", base+path, nil, false)
				expectStatus(t, head, 200)
				if head.Body.Len() != 0 {
					t.Fatal("HEAD returned a body")
				}
			}
			settings := defaultPWA()
			settings["startPage"] = "workspace"
			expectStatus(t, request(t, app, "PUT", base+"/api/settings/pwa", settings, true), 200)
			manifest = responseRow(t, request(t, app, "GET", base+"/manifest.webmanifest", nil, false), 200)
			if manifest.str("start_url") != base+"/admin" {
				t.Fatal(manifest)
			}
		})
	}
}

func pwaTestPNG(t *testing.T, width, height int, ink color.Color) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, ink)
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
func pwaPNG(t *testing.T, response *httptest.ResponseRecorder, size int) image.Image {
	t.Helper()
	expectStatus(t, response, 200)
	decoded, err := png.Decode(bytes.NewReader(response.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Dx() != size || decoded.Bounds().Dy() != size || response.Header().Get("Content-Type") != "image/png" {
		t.Fatal("incorrect icon dimensions or type")
	}
	return decoded
}
func TestPWAIconsFollowOnlySavedLogoAndOverrides(t *testing.T) {
	app, _ := coreFixture(t)
	before := request(t, app, "GET", "/pwa/icon/192.png", nil, false).Body.Bytes()
	red := color.NRGBA{R: 255, A: 255}
	data := pwaTestPNG(t, 80, 40, red)
	upload := responseRow(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/png", data), 201)
	expectStatus(t, request(t, app, "GET", upload.str("url"), nil, false), 404)
	if !bytes.Equal(before, request(t, app, "GET", "/pwa/icon/192.png", nil, false).Body.Bytes()) {
		t.Fatal("unsaved upload changed public icon")
	}
	theme := defaultTheme()
	theme["logo"] = upload.str("url")
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, size := range []int{180, 192, 512} {
		image := pwaPNG(t, request(t, app, "GET", "/pwa/icon/"+strconv.Itoa(size)+".png", nil, false), size)
		if color.NRGBAModel.Convert(image.At(size/2, size/2)) != red {
			t.Fatal("generated icon did not use saved blog logo")
		}
		if color.NRGBAModel.Convert(image.At(0, 0)) != pwaColor(theme.str("background")) {
			t.Fatal("maskable icon missing opaque padding")
		}
	}
	green := color.NRGBA{G: 255, A: 255}
	override := responseRow(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/png", pwaTestPNG(t, 40, 80, green)), 201)
	settings := defaultPWA()
	settings["icon"] = override.str("url")
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", settings, true), 200)
	icon := pwaPNG(t, request(t, app, "GET", "/pwa/icon/192.png", nil, false), 192)
	if color.NRGBAModel.Convert(icon.At(96, 96)) != green {
		t.Fatal("icon override was not used")
	}
	expectStatus(t, request(t, app, "GET", upload.str("url"), nil, false), 200)
	// The source upload remains private; only its generated install icons are published.
	expectStatus(t, request(t, app, "GET", override.str("url"), nil, false), 404)
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", defaultPWA(), true), 200)
	icon = pwaPNG(t, request(t, app, "GET", "/pwa/icon/192.png", nil, false), 192)
	if color.NRGBAModel.Convert(icon.At(96, 96)) != red {
		t.Fatal("reset did not restore logo")
	}
	expectStatus(t, request(t, app, "GET", "/pwa/icon/99999.png", nil, false), 404)
}

func TestPWASettingsAuthorizationAndValidation(t *testing.T) {
	app, _ := coreFixture(t)
	expectStatus(t, request(t, app, "GET", "/api/settings/pwa", nil, false), 401)
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", defaultPWA(), false), 401)
	app.DB.Must(context.Background(), "UPDATE api_tokens SET role='reader' WHERE token_hash=$1", hash("owner"))
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", defaultPWA(), true), 403)
	expectStatus(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/png", []byte("bad")), 403)
	app.DB.Must(context.Background(), "UPDATE api_tokens SET role='owner' WHERE token_hash=$1", hash("owner"))
	for key, value := range map[string]string{"startPage": "https://evil.example/", "icon": "/api/media/private", "themeColor": "red", "backgroundColor": "#123", "name": strings.Repeat("x", 121)} {
		input := defaultPWA()
		input[key] = value
		expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", input, true), 400)
	}
	missing := defaultPWA()
	missing["icon"] = "/api/public/logos/00000000-0000-0000-0000-000000000000"
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", missing, true), 400)
	expectStatus(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/png", []byte("not an image")), 400)
}
func TestPWARemoteLogoRestrictions(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "64:ff9b::7f00:1", "2002:7f00:1::"} {
		if publicPWAIP(netip.MustParseAddr(address)) {
			t.Errorf("allowed private/special IP %s", address)
		}
	}
	if !publicPWAIP(netip.MustParseAddr("8.8.8.8")) || !publicPWAIP(netip.MustParseAddr("2606:4700:4700::1111")) {
		t.Fatal("public addresses rejected")
	}
	for _, source := range []string{"", "http://example.com/icon.png", "https://user:pass@example.com/icon.png", "https://example.com:8443/icon.png", "file:///etc/passwd", "https://127.0.0.1/icon.png"} {
		if _, err := fetchPWALogo(context.Background(), source); err == nil {
			t.Errorf("unsafe logo accepted: %s", source)
		}
	}
}

func assertPWAFields(t *testing.T, actual, expected Row) {
	t.Helper()
	for key, value := range expected {
		if actual[key] != value {
			t.Fatalf("%s: got %v, want %v", key, actual[key], value)
		}
	}
}

func TestPWAInstallButtonRequiresExplicitOwnerOptIn(t *testing.T) {
	app, _, _ := publicFixture(t)
	assertPublicInstallButton(t, app, false)
	// Older saved settings remain valid and never opt a publication in silently.
	legacy := defaultPWA()
	delete(legacy, "showInstallButton")
	app.saveSiteSetting(context.Background(), "pwa", legacy)
	saved := responseRow(t, request(t, app, "GET", "/api/settings/pwa", nil, true), 200)
	if saved.yes("showInstallButton") {
		t.Fatal("legacy settings enabled installation UI")
	}
	assertPublicInstallButton(t, app, false)
	saved["showInstallButton"] = true
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", saved, false), 401)
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", saved, true), 200)
	assertPublicInstallButton(t, app, true)
	saved["showInstallButton"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", saved, true), 200)
	assertPublicInstallButton(t, app, false)
	saved["showInstallButton"] = "true"
	expectStatus(t, request(t, app, "PUT", "/api/settings/pwa", saved, true), 400)
}

func assertPublicInstallButton(t *testing.T, app *App, enabled bool) {
	t.Helper()
	theme := responseRow(t, request(t, app, "GET", "/api/public/settings", nil, false), 200)
	pwa := object(theme["pwa"])
	if pwa.yes("showInstallButton") != enabled || len(pwa) != 2 {
		t.Fatalf("incorrect public install settings: %v", pwa)
	}
	for _, path := range []string{"/", "/post/crawlable", "/newsletter/confirm"} {
		page := request(t, app, "GET", path, nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), `"showInstallButton":`+strconv.FormatBool(enabled))
	}
}
