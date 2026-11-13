package blog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
)

func oauthConsentDataRequest(a *App, query url.Values, browser bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "https://blog.test"+sitePath("/oauth/authorize")+"?"+query.Encode(), nil)
	r.Header.Set("Accept", "application/json")
	if browser {
		r.AddCookie(&http.Cookie{Name: sessionCookieName("margin_session"), Value: "browser"})
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestOAuthConsentAppShellAndPrivateData(t *testing.T) {
	a := oauthFixture(t)
	a.Web = fstest.MapFS{"index.html": {Data: []byte(`<html><div id="root"></div><script nonce="__MARGIN_NONCE__" src="/assets/app.js"></script></html>`)}}
	client := oauthRegisterTest(t, a, "content:read")
	query := oauthQuery(client.str("client_id"), "content:read", "https://blog.test/mcp")
	html := oauthHTTPRequest(a, "GET", "/oauth/authorize?"+query.Encode(), nil, true)
	expectStatus(t, html, 200)
	checkOAuthConsentShell(t, html)
	data := oauthConsentDataRequest(a, query, true)
	expectStatus(t, data, 200)
	if data.Header().Get("Cache-Control") != "no-store" || !strings.Contains(data.Header().Get("Vary"), "Accept") {
		t.Fatal("private response caching")
	}
	if strings.Contains(data.Body.String(), "<script>") {
		t.Fatal("client name not JSON escaped")
	}
	var payload struct {
		Client      struct{ Name string }
		Fields      map[string]string
		Permissions []oauthPermission
	}
	must(json.Unmarshal(data.Body.Bytes(), &payload))
	if payload.Client.Name != "Test app <script>" || payload.Fields["csrf"] == "" || len(payload.Permissions) != 1 || payload.Permissions[0].Scope != "content:read" {
		t.Fatal("incorrect consent contract")
	}
	denied := oauthConsentDataRequest(a, query, false)
	expectStatus(t, denied, 401)
	if denied.Header().Get("Location") != "" || strings.Contains(denied.Body.String(), `"fields"`) {
		t.Fatal("unauthenticated data request exposed consent or redirected fetch")
	}
}

func checkOAuthConsentShell(t *testing.T, html *httptest.ResponseRecorder) {
	t.Helper()
	if !strings.Contains(html.Body.String(), `id="root"`) || strings.Contains(html.Body.String(), "__MARGIN_NONCE__") {
		t.Fatal("missing nonce-bearing app shell")
	}
	for _, private := range []string{"Test app", `name="csrf"`, `name="permission"`} {
		if strings.Contains(html.Body.String(), private) {
			t.Fatal("private consent data in shell", private)
		}
	}
	csp := html.Header().Get("Content-Security-Policy")
	for _, directive := range []string{"script-src 'self' 'nonce-", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self' https://client.test"} {
		if !strings.Contains(csp, directive) {
			t.Fatal("missing consent protection", directive, csp)
		}
	}
	if strings.Contains(csp, "script-src 'unsafe-inline'") {
		t.Fatal("unsafe scripts enabled")
	}
}
