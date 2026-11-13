package blog

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

func accountRegistration(saved Row) Row {
	registration := object(saved["registration"])
	return Row{"name": registration["name"], "email": registration["email"], "blogUrl": registration["blogUrl"], "consent": registration["consent"]}
}

func (a *App) saveAccountConnection(ctx context.Context, saved, result Row) {
	if result.yes("authenticationRequired") {
		authentication := validatedAccountAuthentication(result)
		registration := accountRegistration(saved)
		registration["authentication"] = authentication
		a.DB.Must(ctx, "UPDATE central_connection SET registration=$1 WHERE id=1 AND account_id IS NULL", encode(registration))
		return
	}
	if !uuidRE.MatchString(result.str("id")) {
		coded(502, "Margin Studio returned an invalid account. Please try again.", "ACCOUNT_UNAVAILABLE")
	}
	a.DB.Must(ctx, "UPDATE central_connection SET account_id=$1 WHERE id=1 AND encrypted_token=$2", result["id"], saved["encrypted_token"])
}

func validatedAccountAuthentication(result Row) Row {
	u := accountSignInURL(result.str("authenticationUrl"))
	fragment, err := url.ParseQuery(u.Fragment)
	if !secureAccountSignInURL(u) || err != nil || !uuidRE.MatchString(fragment.Get("request")) {
		coded(502, "Margin Studio returned an invalid sign-in link.", "ACCOUNT_UNAVAILABLE")
	}
	if _, err := time.Parse(time.RFC3339, result.str("expiresAt")); err != nil {
		coded(502, "Margin Studio returned an invalid sign-in expiry.", "ACCOUNT_UNAVAILABLE")
	}
	return Row{"url": u.String(), "expiresAt": result["expiresAt"]}
}

func accountSignInURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Path != "/connect-engine" {
		coded(502, "Margin Studio returned an invalid sign-in link.", "ACCOUNT_UNAVAILABLE")
	}
	return u
}

func secureAccountSignInURL(u *url.URL) bool {
	return u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))
}

func (a *App) completeAccountConnection(w http.ResponseWriter, r *http.Request) {
	if a.accountToken(r.Context()) != "" {
		a.accountStatus(w, r)
		return
	}
	saved := a.connection(r.Context())
	if saved == nil || object(object(saved["registration"])["authentication"]).str("url") == "" {
		coded(409, "Start connecting your Margin account first.", "ACCOUNT_AUTH_REQUIRED")
	}
	base := accountURL()
	result, status, err := a.fetchJSON(r.Context(), "GET", base.ResolveReference(&url.URL{Path: "/v1/accounts/connection"}).String(), nil,
		map[string]string{"Authorization": "Bearer " + decryptAccount(saved)}, 10*time.Second)
	result = serviceResult(result, status, err)
	a.saveAccountConnection(r.Context(), saved, result)
	a.accountStatus(w, r)
}
