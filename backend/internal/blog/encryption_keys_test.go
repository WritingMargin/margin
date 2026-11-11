package blog

import (
	"context"
	"encoding/base64"
	"margin/backend/internal/contentcrypto"
	"testing"
)

func TestSavedCredentialsReadBothKeysAndWritePrimary(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", rotationNewKey)
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", rotationOldKey)
	t.Setenv("AI_SERVICE_TOKEN", "")
	previous, _ := contentcrypto.New(rotationOldKey)
	ctx := context.Background()
	settings := []struct{ table, column, key, plain string }{
		{"turnstile_settings", "encrypted_configuration", "turnstile", `{"provider":"turnstile","siteKey":"old-site-key","secretKey":"old-secret-key"}`},
		{"newsletter_smtp", "encrypted_configuration", "newsletter-smtp", `{"host":"smtp.example.com","port":587,"security":"starttls","username":"writer","password":"old-password"}`},
		{"central_connection", "encrypted_token", "central-account:https://central.example", "old-account-token"},
	}
	for _, setting := range settings {
		data, _ := previous.Encrypt([]byte(setting.plain), "settings", setting.key)
		query := "INSERT INTO " + setting.table + "(id," + setting.column + ") VALUES(1,$1)"
		if setting.table == "central_connection" {
			query = "INSERT INTO central_connection(id,service_url,encrypted_token,registration) VALUES(1,'https://central.example',$1,'{}')"
		}
		a.DB.Must(ctx, query, base64.StdEncoding.EncodeToString(data))
	}
	if a.turnstile(ctx).str("secretKey") != "old-secret-key" || a.smtpSettings(ctx).str("password") != "old-password" {
		t.Fatal("old saved settings unreadable")
	}
	if decryptAccount(a.connection(ctx)) != "old-account-token" {
		t.Fatal("old account token unreadable")
	}
	// Updating SMTP without supplying a new password must preserve the old secret,
	// but encrypt the new saved configuration using only the primary key.
	a.saveSMTP(ctx, Row{"host": "smtp.example.com", "port": float64(587), "security": "starttls", "username": "writer"})
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", "")
	if a.smtpSettings(ctx).str("password") != "old-password" {
		t.Fatal("new setting requires fallback key")
	}
}

func TestStorageLoadsFallbackFromEnvironment(t *testing.T) {
	t.Setenv("CONTENT_ENCRYPTION_KEY", rotationNewKey)
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", rotationOldKey)
	t.Setenv("S3_BUCKET", "test")
	t.Setenv("S3_REGION", "us-east-1")
	storage, err := NewStorage(context.Background())
	if err != nil || !storage.Configured() {
		t.Fatal("dual-key storage unavailable", err)
	}
	previous, _ := contentcrypto.New(rotationOldKey)
	data, _ := previous.Encrypt([]byte("old body"), "test", "posts/old.md")
	plain, err := storage.encryption.Decrypt(data, "test", "posts/old.md")
	if err != nil || string(plain) != "old body" {
		t.Fatal("storage did not load fallback", err)
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", "invalid")
	invalid, err := NewStorage(context.Background())
	if err != nil || invalid.Configured() {
		t.Fatal("invalid fallback accepted", err)
	}
}
