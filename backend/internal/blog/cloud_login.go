package blog

import (
	"net/http"
)

// Cloud credentials are checked by their issuing Central service, never copied
// into the publication database. Self-hosted password authentication is unchanged.
func (a *App) cloudPasswordLogin(w http.ResponseWriter, r *http.Request, email, password string) bool {
	binding := a.cloudOwner(r.Context())
	if binding.str("subject") == "" {
		return false
	}
	result, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-login", Row{"email": email, "password": password})
	if status != 200 || !result.yes("authenticated") {
		fail(401, "Email or password is incorrect.")
	}
	// Older Central releases return only the primary owner subject. Preserve
	// that contract during a rolling upgrade, never for another subject.
	if result.str("role") == "" {
		if result.str("subject") != binding.str("subject") {
			fail(401, "Email or password is incorrect.")
		}
		a.startSession(w, r)
	} else {
		a.startMemberSession(w, r, result)
	}
	send(w, 200, Row{"authenticated": true})
	return true
}
