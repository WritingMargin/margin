package blog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInvalidSavedThemeFailsInsteadOfUsingDefaults(t *testing.T) {
	app, _ := coreFixture(t)
	expectStatus(t, request(t, app, "GET", "/api/public/settings", nil, false), 200)
	app.DB.Must(context.Background(), "INSERT INTO settings(id,theme) VALUES(1,$1)", `{"name":"Incomplete old design"}`)
	for _, route := range []string{"/api/settings", "/api/public/settings", "/"} {
		expectStatus(t, request(t, app, "GET", route, nil, true), 500)
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings", defaultTheme(), true), 200)
	expectStatus(t, request(t, app, "GET", "/api/public/settings", nil, false), 200)
}
func TestCAPTCHARequiresSavedConfiguration(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("TURNSTILE_SITE_KEY", "unused-site")
	t.Setenv("TURNSTILE_SECRET_KEY", "unused-secret")
	result := responseRow(t, request(t, app, "GET", "/api/settings/turnstile", nil, true), 200)
	if result.yes("secretConfigured") || result.str("source") != "none" {
		t.Fatal("unsaved CAPTCHA settings accepted")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	expectStatus(t, request(t, app, "PUT", "/api/settings/turnstile", Row{"siteKey": "saved-site", "secretKey": "saved-secret"}, true), 200)
	result = responseRow(t, request(t, app, "GET", "/api/public/settings", nil, false), 200)
	if result.str("captchaSiteKey") != "saved-site" {
		t.Fatal(result)
	}
}
func TestServerSecurityDefaultsToProduction(t *testing.T) {
	t.Setenv("MARGIN_ENV", "")
	t.Setenv("NODE_ENV", "development")
	w := httptest.NewRecorder()
	securityHeaders(w)
	if w.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("production security must be the default")
	}
}
func TestPageFontPolicyAllowsEmbeddedFonts(t *testing.T) {
	for _, mode := range []string{"production", "development"} {
		t.Run(mode, func(t *testing.T) {
			app, _, _ := publicFixture(t)
			t.Setenv("MARGIN_ENV", mode)
			for _, route := range []string{"/", "/admin"} {
				page := request(t, app, http.MethodGet, route, nil, false)
				expectStatus(t, page, http.StatusOK)
				policy := map[string]string{}
				for _, directive := range strings.Split(page.Header().Get("Content-Security-Policy"), ";") {
					name, value, _ := strings.Cut(strings.TrimSpace(directive), " ")
					policy[name] = value
				}
				if policy["font-src"] != "'self' data:" {
					t.Fatalf("%s: embedded fonts are not permitted: %q", route, policy["font-src"])
				}
				if policy["default-src"] != "'self'" || strings.Contains(policy["script-src"], "data:") {
					t.Fatalf("%s: font permission must not broaden default or script sources", route)
				}
			}
		})
	}
}
func TestRetiredAuthEntryURLsDoNotRedirect(t *testing.T) {
	app, _ := coreFixture(t)
	for _, route := range []string{"/login", "/signup", "/setup"} {
		w := request(t, app, http.MethodGet, route, nil, false)
		expectStatus(t, w, 404)
		if w.Header().Get("Location") != "" {
			t.Fatal("retired route redirected")
		}
	}
}

func TestDiagramAssetOrigins(t *testing.T) {
	t.Setenv("MARGIN_MODEL_ORIGINS", "https://models.example.test https://bad.test;x http://insecure.test https://*.wild.test https://bad.test/path")
	w := httptest.NewRecorder()
	securityHeaders(w)
	policy := w.Header().Get("Content-Security-Policy")
	containsHTML(t, policy, "https://models.example.test", "https://embed.figma.com")
	excludesHTML(t, policy, "bad.test", "insecure.test", "wild.test")
}
