package blog

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"time"
)

func commentChallenge(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
func commentFlowCookie(w http.ResponseWriter, name, value string, seconds int) {
	if err := ValidateCookieDomain(); err != nil {
		fail(503, err.Error())
	}
	// Follow the session cookie's trusted domain scope, but allow the top-level
	// navigation back from Central after Google consent.
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName(name), Value: value, Domain: cookieDomain(), Path: sitePath("/"), HttpOnly: true, Secure: env("MARGIN_ENV", "production") == "production", SameSite: http.SameSiteLaxMode, MaxAge: seconds}) // #nosec G124 -- Secure is enabled in production; development/test support HTTP. HttpOnly and Lax SameSite protect the OAuth callback cookie.
}
func (a *App) startCommentSocialLogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comment-social-start", 20, time.Hour, false)
	input := body(w, r)
	strict(input, "provider", "returnTo")
	provider := enumField(input, "provider", "google", "microsoft", "apple")
	target := commentReturnPath(input)
	state, verifier := newsletterToken(), newsletterToken()
	result := a.serviceRequest(r.Context(), "/v1/reader-auth/start", Row{"provider": provider, "state": state, "challenge": commentChallenge(verifier), "publicUrl": a.newsletterOrigin(r.Context())}, "")
	// Only the configured provider's HTTPS authorization endpoint may be opened.
	address, err := url.Parse(result.str("url"))
	hosts := map[string]string{"google": "accounts.google.com", "microsoft": "login.microsoftonline.com", "apple": "appleid.apple.com"}
	if err != nil || address.Scheme != "https" || address.Host != hosts[provider] || address.User != nil {
		fail(502, "Invalid sign-in provider address.")
	}
	a.DB.Must(r.Context(), "DELETE FROM comment_auth_flows WHERE expires_at<NOW()")
	a.DB.Must(r.Context(), "INSERT INTO comment_auth_flows(state_hash,verifier,return_path,expires_at) VALUES($1,$2,$3,$4)", hash(state), verifier, target, commentAuthExpiry(10*time.Minute))
	commentFlowCookie(w, "margin_comment_flow", state, 600)
	send(w, 200, Row{"url": address.String()})
}
func (a *App) commentSocialCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie(sessionCookieName("margin_comment_flow"))
	if err != nil || !newsletterTokenRE.MatchString(state) || cookie.Value != state {
		fail(400, "Open sign-in in the same browser where you started it.")
	}
	flow := first(a.DB.Must(r.Context(), "DELETE FROM comment_auth_flows WHERE state_hash=$1 AND expires_at>NOW() RETURNING *", hash(state)))
	if flow == nil {
		fail(400, "This sign-in attempt expired. Return to the article and try again.")
	}
	target := commentReturnPath(Row{"returnTo": flow.str("return_path")})
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, target, http.StatusSeeOther) // #nosec G710 -- commentReturnPath enforces a same-site absolute path without authority, backslashes or newlines.
		return
	}
	result := a.serviceRequest(r.Context(), "/v1/reader-auth/exchange", Row{"code": r.URL.Query().Get("code"), "verifier": flow["verifier"]}, "")
	identity := stringField(result, "identity", 64, 64, false)
	provider := enumField(result, "provider", "google", "microsoft", "apple")
	name := stringField(result, "name", 0, 100, true)
	email := stringField(result, "email", 0, 254, true)
	reader := a.commentIdentity(r.Context(), provider+":"+identity, provider, email, name)
	a.startCommentSession(w, r, reader)
	http.Redirect(w, r, target, http.StatusSeeOther) // #nosec G710 -- commentReturnPath enforces a same-site absolute path without authority, backslashes or newlines.
}
