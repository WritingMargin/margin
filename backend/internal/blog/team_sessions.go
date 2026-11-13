package blog

import (
	"context"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type browserPrincipalKey struct{}
type browserPrincipalCache struct {
	loaded    bool
	principal Row
	oauth     map[string]Row
	oauthMu   sync.Mutex
}

// A request observes one authoritative membership snapshot. Never cache across
// requests: removing a member or changing a role takes effect on the next call.
func (a *App) browserPrincipal(r *http.Request) Row {
	if r.Header.Get("Authorization") != "" {
		return nil
	}
	cache, _ := r.Context().Value(browserPrincipalKey{}).(*browserPrincipalCache)
	if cache != nil && cache.loaded {
		return cache.principal
	}
	principal := a.loadBrowserPrincipal(r)
	if cache != nil {
		cache.loaded, cache.principal = true, principal
	}
	return principal
}
func (a *App) loadBrowserPrincipal(r *http.Request) Row {
	cookie, err := r.Cookie(sessionCookieName("margin_session"))
	if err != nil {
		return nil
	}
	row := first(a.DB.Must(r.Context(), `SELECT s.token_hash,p.subject,p.auth_version FROM sessions s
 LEFT JOIN session_principals p ON p.token_hash=s.token_hash WHERE s.token_hash=$1 AND s.expires_at>NOW()`, hash(cookie.Value)))
	if row == nil {
		return nil
	}
	if row.str("subject") == "" {
		return a.legacyOwnerPrincipal(r.Context())
	}
	result, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-member", Row{"memberSubject": row["subject"]})
	if status == 401 || status == 403 || status == 404 {
		a.DB.Must(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", row["token_hash"])
		return nil
	}
	requireCentralSuccess(result, status)
	if a.expireChangedMemberSession(r.Context(), row, result) {
		return nil
	}
	if result.str("subject") != row.str("subject") || !validMemberRole(result.str("role")) {
		fail(503, "Your publication membership could not be verified.")
	}
	return result
}
func (a *App) legacyOwnerPrincipal(ctx context.Context) Row {
	owner := first(a.DB.Must(ctx, "SELECT email FROM admins WHERE id=1"))
	// Old installations and test fixtures may already have a session without an
	// owner row; preserve authentication but never use it to grant OAuth consent.
	return Row{"subject": a.cloudOwner(ctx).str("subject"), "email": owner.str("email"), "name": owner.str("email"), "role": "owner", "articleIds": []string{}}
}
func validMemberRole(role string) bool {
	return role == "owner" || role == "writer" || role == "publisher" || role == "peer_reviewer"
}
func (a *App) primaryOwnerSession(r *http.Request) bool {
	principal := a.browserPrincipal(r)
	return principal != nil && principal.str("role") == "owner" && principal.str("subject") == a.cloudOwner(r.Context()).str("subject")
}
func (a *App) centralIdentityRequest(ctx context.Context, path string, input Row) (Row, int) {
	binding := a.cloudOwner(ctx)
	if binding.str("subject") == "" {
		coded(503, "Connect this publication to Margin Central to manage its team.", "CENTRAL_REQUIRED")
	}
	secret := os.Getenv("SETUP_TOKEN")
	if len(secret) < 32 {
		fail(503, "Your Margin account connection is unavailable.")
	}
	input["subject"] = binding["subject"]
	result, status, err := a.fetchJSON(ctx, "POST", cloudCentralOrigin(binding.str("centralOrigin"))+path, input, map[string]string{"Authorization": "Bearer " + secret, "Content-Type": "application/json"}, 20*time.Second)
	if err != nil || status >= 500 || status < 200 || (status >= 300 && status < 400) {
		fail(503, "Your Margin account could not be reached. Please try again shortly.")
	}
	return result, status
}
func requireCentralSuccess(result Row, status int) {
	if status >= 400 {
		message := result.str("error")
		if message == "" {
			message = "Your Margin account could not complete this request."
		}
		coded(status, message, result.str("code"))
	}
}
func (a *App) startMemberSession(w http.ResponseWriter, r *http.Request, principal Row) {
	if !validMemberRole(principal.str("role")) || principal.str("subject") == "" || principal.str("authVersion") == "" {
		fail(401, "Your publication membership could not be verified.")
	}
	value := token()
	expires := time.Now().Add(7 * 24 * time.Hour)
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.cloudTxExec(r.Context(), tx, "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash(value), expires.UTC().Format("2006-01-02T15:04:05.000Z"))
	a.cloudTxExec(r.Context(), tx, "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash(value), principal["subject"], principal["authVersion"])
	must(tx.Commit())
	setSessionCookie(w, "margin_session", value, 7*24*60*60, expires)
}
func (a *App) addSessionIdentity(r *http.Request, result, binding Row) {
	if binding.str("subject") != "" {
		result["centralOrigin"] = cloudCentralOrigin(binding.str("centralOrigin"))
	}
	principal := a.browserPrincipal(r)
	if principal == nil {
		return
	}
	result["role"], result["articleIds"] = principal["role"], principal["articleIds"]
	if principal.str("subject") != "" {
		result["user"] = Row{"id": principal["subject"], "email": principal["email"], "name": principal["name"]}
	}
	result["primaryOwner"] = a.primaryOwnerSession(r)
	result["capabilities"] = memberCapabilities(principal.str("role"), a.primaryOwnerSession(r))
}
func memberCapabilities(role string, primary bool) []string {
	capabilities := []string{}
	if role == "peer_reviewer" {
		return []string{"review:assigned"}
	}
	if role == "writer" || role == "publisher" || role == "owner" {
		capabilities = append(capabilities, "content:read", "content:draft")
	}
	if role == "publisher" || role == "owner" {
		capabilities = append(capabilities, "content:publish")
	}
	if role == "owner" {
		capabilities = append(capabilities, "team:manage", "settings:manage")
	}
	if primary {
		capabilities = append(capabilities, "credentials:manage")
	}
	return capabilities
}
func (a *App) authorizeBrowserMember(r *http.Request, pattern string) bool {
	if r.Header.Get("Authorization") != "" {
		return false
	}
	principal := a.browserPrincipal(r)
	if principal == nil {
		return false
	}
	if primaryOwnerRoute(r.URL.Path, pattern) && !a.primaryOwnerSession(r) {
		coded(403, "Only the publication's primary owner can manage account credentials or billing.", "PERMISSION_DENIED")
	}
	if pattern == "GET /api/oauth/connections" || pattern == "DELETE /api/oauth/connections/{id}" {
		return true
	}
	if principal.str("role") != "writer" && principal.str("role") != "publisher" {
		return false
	}
	switch pattern {
	case "GET /api/settings", "GET /api/settings/media", "GET /api/settings/profile":
		return true
	}
	return false
}

func primaryOwnerRoute(path, pattern string) bool {
	if pattern == "GET /api/oauth/connections" || pattern == "DELETE /api/oauth/connections/{id}" {
		return false
	}
	if strings.HasPrefix(path, "/api/tokens") || strings.HasPrefix(path, "/api/oauth") {
		return true
	}
	switch pattern {
	case "POST /api/account", "POST /api/account/connection", "GET /api/account/email-verification", "POST /api/account/email-verification",
		"POST /api/ai/checkout", "POST /api/ai/topups", "POST /api/ai/billing/portal", "POST /api/ai/billing/stop", "POST /api/ai/billing/auto-topup":
		return true
	}
	return false
}

// Credential changes revoke every engine session at its next authorization
// check, without copying passwords or password hashes out of Central.
func (a *App) expireChangedMemberSession(ctx context.Context, session, principal Row) bool {
	if principal.str("authVersion") != "" && principal.str("authVersion") == session.str("auth_version") {
		return false
	}
	a.DB.Must(ctx, "DELETE FROM sessions WHERE token_hash=$1", session["token_hash"])
	return true
}
