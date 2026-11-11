package blog

import (
	"net/http"
	"os"
	"time"
)

// Cloud credentials are checked by their issuing Central service, never copied
// into the publication database. Self-hosted password authentication is unchanged.
func (a *App) cloudPasswordLogin(w http.ResponseWriter, r *http.Request, email, password string) bool {
	binding := a.cloudOwner(r.Context())
	if binding.str("subject") == "" {
		return false
	}
	secret := os.Getenv("SETUP_TOKEN")
	if len(secret) < 32 {
		fail(503, "Account sign-in is unavailable. Please contact support.")
	}
	// Validate persisted configuration before sending the password; never follow redirects.
	origin := cloudCentralOrigin(binding.str("centralOrigin"))
	result, status, err := a.fetchJSON(r.Context(), "POST", origin+"/cloud/api/engine-login", Row{"subject": binding["subject"], "email": email, "password": password}, map[string]string{"Authorization": "Bearer " + secret, "Content-Type": "application/json"}, 20*time.Second)
	if err != nil || status >= 500 {
		fail(503, "Your Margin account could not be reached. Please try again shortly.")
	}
	if status != 200 || !result.yes("authenticated") || result.str("subject") != binding.str("subject") {
		fail(401, "Email or password is incorrect.")
	}
	a.startSession(w, r)
	send(w, 200, Row{"authenticated": true})
	return true
}
