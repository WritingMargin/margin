package blog

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"testing"
)

func savedCentralAccount(t *testing.T, a *App, address string) (string, string) {
	t.Helper()
	key := "mai_saved_account_key"
	ciphertext, err := accountEncryption().Encrypt([]byte(key), "settings", "central-account:"+address)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	a.DB.Must(context.Background(), "INSERT INTO central_connection(id,service_url,encrypted_token,registration,account_id) VALUES(1,$1,$2,$3,$4)",
		address, encoded, `{"email":"owner@example.com","blogUrl":"https://blog.example.com"}`, "account-1")
	return key, encoded
}

func TestCentralURLMigrationRequiresExactOldAddressAndVerifiesNewAccount(t *testing.T) {
	a := registrationFixture(t)
	oldURL, newURL := "https://old-central.example", "https://new-central.example"
	t.Setenv("AI_SERVICE_URL", oldURL)
	t.Setenv("AI_SERVICE_URL_MIGRATE_FROM", "")
	key, originalCiphertext := savedCentralAccount(t, a, oldURL)
	t.Setenv("AI_SERVICE_URL", newURL)
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != newURL+"/v1/account" || r.Header.Get("Authorization") != "Bearer "+key {
			t.Fatalf("unexpected migration probe %s", r.URL)
		}
		return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
	})
	expectPanicCode(t, "ACCOUNT_CONFIGURATION", func() { a.accountToken(context.Background()) })
	t.Setenv("AI_SERVICE_URL_MIGRATE_FROM", "https://other-central.example")
	expectPanicCode(t, "ACCOUNT_CONFIGURATION", func() { a.accountToken(context.Background()) })
	if calls != 0 {
		t.Fatal("a different migration source sent the account key")
	}
	t.Setenv("AI_SERVICE_URL_MIGRATE_FROM", oldURL)
	status := responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if !status.yes("connected") || calls != 2 {
		t.Fatal(status, calls)
	}
	saved := a.connection(context.Background())
	if saved.str("service_url") != newURL || saved.str("encrypted_token") == originalCiphertext || decryptAccount(saved) != key {
		t.Fatal("saved account was not rebound to the verified Central URL")
	}
}

func TestCentralURLMigrationFailurePreservesSavedConnection(t *testing.T) {
	a := registrationFixture(t)
	oldURL, newURL := "https://old-central.example", "https://new-central.example"
	t.Setenv("AI_SERVICE_URL", oldURL)
	key, originalCiphertext := savedCentralAccount(t, a, oldURL)
	t.Setenv("AI_SERVICE_URL", newURL)
	t.Setenv("AI_SERVICE_URL_MIGRATE_FROM", oldURL)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != newURL+"/v1/account" || r.Header.Get("Authorization") != "Bearer "+key {
			t.Fatalf("unexpected migration probe %s", r.URL)
		}
		return nil, errors.New("TLS certificate mismatch")
	})
	expectPanicCode(t, "ACCOUNT_MIGRATION_FAILED", func() { a.accountToken(context.Background()) })
	saved := a.connection(context.Background())
	if saved.str("service_url") != oldURL || saved.str("encrypted_token") != originalCiphertext {
		t.Fatal("failed verification changed the saved account")
	}
	t.Setenv("AI_SERVICE_URL", oldURL)
	if a.accountToken(context.Background()) != key {
		t.Fatal("restoring the original URL did not recover the saved account")
	}
}
