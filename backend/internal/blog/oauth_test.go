package blog

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"html"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

func oauthFixture(t *testing.T) *App {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,'owner@example.test','unused')")
	a.DB.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
	return a
}
func oauthHTTPRequest(a *App, method, path string, form url.Values, browser bool) *httptest.ResponseRecorder {
	var data string
	if form != nil {
		data = form.Encode()
	}
	r := httptest.NewRequest(method, "https://blog.test"+path, strings.NewReader(data))
	if form != nil {
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if browser {
		r.AddCookie(&http.Cookie{Name: sessionCookieName("margin_session"), Value: "browser"})
		r.Header.Set("Origin", "https://blog.test")
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func oauthRegisterTest(t *testing.T, a *App, role string) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", sitePath("/oauth/register"), Row{"client_name": "Test app <script>", "redirect_uris": []string{"https://client.test/callback"}, "scope": role}, false), 201)
}

const oauthTestVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"

func oauthQuery(client, role, resource string) url.Values {
	digest := sha256.Sum256([]byte(oauthTestVerifier))
	return url.Values{"client_id": {client}, "redirect_uri": {"https://client.test/callback"}, "response_type": {"code"}, "scope": {role}, "state": {"state+with&symbols"}, "code_challenge": {base64.RawURLEncoding.EncodeToString(digest[:])}, "code_challenge_method": {"S256"}, "resource": {resource}}
}

var oauthHiddenPattern = regexp.MustCompile(`<input type="hidden" name="([^"]+)" value="([^"]*)">`)

func oauthConsentForm(t *testing.T, a *App, query url.Values) url.Values {
	t.Helper()
	w := oauthHTTPRequest(a, "GET", sitePath("/oauth/authorize")+"?"+query.Encode(), nil, true)
	expectStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "<script>") {
		t.Fatal("unescaped client name")
	}
	values := url.Values{}
	for _, match := range oauthHiddenPattern.FindAllStringSubmatch(w.Body.String(), -1) {
		values.Set(html.UnescapeString(match[1]), html.UnescapeString(match[2]))
	}
	if values.Get("csrf") == "" {
		t.Fatal("missing consent CSRF")
	}
	for _, permission := range requestedOAuthPermissions(normalizedOAuthScopes(strings.Fields(query.Get("scope")))) {
		values.Add("permission", permission.Scope)
	}
	values.Set("decision", "allow")
	return values
}
func oauthCodeTest(t *testing.T, a *App, client, role, resource string) string {
	t.Helper()
	form := oauthConsentForm(t, a, oauthQuery(client, role, resource))
	w := oauthHTTPRequest(a, "POST", sitePath("/oauth/consent"), form, true)
	expectStatus(t, w, 303)
	target, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if target.Query().Get("state") != "state+with&symbols" {
		t.Fatal("lost state", target)
	}
	code := target.Query().Get("code")
	if code == "" {
		t.Fatal("missing code")
	}
	return code
}
func oauthExchangeForm(client, code string) url.Values {
	return url.Values{"grant_type": {"authorization_code"}, "client_id": {client}, "code": {code}, "redirect_uri": {"https://client.test/callback"}, "code_verifier": {oauthTestVerifier}}
}
func oauthTokenTest(t *testing.T, a *App, role, resource string) (Row, Row) {
	t.Helper()
	client := oauthRegisterTest(t, a, role)
	code := oauthCodeTest(t, a, client.str("client_id"), role, resource)
	tokens := responseRow(t, oauthHTTPRequest(a, "POST", sitePath("/oauth/token"), oauthExchangeForm(client.str("client_id"), code), false), 200)
	return client, tokens
}
func TestOAuthRESTFlowAndRotation(t *testing.T) { testOAuthRESTFlow(t, oauthFixture(t)) }
func testOAuthRESTFlow(t *testing.T, a *App) {
	t.Helper()
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	access := tokens.str("access_token")
	expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), 200)
	saved := responseRow(t, tokenRequest(a, access, "POST", "/api/posts", Row{"title": "OAuth draft", "slug": "oauth-draft", "content": "Private"}), 201)
	if object(saved["author"]).str("name") != "Test app <script>" {
		t.Fatal(saved["author"])
	}
	expectStatus(t, tokenRequest(a, access, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "content": "Live", "status": "published"}), 403)
	expectStatus(t, tokenRequest(a, access, "GET", "/api/settings", nil), 403)
	refresh := url.Values{"grant_type": {"refresh_token"}, "client_id": {client.str("client_id")}, "refresh_token": {tokens.str("refresh_token")}}
	next := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", refresh, false), 200)
	expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), 401)
	expectStatus(t, tokenRequest(a, next.str("access_token"), "GET", "/api/posts", nil), 200)
	replay := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", refresh, false), 400)
	if replay.str("error") != "invalid_grant" {
		t.Fatal(replay)
	}
	expectStatus(t, tokenRequest(a, next.str("access_token"), "GET", "/api/posts", nil), 401)
}
func TestOAuthMCPResourceAndRevocation(t *testing.T) {
	a := oauthFixture(t)
	client, tokens := oauthTokenTest(t, a, "reader", "https://blog.test/mcp")
	access := tokens.str("access_token")
	expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), 401)
	r := httptest.NewRequest("POST", "https://blog.test/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`))
	r.Header.Set("Authorization", "Bearer "+access)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Accept", "application/json, text/event-stream")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 200)
	// In-process MCP calls retain the original resource while rechecking the grant.
	original := httptest.NewRequest("POST", "https://blog.test/mcp", nil)
	original.Header.Set("Authorization", "Bearer "+access)
	ctx := context.WithValue(context.Background(), mcpRequestKey{}, original)
	for _, op := range mcpOperations() {
		if op.tool.Name == "list_posts" {
			result := a.callMCPAPI(ctx, op, map[string]any{})
			if result.IsError {
				t.Fatal(result)
			}
		}
	}
	revoke := url.Values{"client_id": {client.str("client_id")}, "token": {tokens.str("refresh_token")}}
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/revoke", revoke, false), 200)
	w = httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 401)
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/revoke", revoke, false), 200)
}
func TestOAuthConsentSecurity(t *testing.T) {
	a := oauthFixture(t)
	client := oauthRegisterTest(t, a, "reader")
	query := oauthQuery(client.str("client_id"), "reader", "https://blog.test/api")
	w := oauthHTTPRequest(a, "GET", "/oauth/authorize?"+query.Encode(), nil, false)
	expectStatus(t, w, 303)
	if !strings.HasPrefix(w.Header().Get("Location"), "/admin?oauthAuthorize=") {
		t.Fatal(w.Header())
	}
	form := oauthConsentForm(t, a, query)
	originalCSRF := form.Get("csrf")
	form.Set("csrf", "wrong")
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/consent", form, true), 403)
	form.Set("csrf", originalCSRF)
	form.Set("scope", "owner")
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/consent", form, true), 403)
	form.Set("scope", "reader")
	form.Set("decision", "deny")
	w = oauthHTTPRequest(a, "POST", "/oauth/consent", form, true)
	expectStatus(t, w, 303)
	target, _ := url.Parse(w.Header().Get("Location"))
	if target.Query().Get("error") != "access_denied" || target.Query().Get("code") != "" {
		t.Fatal(target)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM oauth_codes")) != 0 {
		t.Fatal("denial issued a code")
	}
	query.Set("redirect_uri", "https://evil.test/callback")
	expectStatus(t, oauthHTTPRequest(a, "GET", "/oauth/authorize?"+query.Encode(), nil, true), 400)
	query.Set("redirect_uri", "https://client.test/callback")
	query.Set("scope", "owner")
	expectStatus(t, oauthHTTPRequest(a, "GET", "/oauth/authorize?"+query.Encode(), nil, true), 400)
}
func TestOAuthPKCEAndSingleUse(t *testing.T) {
	a := oauthFixture(t)
	client := oauthRegisterTest(t, a, "reader")
	code := oauthCodeTest(t, a, client.str("client_id"), "reader", "https://blog.test/api")
	form := oauthExchangeForm(client.str("client_id"), code)
	form.Set("code_verifier", strings.Repeat("x", 43))
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", form, false), 400)
	form.Set("code_verifier", oauthTestVerifier)
	form.Set("resource", "https://blog.test/mcp")
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", form, false), 400)
	form.Del("resource")
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); statuses <- oauthHTTPRequest(a, "POST", "/oauth/token", form, false).Code }()
	}
	wg.Wait()
	close(statuses)
	successes := 0
	for status := range statuses {
		if status == 200 {
			successes++
		} else if status != 400 {
			t.Fatal(status)
		}
	}
	if successes != 1 {
		t.Fatal("code was not consumed exactly once", successes)
	}
}
func TestOAuthMountedDiscovery(t *testing.T) {
	a := oauthFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	server := responseRow(t, oauthHTTPRequest(a, "GET", "/.well-known/oauth-authorization-server/blog", nil, false), 200)
	if server.str("issuer") != "https://blog.test/blog" || server.str("token_endpoint") != "https://blog.test/blog/oauth/token" {
		t.Fatal(server)
	}
	metadata := responseRow(t, oauthHTTPRequest(a, "GET", "/.well-known/oauth-protected-resource/blog/mcp", nil, false), 200)
	if metadata.str("resource") != "https://blog.test/blog/mcp" {
		t.Fatal(metadata)
	}
	w := oauthHTTPRequest(a, "GET", "/blog/mcp", nil, false)
	expectStatus(t, w, 401)
	if !strings.Contains(w.Header().Get("WWW-Authenticate"), "https://blog.test/.well-known/oauth-protected-resource/blog/mcp") {
		t.Fatal(w.Header())
	}
	_, tokens := oauthTokenTest(t, a, "reader", "https://blog.test/blog/api")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/blog/api/posts", nil), 200)
}
func TestOAuthOwnerCannotCreatePermanentCredentials(t *testing.T) {
	a := oauthFixture(t)
	_, tokens := oauthTokenTest(t, a, "owner", "https://blog.test/api")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/tokens", Row{"name": "escaped grant", "role": "owner"}), 403)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/oauth/connections", nil), 403)
	expectStatus(t, oauthHTTPRequest(a, "GET", "/api/oauth/connections", nil, true), 200)
}
func TestOAuthRegistrationValidation(t *testing.T) {
	a := oauthFixture(t)
	for _, redirect := range []string{"javascript:alert(1)", "http://remote.test/callback", "https://client.test/callback#fragment", "https://user@client.test/callback", "https://*.test/callback"} {
		expectStatus(t, request(t, a, "POST", "/oauth/register", Row{"client_name": "bad", "redirect_uris": []string{redirect}}, false), 400)
	}
	expectStatus(t, request(t, a, "POST", "/oauth/register", Row{"client_name": "unknown scope", "redirect_uris": []string{"https://client.test/callback"}, "scope": "admin"}, false), 400)
}

