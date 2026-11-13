package blog

import (
	"net/http"
)

// Cloud credentials are checked by their issuing Central service, never copied
// into the publication database. Self-hosted password authentication is unchanged.
func (a *App) cloudPasswordLogin(w http.ResponseWriter, r *http.Request, email, password string) bool {
	binding := a.cloudOwner(r.Context())
	if binding.str("subject") == "" || !a.hostedOwnerEmail(r, email) {
		return false
	}
	result, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-login", Row{"email": email, "password": password})
	if status != 200 || !result.yes("authenticated") {
		fail(401, "Email or password is incorrect.")
	}
	if result.str("subject") != binding.str("subject") {
		fail(401, "Email or password is incorrect.")
	}
	a.startSession(w, r)
	send(w, 200, Row{"authenticated": true})
	return true
}

// Hosting creates the primary owner record; shared sign-in is only for that owner.
func (a *App) hostedOwnerEmail(r *http.Request, email string) bool {
	owner := first(a.DB.Must(r.Context(), "SELECT email FROM admins WHERE id=1"))
	return owner.str("email") == email
}
