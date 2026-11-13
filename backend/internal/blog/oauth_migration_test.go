package blog

import (
	"testing"
	"time"
)

func TestOAuthLegacySchemaMigration(t *testing.T) { testOAuthLegacySchemaMigration(t, oauthFixture(t)) }
func TestPostgreSQLOAuthLegacySchemaMigration(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a := oauthFixture(t)
	a.DB = db
	db.Must(t.Context(), "INSERT INTO admins(id,email,password_hash) VALUES(1,'owner@example.test','unused')")
	db.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	testOAuthLegacySchemaMigration(t, a)
}
func testOAuthLegacySchemaMigration(t *testing.T, a *App) {
	t.Helper()
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	code := oauthCodeTest(t, a, client.str("client_id"), "writer", "https://blog.test/api")
	consents := a.DB.Must(t.Context(), "SELECT * FROM oauth_consents")
	codes := a.DB.Must(t.Context(), "SELECT * FROM oauth_codes")
	grants := a.DB.Must(t.Context(), "SELECT * FROM oauth_tokens")
	_, err := a.DB.SQL.Exec(`DROP TABLE oauth_tokens;DROP TABLE oauth_codes;DROP TABLE oauth_consents;
 CREATE TABLE oauth_consents(client_id TEXT PRIMARY KEY REFERENCES oauth_clients(id) ON DELETE CASCADE,subject_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,data TEXT NOT NULL);
 CREATE TABLE oauth_codes(code_hash TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES oauth_consents(client_id) ON DELETE CASCADE,expires_at BIGINT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE oauth_tokens(access_hash TEXT PRIMARY KEY,refresh_hash TEXT UNIQUE NOT NULL,client_id TEXT NOT NULL REFERENCES oauth_consents(client_id) ON DELETE CASCADE,family_id TEXT NOT NULL,expires_at BIGINT NOT NULL,rotated INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);`)
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range consents {
		a.DB.Must(t.Context(), "INSERT INTO oauth_consents(client_id,subject_id,data) VALUES($1,$2,$3)", v["client_id"], v["subject_id"], v["data"])
	}
	for _, v := range codes {
		a.DB.Must(t.Context(), "INSERT INTO oauth_codes(code_hash,client_id,expires_at,data) VALUES($1,$2,$3,$4)", v["code_hash"], v["client_id"], v["expires_at"], v["data"])
	}
	for _, v := range grants {
		a.DB.Must(t.Context(), "INSERT INTO oauth_tokens(access_hash,refresh_hash,client_id,family_id,expires_at,rotated,revoked,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", v["access_hash"], v["refresh_hash"], v["client_id"], v["family_id"], v["expires_at"], v["rotated"], v["revoked"], v["data"])
	}
	if err = a.DB.initialize(); err != nil {
		t.Fatal("upgrade", err)
	}
	if err = a.DB.initialize(); err != nil {
		t.Fatal("repeat startup", err)
	}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), code), false), 200)
	// Legacy and Central-member consents can coexist for the same client after
	// migration; deleting the old administrator removes only legacy grants.
	a.DB.Must(t.Context(), "INSERT INTO oauth_consents(client_id,subject_id,data) VALUES($1,2,'{}')", consents[0]["client_id"])
	a.DB.Must(t.Context(), "DELETE FROM admins WHERE id=1")
	if len(a.DB.Must(t.Context(), "SELECT * FROM oauth_tokens")) != 0 {
		t.Fatal("legacy grant survived owner deletion")
	}
	if len(a.DB.Must(t.Context(), "SELECT * FROM oauth_consents WHERE subject_id=2")) != 1 {
		t.Fatal("owner deletion removed member consent")
	}
}
