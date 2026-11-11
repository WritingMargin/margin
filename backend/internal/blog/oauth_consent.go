package blog

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Usefused/fused-open-core/oauthserver"
)

type oauthConsentScreenKey struct{}

func oauthAuthorizeInput(values url.Values) (oauthserver.AuthorizeRequest, error) {
	for _, items := range values {
		if len(items) != 1 {
			return oauthserver.AuthorizeRequest{}, oauthserver.ErrInvalidRequest
		}
	}
	if len(values.Encode()) > 8192 {
		return oauthserver.AuthorizeRequest{}, oauthserver.ErrInvalidRequest
	}
	scopes, err := oauthScope(values.Get("scope"))
	if err != nil {
		return oauthserver.AuthorizeRequest{}, err
	}
	if !oauthChallengePattern.MatchString(values.Get("code_challenge")) {
		return oauthserver.AuthorizeRequest{}, oauthserver.ErrInvalidRequest
	}
	return oauthserver.AuthorizeRequest{ClientID: values.Get("client_id"), RedirectURI: values.Get("redirect_uri"), ResponseType: values.Get("response_type"), Scope: scopes, State: values.Get("state"), CodeChallenge: values.Get("code_challenge"), CodeChallengeMethod: values.Get("code_challenge_method")}, nil
}
func (a *App) oauthAuthorize(w http.ResponseWriter, r *http.Request) {
	oauthHeaders(w)
	requireOAuthIssuer()
	a.limit(r, "oauth-authorize", 60, time.Minute, false)
	input, err := oauthAuthorizeInput(r.URL.Query())
	if err != nil {
		oauthError(w, err)
		return
	}
	ctx, err := oauthResource(r, r.URL.Query(), true)
	if err != nil {
		oauthError(w, err)
		return
	}
	actor := a.oauthActor(r)
	if !actor.IsBrowserSession {
		http.Redirect(w, r, sitePath("/admin")+"?oauthAuthorize="+url.QueryEscape(r.URL.RawQuery), http.StatusSeeOther)
		return
	}
	// Always show what is being delegated, even for a previously connected app.
	ctx = context.WithValue(ctx, oauthConsentScreenKey{}, true)
	result, err := a.oauthService().Authorize(ctx, actor, input)
	if err != nil {
		oauthError(w, err)
		return
	}
	expires := strconv.FormatInt(time.Now().Add(10*time.Minute).Unix(), 10)
	values := r.URL.Query()
	cookie, _ := r.Cookie(sessionCookieName("margin_session"))
	csrf := oauthConsentMAC(cookie.Value, values.Encode(), expires)
	fields := Row{}
	for name, items := range values {
		fields[name] = items[0]
	}
	fields["csrf"], fields["expires"] = csrf, expires
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Frame-Options", "DENY")
	// A no-referrer document policy makes browsers send Origin: null on native
	// POST forms. Preserve the same-origin Origin for consent CSRF checks,
	// without disclosing the authorization URL to the external redirect URI.
	w.Header().Set("Referrer-Policy", "same-origin")
	redirect, _ := url.Parse(input.RedirectURI)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' "+redirect.Scheme+"://"+redirect.Host+"; frame-ancestors 'none'; base-uri 'none'")
	must(oauthConsentTemplate.Execute(w, Row{"Name": result.Client.Name, "Permissions": requestedOAuthPermissions(result.Scope), "Redirect": input.RedirectURI, "Resource": values.Get("resource"), "Fields": fields, "Action": sitePath("/oauth/consent")}))
}
func oauthConsentMAC(session, query, expires string) string {
	mac := hmac.New(sha256.New, []byte(session))
	_, _ = mac.Write([]byte(query + "\n" + expires))
	return hex.EncodeToString(mac.Sum(nil))
}
func validOAuthConsent(r *http.Request, values url.Values) bool {
	csrf, expiry := values.Get("csrf"), values.Get("expires")
	values.Del("csrf")
	values.Del("expires")
	values.Del("decision")
	expires, err := strconv.ParseInt(expiry, 10, 64)
	if err != nil || expires <= time.Now().Unix() || expires > time.Now().Add(10*time.Minute).Unix() {
		return false
	}
	cookie, err := r.Cookie(sessionCookieName("margin_session"))
	if err != nil {
		return false
	}
	expected := oauthConsentMAC(cookie.Value, values.Encode(), expiry)
	return hmac.Equal([]byte(csrf), []byte(expected))
}
func (a *App) oauthConsent(w http.ResponseWriter, r *http.Request) {
	oauthHeaders(w)
	requireOAuthIssuer()
	a.checkOrigin(r)
	actor := a.requireOAuthOwner(r)
	a.limit(r, "oauth-consent", 30, time.Minute, false)
	values, err := oauthForm(w, r)
	if err != nil {
		oauthError(w, err)
		return
	}
	decision := values.Get("decision")
	selected := append([]string(nil), values["permission"]...)
	values.Del("permission")
	if !validOAuthConsent(r, values) {
		fail(403, "This consent form expired or is invalid. Restart the connection.")
	}
	input, err := oauthAuthorizeInput(values)
	if err != nil {
		oauthError(w, err)
		return
	}
	ctx, err := oauthResource(r, values, true)
	if err != nil {
		oauthError(w, err)
		return
	}
	if decision == "deny" {
		a.oauthDeny(w, r, ctx, actor, input)
		return
	}
	if decision != "allow" {
		oauthError(w, oauthserver.ErrInvalidRequest)
		return
	}
	selected, err = selectedOAuthPermissions(selected, input.Scope)
	if err != nil {
		fail(400, "Select at least one requested permission, or cancel this connection.")
	}
	input.Scope = selected
	target, err := a.oauthService().Consent(ctx, actor, oauthserver.ConsentRequest{ClientID: input.ClientID, RedirectURI: input.RedirectURI, Scope: input.Scope, State: input.State, CodeChallenge: input.CodeChallenge, CodeChallengeMethod: input.CodeChallengeMethod})
	if err != nil {
		oauthError(w, err)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}
func (a *App) oauthDeny(w http.ResponseWriter, r *http.Request, ctx context.Context, actor oauthserver.Actor[int], input oauthserver.AuthorizeRequest) {
	_, err := a.oauthService().Authorize(context.WithValue(ctx, oauthConsentScreenKey{}, true), actor, input)
	if err != nil {
		oauthError(w, err)
		return
	}
	target, _ := url.Parse(input.RedirectURI)
	query := target.Query()
	query.Set("error", "access_denied")
	if input.State != "" {
		query.Set("state", input.State)
	}
	target.RawQuery = query.Encode()
	http.Redirect(w, r, target.String(), http.StatusSeeOther)
}

//go:embed oauth_consent.html
var oauthConsentHTML string
var oauthConsentTemplate = template.Must(template.New("oauth-consent").Parse(oauthConsentHTML))

func requestedOAuthPermissions(scopes []string) []oauthPermission {
	result := []oauthPermission{}
	for _, permission := range oauthPermissions {
		if hasOAuthScope(scopes, permission.Scope) {
			result = append(result, permission)
		}
	}
	return result
}
func selectedOAuthPermissions(selected, requested []string) ([]string, error) {
	if len(selected) == 0 {
		return nil, oauthserver.ErrInvalidScope
	}
	for _, scope := range selected {
		if !validOAuthPermission(scope) || !hasOAuthScope(requested, scope) {
			return nil, oauthserver.ErrInvalidScope
		}
	}
	return oauthScope(strings.Join(selected, " "))
}
