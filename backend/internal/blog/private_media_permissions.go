package blog

import "net/http"

// Asset endpoints also serve anonymous readers, so they bypass the protected API
// route allowlist. Authentication alone must not grant access to private bytes:
// an OAuth connection still needs the capability approved by the owner.
func (a *App) privateMediaAllowed(r *http.Request, permission string) bool {
	if permission == "content:read" && a.previewMediaAllowed(r) {
		return true
	}
	if !a.authenticated(r) {
		return false
	}
	if scopes, oauth := a.requestOAuthScopes(r); oauth {
		return hasOAuthScope(scopes, permission)
	}
	return true
}
