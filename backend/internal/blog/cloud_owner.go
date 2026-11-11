package blog

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"net/http"
	"net/url"
	"os"
	"strings"
)

func (a *App) cloudOwnerRoutes() {
	a.mux.HandleFunc("GET /api/settings/software-update", a.softwareUpdate)
	a.mux.HandleFunc("POST /api/settings/software-update", a.softwareUpdate)
	a.mux.HandleFunc("POST /api/cloud/bootstrap", a.cloudBootstrap)
	a.mux.HandleFunc("GET /api/cloud/storage-usage", a.cloudStorageUsage)
}
func (a *App) cloudStorageUsage(w http.ResponseWriter, r *http.Request) {
	cloudMachineRequest(r)
	if a.cloudOwner(r.Context()).str("subject") == "" {
		coded(403, "Cloud provisioning authorization is required.", "CLOUD_AUTH_REQUIRED")
	}
	storage, ok := a.Storage.(*S3Storage)
	if !ok {
		coded(503, "Storage usage is unavailable. Please contact support.", "STORAGE_UNAVAILABLE")
	}
	used, err := storage.Usage(r.Context())
	if err != nil {
		coded(503, "Storage usage is unavailable. Please contact support.", "STORAGE_UNAVAILABLE")
	}
	send(w, 200, Row{"bytes": used})
}
func (a *App) cloudOwner(ctx context.Context) Row {
	return object(first(a.DB.Must(ctx, "SELECT configuration FROM site_settings WHERE name='cloud_owner'"))["configuration"])
}
func cloudMachineRequest(r *http.Request) {
	expected := os.Getenv("SETUP_TOKEN")
	supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") || len(expected) < 32 || subtle.ConstantTimeCompare([]byte(hash(expected)), []byte(hash(supplied))) != 1 {
		fail(403, "Cloud provisioning authorization is required.")
	}
	if r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") != "" {
		fail(403, "Cloud provisioning is server-to-server only.")
	}
}
func cloudCentralOrigin(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u == nil {
		fail(400, "Invalid Central origin.")
	}
	secure := u.Scheme == "https"
	if env("MARGIN_ENV", "production") != "production" && u.Scheme == "http" {
		secure = u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost"
	}
	if !secure || !plainCloudOrigin(u) {
		fail(400, "Invalid Central origin.")
	}
	return strings.TrimSuffix(raw, "/")
}
func plainCloudOrigin(u *url.URL) bool {
	return u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "" && !u.ForceQuery && (u.Path == "" || u.Path == "/")
}
func cloudBindingMatches(binding Row, subject, origin string) {
	if binding.str("subject") != subject || binding.str("centralOrigin") != origin {
		coded(409, "This publication is already owned by another account.", "CLOUD_OWNER_CONFLICT")
	}
}
func (a *App) cloudBootstrap(w http.ResponseWriter, r *http.Request) {
	cloudMachineRequest(r)
	input := body(w, r)
	strict(input, "subject", "email", "centralOrigin", "name", "emailVerified")
	if !input.yes("emailVerified") {
		fail(403, "Verify the owner email before provisioning.")
	}
	subject := stringField(input, "subject", 1, 100, true)
	email := emailField(input, "email", false)
	origin := cloudCentralOrigin(stringField(input, "centralOrigin", 1, 2048, true))
	name := stringField(input, "name", 1, 80, true)
	if a.cloudInsertOwner(r.Context(), email, name, Row{"subject": subject, "centralOrigin": origin}) {
		send(w, 201, Row{"ready": true})
		return
	}
	cloudBindingMatches(a.cloudOwner(r.Context()), subject, origin)
	send(w, 200, Row{"ready": true})
}

// The owner and immutable cloud identity commit together. Never claim an existing local owner.
func (a *App) cloudInsertOwner(ctx context.Context, email, name string, binding Row) bool {
	theme := a.settings(ctx)
	theme["name"], theme["publicationType"] = name, "blog"
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	query, args := a.DB.adapt("INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING", []any{email, "cloud-managed:no-local-password"})
	result, err := tx.ExecContext(ctx, query, args...)
	must(err)
	count, err := result.RowsAffected()
	must(err)
	if count == 0 {
		return false
	}
	a.cloudTxExec(ctx, tx, "INSERT INTO owner_email_verification(id,email,verified_at) VALUES(1,$1,NOW())", email)
	a.cloudTxExec(ctx, tx, "INSERT INTO site_settings(name,configuration) VALUES('cloud_owner',$1)", encode(binding))
	a.cloudTxExec(ctx, tx, "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", encode(theme))
	must(tx.Commit())
	return true
}
func (a *App) cloudTxExec(ctx context.Context, tx *sql.Tx, statement string, values ...any) {
	query, args := a.DB.adapt(statement, values)
	_, err := tx.ExecContext(ctx, query, args...)
	must(err)
}
