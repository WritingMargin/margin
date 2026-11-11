package blog

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/Usefused/fused-open-core/oauthserver"
	guuid "github.com/google/uuid"
)

var oauthVerifierPattern = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
var oauthChallengePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

type oauthCatalog struct{}

func (oauthCatalog) ValidateScope(scope string) error {
	if !validOAuthPermission(scope) {
		return oauthserver.ErrInvalidScope
	}
	return nil
}

type oauthRevisions struct{}

func (oauthRevisions) SetRevision(int64) bool { return true } // Requests always read live grants.

func (a *App) oauthService() *oauthserver.Service[int] {
	service, err := oauthserver.NewService[int](oauthStore{a.DB}, oauthRevisions{}, oauthCatalog{}, oauthserver.Prefixes{ClientID: "moc_", ClientSecret: "mos_", AccessToken: "moat_", RefreshToken: "mort_"})
	must(err)
	return service
}
func (a *App) oauthRoutes() {
	a.mux.HandleFunc("GET /oauth/authorize", a.oauthAuthorize)
	a.mux.HandleFunc("POST /oauth/consent", a.oauthConsent)
	a.mux.HandleFunc("POST /oauth/register", a.oauthRegister)
	a.mux.HandleFunc("POST /oauth/token", a.oauthToken)
	a.mux.HandleFunc("POST /oauth/revoke", a.oauthRevoke)
	a.mux.HandleFunc("GET /api/oauth/connections", a.oauthConnections)
	a.mux.HandleFunc("DELETE /api/oauth/connections/{id}", a.oauthDisconnect)
	a.mux.HandleFunc("GET /api/oauth/clients", a.oauthClients)
	a.mux.HandleFunc("DELETE /api/oauth/clients/{id}", a.oauthDeleteClient)
}

// A configured public URL is the authority; Host and proxy headers must never
// select the issuer or the audience of a credential.
func oauthIssuer() string {
	u, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil || !validOAuthURL(u) {
		return ""
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return ""
	}
	return canonicalOrigin(u) + BasePath()
}
func validOAuthURL(u *url.URL) bool {
	if u == nil || u.Host == "" || u.User != nil || u.Opaque != "" {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	return u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "[::1]" || u.Hostname() == "::1" || u.Hostname() == "localhost")
}
func requireOAuthIssuer() string {
	issuer := oauthIssuer()
	if issuer == "" {
		fail(503, "OAuth requires PUBLIC_URL with HTTPS (or a loopback URL for development).")
	}
	return issuer
}
func oauthHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
}