func TestPostgreSQLOAuthFlow(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a := oauthFixture(t)
	a.DB = db
	db.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,'owner@example.test','unused')")
	db.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
	testOAuthRESTFlow(t, a)
}
func TestOAuthDisconnectAndOwnerDeletion(t *testing.T) {
	a := oauthFixture(t)
	_, tokens := oauthTokenTest(t, a, "reader", "https://blog.test/api")
	apps, err := a.oauthService().ListConnectedApps(context.Background(), a.oauthActor(oauthBrowserRequest()))
	if err != nil || len(apps) != 1 {
		t.Fatal(apps, err)
	}
	expectStatus(t, oauthHTTPRequest(a, "DELETE", "/api/oauth/connections/"+apps[0].ClientID.String(), nil, true), 200)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
	_, tokens = oauthTokenTest(t, a, "reader", "https://blog.test/api")
	a.DB.Must(context.Background(), "DELETE FROM admins")
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,'replacement@example.test','unused')")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
	if len(a.DB.Must(context.Background(), "SELECT * FROM oauth_tokens")) != 0 {
		t.Fatal("owner deletion must cascade grants")
	}
}
func oauthBrowserRequest() *http.Request {
	r := httptest.NewRequest("GET", "https://blog.test/api/oauth/connections", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookieName("margin_session"), Value: "browser"})
	return r
}
func TestOAuthConfidentialClientAndExpiredCode(t *testing.T) {
	a := oauthFixture(t)
	client := responseRow(t, request(t, a, "POST", "/oauth/register", Row{"client_name": "confidential", "redirect_uris": []string{"https://client.test/callback"}, "token_endpoint_auth_method": "client_secret_post"}, false), 201)
	code := oauthCodeTest(t, a, client.str("client_id"), "reader", "https://blog.test/api")
	form := oauthExchangeForm(client.str("client_id"), code)
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", form, false), 401)
	form.Set("client_secret", client.str("client_secret"))
	tokens := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", form, false), 200)
	if tokens.str("access_token") == "" {
		t.Fatal(tokens)
	}
	code = oauthCodeTest(t, a, client.str("client_id"), "reader", "https://blog.test/api")
	a.DB.Must(context.Background(), "UPDATE oauth_codes SET expires_at=0")
	form.Set("code", code)
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", form, false), 400)
}
