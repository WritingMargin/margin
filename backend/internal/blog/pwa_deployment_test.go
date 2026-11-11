package blog

import (
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestPWADeploymentOrigins(t *testing.T) {
	for _, address := range []string{"https://example.com", "https://notes.example.com", "https://example.com/blog", "https://example.com/myblog"} {
		t.Run(address, func(t *testing.T) {
			app, _, _ := publicFixture(t)
			t.Setenv("PUBLIC_URL", address)
			// Exercise inference from PUBLIC_URL, not just an explicitly supplied mount.
			if err := os.Unsetenv("MARGIN_BASE_PATH"); err != nil {
				t.Fatal(err)
			}
			origin, err := url.Parse(address)
			if err != nil {
				t.Fatal(err)
			}
			base := origin.Path
			if BasePath() != base {
				t.Fatalf("inferred %q, want %q", BasePath(), base)
			}
			manifest := responseRow(t, deploymentPWARequest(t, app, "GET", address+"/manifest.webmanifest", "", false), 200)
			assertPWAFields(t, manifest, Row{"id": base + "/", "scope": base + "/", "start_url": base + "/"})
			assertDeploymentIcons(t, app, origin, manifest)
			assertDeploymentInstallSetting(t, app, address, base, false)
			settings := defaultPWA()
			settings["showInstallButton"], settings["startPage"] = true, "workspace"
			expectStatus(t, deploymentPWARequest(t, app, "PUT", address+"/api/settings/pwa", encode(settings), true), 200)
			assertDeploymentInstallSetting(t, app, address, base, true)
			changed := responseRow(t, deploymentPWARequest(t, app, "GET", address+"/manifest.webmanifest", "", false), 200)
			assertPWAFields(t, changed, Row{"id": manifest.str("id"), "scope": base + "/", "start_url": base + "/admin"})
			expectStatus(t, deploymentPWARequest(t, app, "GET", address+"/admin", "", false), 200)
			settings["showInstallButton"] = false
			expectStatus(t, deploymentPWARequest(t, app, "PUT", address+"/api/settings/pwa", encode(settings), true), 200)
			assertDeploymentInstallSetting(t, app, address, base, false)
		})
	}
}

func deploymentPWARequest(t *testing.T, app *App, method, address, body string, owner bool) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, address, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if owner {
		r.Header.Set("Authorization", "Bearer owner")
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	return w
}

func assertDeploymentIcons(t *testing.T, app *App, origin *url.URL, manifest Row) {
	t.Helper()
	for _, item := range manifest["icons"].([]any) {
		icon := object(item)
		resolved, err := origin.Parse(icon.str("src"))
		if err != nil {
			t.Fatal(err)
		}
		if resolved.Host != origin.Host || resolved.Scheme != "https" || !strings.HasPrefix(resolved.Path, origin.Path+"/pwa/icon/") {
			t.Fatalf("icon escaped deployment: %s", resolved)
		}
		size := 192
		if icon.str("sizes") == "512x512" {
			size = 512
		}
		pwaPNG(t, deploymentPWARequest(t, app, "GET", resolved.String(), "", false), size)
	}
	pwaPNG(t, deploymentPWARequest(t, app, "GET", origin.String()+"/pwa/icon/180.png", "", false), 180)
}

func assertDeploymentInstallSetting(t *testing.T, app *App, address, base string, enabled bool) {
	t.Helper()
	theme := responseRow(t, deploymentPWARequest(t, app, "GET", address+"/api/public/settings", "", false), 200)
	if theme.str("publicUrl") != address || object(theme["pwa"]).yes("showInstallButton") != enabled {
		t.Fatalf("wrong public deployment settings: %v", theme)
	}
	for _, path := range []string{"/", "/post/crawlable", "/newsletter/confirm"} {
		page := deploymentPWARequest(t, app, "GET", address+path, "", false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), `<link rel="manifest" href="`+base+`/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="`+base+`/pwa/icon/180.png">`)
	}
}