// RFC 8414/9728 put the well-known prefix BEFORE the issuer/resource path.
// Handle those URLs before stripping a publication's mount path.
func (a *App) oauthDiscovery(w http.ResponseWriter, r *http.Request) bool {
	base := BasePath()
	path := r.URL.Path
	isServer := path == "/.well-known/oauth-authorization-server"+base || path == sitePath("/.well-known/oauth-authorization-server")
	resource := ""
	for _, suffix := range []string{"/mcp", "/api"} {
		if path == "/.well-known/oauth-protected-resource"+base+suffix {
			resource = suffix
		}
	}
	if !isServer && resource == "" {
		return false
	}
	oauthHeaders(w)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return true
	}
	if !readMethod(r.Method) {
		w.WriteHeader(405)
		return true
	}
	issuer := requireOAuthIssuer()
	if isServer {
		send(w, 200, Row{"issuer": issuer, "authorization_endpoint": issuer + "/oauth/authorize", "token_endpoint": issuer + "/oauth/token", "registration_endpoint": issuer + "/oauth/register", "revocation_endpoint": issuer + "/oauth/revoke", "response_types_supported": []string{"code"}, "grant_types_supported": []string{"authorization_code", "refresh_token"}, "code_challenge_methods_supported": []string{"S256"}, "token_endpoint_auth_methods_supported": []string{"none", "client_secret_post", "client_secret_basic"}, "scopes_supported": oauthSupportedScopes()})
	} else {
		send(w, 200, Row{"resource": issuer + resource, "authorization_servers": []string{issuer}, "bearer_methods_supported": []string{"header"}, "scopes_supported": oauthSupportedScopes(), "resource_name": "Margin"})
	}
	return true
}
func oauthChallenge(w http.ResponseWriter, resource string) {
	issuer := oauthIssuer()
	if issuer == "" {
		w.Header().Set("WWW-Authenticate", `Bearer realm="Margin MCP"`)
		return
	}
	origin := strings.TrimSuffix(issuer, BasePath())
	w.Header().Set("WWW-Authenticate", `Bearer resource_metadata="`+origin+"/.well-known/oauth-protected-resource"+BasePath()+resource+`"`)
}
func validOAuthVerifier(verifier, challenge string) bool {
	if !oauthVerifierPattern.MatchString(verifier) {
		return false
	}
	digest := sha256.Sum256([]byte(verifier))
	expected := base64.RawURLEncoding.EncodeToString(digest[:])
	return subtle.ConstantTimeCompare([]byte(expected), []byte(challenge)) == 1
}
func oauthError(w http.ResponseWriter, err error) {
	code, status := "server_error", 500
	switch {
	case errors.Is(err, oauthserver.ErrInvalidRequest):
		code, status = "invalid_request", 400
	case errors.Is(err, oauthserver.ErrUnauthorizedClient):
		code, status = "invalid_client", 401
	case errors.Is(err, oauthserver.ErrInvalidScope):
		code, status = "invalid_scope", 400
	case errors.Is(err, oauthserver.ErrInvalidGrant):
		code, status = "invalid_grant", 400
	case errors.Is(err, oauthserver.ErrUnsupportedGrantType):
		code, status = "unsupported_grant_type", 400
	case errors.Is(err, oauthserver.ErrAccessDenied):
		code, status = "access_denied", 403
	}
	send(w, status, Row{"error": code})
}
func oauthResource(r *http.Request, values url.Values, required bool) (context.Context, error) {
	resource := values.Get("resource")
	if len(values["resource"]) > 1 {
		return nil, oauthserver.ErrInvalidRequest
	}
	if resource == "" && !required {
		return r.Context(), nil
	}
	issuer := requireOAuthIssuer()
	if resource != issuer+"/mcp" && resource != issuer+"/api" {
		return nil, oauthserver.ErrInvalidRequest
	}
	return context.WithValue(r.Context(), oauthResourceKey{}, resource), nil
}
func oauthForm(w http.ResponseWriter, r *http.Request) (url.Values, error) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
		return nil, oauthserver.ErrInvalidRequest
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := r.ParseForm(); err != nil {
		return nil, oauthserver.ErrInvalidRequest
	}
	for name, values := range r.PostForm {
		if len(values) != 1 && !(r.URL.Path == "/oauth/consent" && name == "permission") {
			return nil, oauthserver.ErrInvalidRequest
		}
	}
	return r.PostForm, nil
}
func oauthClientCredentials(r *http.Request, form url.Values) (string, string, error) {
	id, secret := form.Get("client_id"), form.Get("client_secret")
	if r.Header.Get("Authorization") == "" {
		return id, secret, nil
	}
	basicID, basicSecret, ok := r.BasicAuth()
	if !ok || id != "" || secret != "" {
		return "", "", oauthserver.ErrInvalidRequest
	}
	id, err := url.QueryUnescape(basicID)
	if err != nil {
		return "", "", oauthserver.ErrInvalidRequest
	}
	secret, err = url.QueryUnescape(basicSecret)
	if err != nil {
		return "", "", oauthserver.ErrInvalidRequest
	}
	return id, secret, nil
}
func (a *App) oauthToken(w http.ResponseWriter, r *http.Request) {
	oauthHeaders(w)
	requireOAuthIssuer()
	a.limit(r, "oauth-token", 120, time.Minute, false)
	form, err := oauthForm(w, r)
	if err != nil {
		oauthError(w, err)
		return
	}
	ctx, err := oauthResource(r, form, false)
	if err != nil {
		oauthError(w, err)
		return
	}
	if form.Get("scope") != "" {
		oauthError(w, oauthserver.ErrInvalidScope)
		return
	}
	id, secret, err := oauthClientCredentials(r, form)
	if err != nil {
		oauthError(w, err)
		return
	}
	result, err := a.oauthService().Token(ctx, oauthserver.TokenRequest{GrantType: form.Get("grant_type"), Code: form.Get("code"), RedirectURI: form.Get("redirect_uri"), CodeVerifier: form.Get("code_verifier"), RefreshToken: form.Get("refresh_token"), ClientID: id, ClientSecret: secret})
	if err != nil {
		oauthError(w, err)
		return
	}
	send(w, 200, Row{"access_token": result.AccessToken, "refresh_token": result.RefreshToken, "token_type": result.TokenType, "expires_in": result.ExpiresIn, "scope": strings.Join(result.Scope, " ")})
}
func (a *App) oauthRevoke(w http.ResponseWriter, r *http.Request) {
	oauthHeaders(w)
	requireOAuthIssuer()
	a.limit(r, "oauth-token", 120, time.Minute, false)
	form, err := oauthForm(w, r)
	if err != nil {
		oauthError(w, err)
		return
	}
	id, secret, err := oauthClientCredentials(r, form)
	if err != nil {
		oauthError(w, err)
		return
	}
	err = a.oauthService().Revoke(r.Context(), oauthserver.RevokeRequest{ClientID: id, ClientSecret: secret, Token: form.Get("token")})
	if err != nil {
		oauthError(w, err)
		return
	}
	w.WriteHeader(200)
}
func (a *App) oauthActor(r *http.Request) oauthserver.Actor[int] {
	if r.Header.Get("Authorization") != "" || !a.authenticated(r) {
		return oauthserver.Actor[int]{}
	}
	if first(a.DB.Must(r.Context(), "SELECT id FROM admins WHERE id=1")) == nil {
		return oauthserver.Actor[int]{}
	}
	return oauthserver.Actor[int]{SubjectID: 1, IsBrowserSession: true, CanGrant: func(_ context.Context, scope string) (bool, error) { return validOAuthPermission(scope), nil }}
}
func (a *App) requireOAuthOwner(r *http.Request) oauthserver.Actor[int] {
	actor := a.oauthActor(r)
	if !actor.IsBrowserSession {
		fail(401, "Sign in as the owner to manage OAuth connections.")
	}
	return actor
}
func (a *App) oauthConnections(w http.ResponseWriter, r *http.Request) {
	actor := a.requireOAuthOwner(r)
	apps, err := a.oauthService().ListConnectedApps(r.Context(), actor)
	must(err)
	result := []Row{}
	for _, app := range apps {
		result = append(result, Row{"id": app.ClientID.String(), "name": app.ClientName, "role": strings.Join(app.GrantedScope, " "), "permissions": oauthPermissionNames(normalizedOAuthScopes(app.GrantedScope)), "grantedAt": app.GrantedAt})
	}
	send(w, 200, result)
}
func (a *App) oauthDisconnect(w http.ResponseWriter, r *http.Request) {
	actor := a.requireOAuthOwner(r)
	id, err := guuid.Parse(r.PathValue("id"))
	if err != nil {
		fail(400, "Invalid client ID.")
	}
	must(a.oauthService().RevokeConnectedApp(r.Context(), actor, id))
	send(w, 200, Row{"ok": true})
}
func (a *App) oauthClients(w http.ResponseWriter, r *http.Request) {
	a.requireOAuthOwner(r)
	clients, err := a.oauthService().ListClients(r.Context())
	must(err)
	result := []Row{}
	for _, client := range clients {
		result = append(result, Row{"id": client.ID.String(), "name": client.Name, "clientId": client.ClientID, "redirectUris": client.RedirectURIs})
	}
	send(w, 200, result)
}
func (a *App) oauthDeleteClient(w http.ResponseWriter, r *http.Request) {
	actor := a.requireOAuthOwner(r)
	id, err := guuid.Parse(r.PathValue("id"))
	if err != nil {
		fail(400, "Invalid client ID.")
	}
	must(a.oauthService().RevokeClient(r.Context(), actor, id))
	send(w, 200, Row{"ok": true})
}
func (a *App) oauthPrincipal(r *http.Request, value string) Row {
	rows := a.DB.Must(r.Context(), "SELECT t.data,c.data AS client FROM oauth_tokens t JOIN oauth_clients c ON c.id=t.client_id JOIN oauth_consents g ON g.client_id=t.client_id JOIN admins a ON a.id=g.subject_id WHERE t.access_hash=$1 AND t.revoked=0 AND t.rotated=0", hash(value))
	row := first(rows)
	if row == nil {
		return nil
	}
	var grant oauthGrant
	var client oauthserver.OAuthClient
	must(oauthDecode(row.str("data"), &grant))
	must(oauthDecode(row.str("client"), &client))
	if !time.Now().Before(grant.AccessExpiresAt) || len(grant.Scope) == 0 {
		return nil
	}
	suffix := "/api"
	if r.URL.Path == "/mcp" || r.Context().Value(mcpRequestKey{}) != nil {
		suffix = "/mcp"
	}
	if oauthIssuer() == "" || grant.Resource != oauthIssuer()+suffix {
		return nil
	}
	scopes := normalizedOAuthScopes(grant.Scope)
	if len(scopes) == 0 {
		return nil
	}
	return Row{"role": oauthScopeRole(scopes), "scopes": scopes, "name": client.Name}
}
