package blog

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
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
	w.Header().Add("Vary", "Accept")
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
		loginURL := sitePath("/admin") + "?oauthAuthorize=" + url.QueryEscape(r.URL.RawQuery)
		if oauthConsentJSON(r) {
			send(w, http.StatusUnauthorized, Row{"error": "Sign in to review this connection.", "loginUrl": loginURL})
		} else {
			http.Redirect(w, r, loginURL, http.StatusSeeOther)
		}
		return
	}
	// Show only permissions this member can delegate, while retaining the original
	// request in the signed form. Consent revalidates each selected permission.
	allowed := []string{}
	for _, scope := range input.Scope {
		if ok, _ := actor.CanGrant(ctx, scope); ok {
			allowed = append(allowed, scope)
		}
	}
	if len(allowed) == 0 {
		oauthError(w, oauthserver.ErrAccessDenied)
		return
	}
	input.Scope = allowed
	// Always show what is being delegated, even for a previously connected app.
	ctx = context.WithValue(ctx, oauthConsentScreenKey{}, true)
	result, err := a.oauthService().Authorize(ctx, actor, input)
	if err != nil {
		oauthError(w, err)
		return
	}
	a.renderOAuthConsent(w, r, result.Client.Name, result.Scope, input.RedirectURI)
}
func oauthConsentJSON(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "application/json")
}
func (a *App) renderOAuthConsent(w http.ResponseWriter, r *http.Request, name string, scopes []string, redirectURI string) {
	w.Header().Set("X-Frame-Options", "DENY")
	// Preserve a same-origin Origin on native POST, without forwarding the
	// authorization URL to an external callback. Only bundled scripts execute.
	w.Header().Set("Referrer-Policy", "same-origin")
	redirect, _ := url.Parse(redirectURI)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; manifest-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self' "+redirect.Scheme+"://"+redirect.Host+"; frame-ancestors 'none'; base-uri 'none'")
	if !oauthConsentJSON(r) {
		a.workspaceHTML(w, r)
		return
	}
	expires := strconv.FormatInt(time.Now().Add(10*time.Minute).Unix(), 10)
	values := r.URL.Query()
	cookie, _ := r.Cookie(sessionCookieName("margin_session"))
	fields := Row{}
	for key, items := range values {
		fields[key] = items[0]
	}
	fields["csrf"], fields["expires"] = oauthConsentMAC(cookie.Value, values.Encode(), expires), expires
	member := a.oauthBrowserPrincipal(r)
	send(w, 200, Row{"client": Row{"name": name}, "member": Row{"email": member.str("email"), "role": member.str("role")}, "permissions": requestedOAuthPermissions(scopes), "redirectUri": redirectURI, "resource": values.Get("resource"), "fields": fields, "action": sitePath("/oauth/consent")})
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
	actor := a.requireOAuthMember(r)
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
	ctx = context.WithValue(ctx, oauthMemberBindingKey{}, oauthBinding(a.oauthBrowserPrincipal(r)))
	target, err := a.oauthService().Consent(ctx, actor, oauthserver.ConsentRequest{ClientID: input.ClientID, RedirectURI: input.RedirectURI, Scope: input.Scope, State: input.State, CodeChallenge: input.CodeChallenge, CodeChallengeMethod: input.CodeChallengeMethod})
	if err != nil {
		oauthError(w, err)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}
func (a *App) oauthDeny(w http.ResponseWriter, r *http.Request, ctx context.Context, actor oauthserver.Actor[int], input oauthserver.AuthorizeRequest) {
	allowed := []string{}
	for _, scope := range input.Scope {
		if ok, _ := actor.CanGrant(ctx, scope); ok {
			allowed = append(allowed, scope)
		}
	}
	if len(allowed) == 0 {
		oauthError(w, oauthserver.ErrAccessDenied)
		return
	}
	input.Scope = allowed
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
