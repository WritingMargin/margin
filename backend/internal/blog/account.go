package blog

import (
	"context"
	"encoding/base64"
	"margin/backend/internal/contentcrypto"
	"net/http"
	"net/url"
	"os"
	"time"
)

func accountEncryption() *contentcrypto.Encryption {
	cipher, err := configuredContentEncryption()
	if err != nil {
		coded(503, "Configure the server encryption key before connecting a Margin account.", "ACCOUNT_CONFIGURATION")
	}
	return cipher
}
func (a *App) connection(ctx context.Context) Row {
	return first(a.DB.Must(ctx, "SELECT * FROM central_connection WHERE id=1"))
}
func decryptAccount(row Row) string {
	if row.str("service_url") != serviceAddress() {
		coded(503, "The saved account belongs to a different Margin service address. Restore AI_SERVICE_URL.", "ACCOUNT_CONFIGURATION")
	}
	return decryptStoredAccount(row)
}
func decryptStoredAccount(row Row) string {
	data, err := base64.StdEncoding.DecodeString(row.str("encrypted_token"))
	must(err)
	plain, err := accountEncryption().Decrypt(data, "settings", "central-account:"+row.str("service_url"))
	must(err)
	return string(plain)
}
func (a *App) accountToken(ctx context.Context) string {
	if key := os.Getenv("AI_SERVICE_TOKEN"); key != "" {
		return key
	}
	row := a.connection(ctx)
	if row == nil || row.str("account_id") == "" {
		return ""
	}
	if row.str("service_url") != serviceAddress() {
		if os.Getenv("AI_SERVICE_URL_MIGRATE_FROM") != row.str("service_url") {
			coded(503, "The saved account belongs to a different Margin service address. Restore AI_SERVICE_URL or explicitly set AI_SERVICE_URL_MIGRATE_FROM to the saved address.", "ACCOUNT_CONFIGURATION")
		}
		return a.migrateAccountURL(ctx, row)
	}
	return decryptAccount(row)
}

// Moving a saved account is explicit because it sends its credential to the
// newly configured Central. Verify that Central accepts the same credential
// before changing the authenticated encryption context or saved address.
func (a *App) migrateAccountURL(ctx context.Context, row Row) string {
	key := decryptStoredAccount(row)
	base := accountURL()
	result, status, err := a.fetchJSON(ctx, "GET", base.ResolveReference(&url.URL{Path: "/v1/account"}).String(), nil,
		map[string]string{"Authorization": "Bearer " + key, "Content-Type": "application/json"}, 10*time.Second)
	if err != nil || status != 200 || !validEntitlements(object(result["entitlements"])) {
		coded(503, "The new Margin service address could not verify the saved account. Check AI_SERVICE_URL, its TLS certificate and shared account database; restore the old URL until this succeeds.", "ACCOUNT_MIGRATION_FAILED")
	}
	encrypted, err := accountEncryption().Encrypt([]byte(key), "settings", "central-account:"+serviceAddress())
	must(err)
	updated, err := a.DB.SQL.ExecContext(ctx,
		"UPDATE central_connection SET service_url=$1,encrypted_token=$2 WHERE id=1 AND service_url=$3 AND encrypted_token=$4 AND account_id=$5",
		serviceAddress(), base64.StdEncoding.EncodeToString(encrypted), row.str("service_url"), row.str("encrypted_token"), row.str("account_id"))
	must(err)
	count, err := updated.RowsAffected()
	must(err)
	if count == 0 {
		current := a.connection(ctx)
		if current.str("service_url") != serviceAddress() {
			coded(409, "The saved Margin account connection changed during migration. Retry after checking AI_SERVICE_URL.", "ACCOUNT_CONFIGURATION")
		}
		return decryptAccount(current)
	}
	return key
}
func (a *App) serviceHeaders(ctx context.Context) map[string]string {
	return map[string]string{"Authorization": "Bearer " + a.accountToken(ctx), "Content-Type": "application/json"}
}
func (a *App) accountRoutes() {
	a.mux.HandleFunc("GET /api/account", a.accountStatus)
	a.mux.HandleFunc("POST /api/account", a.createAccount)
	a.mux.HandleFunc("POST /api/account/connection", a.completeAccountConnection)
}
func (a *App) accountStatus(w http.ResponseWriter, r *http.Request) {
	row := a.connection(r.Context())
	owner := first(a.DB.Must(r.Context(), "SELECT email FROM admins WHERE id=1"))
	_, serviceErr := serviceURL()
	_, keyErr := configuredContentEncryption()
	state := a.accountState(r.Context())
	connected := state == "connected"
	email, blogURL := owner.str("email"), a.newsletterOrigin(r.Context())
	if row != nil {
		registration := object(row["registration"])
		email, blogURL = registration.str("email"), registration.str("blogUrl")
	}
	response := Row{"connected": connected, "pending": row != nil && !connected,
		"connectionState": state, "serverTokenConfigured": os.Getenv("AI_SERVICE_TOKEN") != "",
		"registrationAvailable": state == "disconnected" && serviceErr == nil && keyErr == nil && owner != nil && a.newsletterOrigin(r.Context()) != "",
		"email":                 email, "blogUrl": blogURL}
	if state == "disconnected" && row != nil && row.str("account_id") == "" {
		response["authentication"] = object(object(row["registration"])["authentication"])
	}
	send(w, 200, response)
}
func (a *App) prepareAccount(r *http.Request) Row {
	ctx := r.Context()
	if row := a.connection(ctx); row != nil {
		return row
	}
	owner := first(a.DB.Must(ctx, "SELECT email FROM admins WHERE id=1"))
	origin := a.newsletterOrigin(ctx)
	if owner == nil || origin == "" {
		coded(503, "Set up your local owner and public blog URL before connecting a Margin account.", "ACCOUNT_CONFIGURATION")
	}
	key := "mai_" + token()
	encrypted, err := accountEncryption().Encrypt([]byte(key), "settings", "central-account:"+serviceAddress())
	must(err)
	input := Row{"name": "Margin blog", "email": owner["email"], "blogUrl": origin, "consent": true}
	// Save the same registration credential before sending; retries and concurrent
	// requests must converge on one remote account, including after a timeout.
	a.DB.Must(ctx, "INSERT INTO central_connection(id,service_url,encrypted_token,registration) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO NOTHING",
		serviceAddress(), base64.StdEncoding.EncodeToString(encrypted), encode(input))
	return a.connection(ctx)
}
func (a *App) createAccount(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "consent")
	if !booleanField(input, "consent") {
		fail(400, "Confirm account creation before continuing.")
	}
	a.limit(r, "account-create", 10, time.Hour, true)
	if a.accountToken(r.Context()) != "" {
		a.accountStatus(w, r)
		return
	}
	base := accountURL()
	saved := a.prepareAccount(r)
	headers := map[string]string{"Authorization": "Bearer " + decryptAccount(saved), "Content-Type": "application/json"}
	result, status, err := a.fetchJSON(r.Context(), "POST", base.ResolveReference(&url.URL{Path: "/v1/accounts"}).String(), accountRegistration(saved), headers, 20*time.Second)
	if err != nil {
		coded(503, "Account creation could not finish. Your blog still works; try again to complete the same registration.", "ACCOUNT_UNAVAILABLE")
	}
	result = serviceResult(result, status, nil)
	a.saveAccountConnection(r.Context(), saved, result)
	a.accountStatus(w, r)
}
