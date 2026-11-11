package blog

import (
	"context"
	"encoding/base64"
	"margin/backend/internal/contentcrypto"
	"strings"
	"testing"
	"time"
)

func enableRotationFallback(t *testing.T, f *rotationFixture) {
	t.Helper()
	var err error
	f.storage.encryption, err = contentcrypto.NewWithPrevious(rotationNewKey, rotationOldKey)
	if err != nil {
		t.Fatal(err)
	}
}

func TestReencryptAllowsLiveReadsAndNewWrites(t *testing.T) {
	checkRotationLiveTraffic(t, newRotationFixture(t))
}

func TestPostgreSQLReencryptAllowsLiveReadsAndNewWrites(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	checkRotationLiveTraffic(t, rotationFixtureForDatabase(t, db))
}

func checkRotationLiveTraffic(t *testing.T, f *rotationFixture) {
	t.Helper()
	enableRotationFallback(t, f)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mixedReadChecked := false
	f.onGet = func() {
		writeDuringRotation(t, f, ctx)
		f.afterPut = func(key string) {
			checkMixedRotationReads(t, f, ctx, key)
			mixedReadChecked = true
		}
	}
	result, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey)
	if err != nil || result.Objects != 8 {
		t.Fatalf("rotation: %+v %v", result, err)
	}
	if !mixedReadChecked {
		t.Fatal("live reads never ran during mixed-key migration")
	}
	if err := VerifyReencryption(ctx, f.db, f.storage); err != nil {
		t.Fatal(err)
	}
	checkRotationReadsWithoutFallback(t, f, ctx)
	plain, err := f.storage.encryption.PrimaryOnly().Decrypt(f.objects["documents/concurrent"], "test", "documents/concurrent")
	if err != nil || string(plain) != "new document" {
		t.Fatalf("new writes did not use primary: %q %v", plain, err)
	}
}

func TestVerifyReencryptionDoesNotAcceptFallback(t *testing.T) {
	f := newRotationFixture(t)
	enableRotationFallback(t, f)
	ctx := context.Background()
	if _, err := f.storage.Get(ctx, "posts/live.md"); err != nil {
		t.Fatal(err)
	}
	if err := VerifyReencryption(ctx, f.db, f.storage); err == nil {
		t.Fatal("verification accepted old-key data through fallback")
	}
	if _, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey); err != nil {
		t.Fatal(err)
	}
	if err := VerifyReencryption(ctx, f.db, f.storage); err != nil {
		t.Fatal(err)
	}
	previous, _ := contentcrypto.New(rotationOldKey)
	f.objects["posts/live.md"], _ = previous.Encrypt([]byte("old writer"), "test", "posts/live.md")
	if err := VerifyReencryption(ctx, f.db, f.storage); err == nil {
		t.Fatal("verification accepted old-key S3 object")
	}
}

func TestReencryptFinalVerificationFindsNewOldKeyReferences(t *testing.T) {
	f := newRotationFixture(t)
	enableRotationFallback(t, f)
	ctx := context.Background()
	f.onGet = func() {
		previous, _ := contentcrypto.New(rotationOldKey)
		f.objects["documents/old-writer"], _ = previous.Encrypt([]byte("old writer"), "test", "documents/old-writer")
		f.db.Must(ctx, "INSERT INTO source_documents(id,object_key,title) VALUES('concurrent','documents/old-writer','Concurrent')")
	}
	_, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey)
	if err == nil || !strings.Contains(err.Error(), "primary-key verification failed") {
		t.Fatalf("new old-key reference escaped final verification: %v", err)
	}
	if _, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey); err != nil {
		t.Fatalf("retry: %v", err)
	}
}

func TestReencryptSettingsCASPreservesConcurrentEdits(t *testing.T) {
	for _, table := range []string{"turnstile_settings", "newsletter_smtp", "central_connection"} {
		t.Run(table, func(t *testing.T) { checkRotationSettingConflict(t, newRotationFixture(t), table) })
	}
}

func checkRotationSettingConflict(t *testing.T, f *rotationFixture, table string) {
	t.Helper()
	ctx := context.Background()
	var replacement string
	f.onGet = func() {
		column, key := "encrypted_configuration", "turnstile"
		if table == "newsletter_smtp" {
			key = "newsletter-smtp"
		}
		if table == "central_connection" {
			column, key = "encrypted_token", "central-account:https://account.test"
		}
		data, err := f.storage.encryption.Encrypt([]byte("concurrent credentials"), "settings", key)
		if err != nil {
			t.Fatal(err)
		}
		replacement = base64.StdEncoding.EncodeToString(data)
		f.db.Must(ctx, "UPDATE "+table+" SET "+column+"=$1 WHERE id=1", replacement)
	}
	_, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey)
	if err == nil || !strings.Contains(err.Error(), table+" changed during re-encryption") {
		t.Fatalf("concurrent settings overwrite: %v", err)
	}
	row := first(f.db.Must(ctx, "SELECT * FROM "+table+" WHERE id=1"))
	column := "encrypted_configuration"
	if table == "central_connection" {
		column = "encrypted_token"
	}
	if row.str(column) != replacement {
		t.Fatal("concurrent credential edit was lost")
	}
	if _, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey); err != nil {
		t.Fatalf("retry with concurrent settings: %v", err)
	}
}

func TestReencryptAccountCASIncludesEncryptionContext(t *testing.T) {
	f := newRotationFixture(t)
	ctx := context.Background()
	before := first(f.db.Must(ctx, "SELECT encrypted_token FROM central_connection")).str("encrypted_token")
	f.onGet = func() { f.db.Must(ctx, "UPDATE central_connection SET service_url='https://changed.test' WHERE id=1") }
	_, err := Reencrypt(ctx, f.db, f.storage, rotationOldKey)
	if err == nil || !strings.Contains(err.Error(), "central_connection changed") {
		t.Fatalf("changed encryption context ignored: %v", err)
	}
	row := first(f.db.Must(ctx, "SELECT encrypted_token,service_url FROM central_connection"))
	if row.str("encrypted_token") != before || row.str("service_url") != "https://changed.test" {
		t.Fatal("concurrent account edit overwritten")
	}
}

func TestPostgreSQLReencryptSettingsCASPreservesConcurrentEdits(t *testing.T) {
	for _, table := range []string{"turnstile_settings", "newsletter_smtp", "central_connection"} {
		t.Run(table, func(t *testing.T) {
			db, _ := postgresTestDatabase(t)
			checkRotationSettingConflict(t, rotationFixtureForDatabase(t, db), table)
		})
	}
}

func checkMixedRotationReads(t *testing.T, f *rotationFixture, ctx context.Context, migrated string) {
	t.Helper()
	primary := f.storage.encryption.PrimaryOnly()
	if _, err := primary.Decrypt(f.objects[migrated], "test", migrated); err != nil {
		t.Fatalf("hook ran before object migrated: %v", err)
	}
	if _, err := primary.Decrypt(f.objects["posts/live.md"], "test", "posts/live.md"); err == nil {
		t.Fatal("hook did not observe mixed-key objects")
	}
	for _, key := range []string{migrated, "posts/live.md"} {
		body, err := f.storage.Get(ctx, key)
		if err != nil || string(body) != "content of "+key {
			t.Fatalf("mixed-key live read %s: %q %v", key, body, err)
		}
	}
	row := first(f.db.Must(ctx, "SELECT encrypted_configuration FROM newsletter_smtp"))
	data, err := base64.StdEncoding.DecodeString(row.str("encrypted_configuration"))
	if err != nil {
		t.Fatal(err)
	}
	plain, err := f.storage.encryption.Decrypt(data, "settings", "newsletter-smtp")
	if err != nil || string(plain) != "secret for newsletter-smtp" {
		t.Fatalf("live credential read: %q %v", plain, err)
	}
}

func checkRotationReadsWithoutFallback(t *testing.T, f *rotationFixture, ctx context.Context) {
	t.Helper()
	f.storage.encryption = f.storage.encryption.PrimaryOnly()
	for key := range f.objects {
		expected := "content of " + key
		if key == "documents/concurrent" {
			expected = "new document"
		}
		plain, err := f.storage.Get(ctx, key)
		if err != nil || string(plain) != expected {
			t.Fatalf("read after removing fallback %s: %q %v", key, plain, err)
		}
	}
	if err := VerifyReencryption(ctx, f.db, f.storage); err != nil {
		t.Fatalf("verification after removing fallback: %v", err)
	}
}

func writeDuringRotation(t *testing.T, f *rotationFixture, ctx context.Context) {
	t.Helper()
	// S3 access happens after the SQL snapshot is released: normal reads and
	// metadata writes must complete while migration is reading older objects.
	body, err := f.storage.Get(ctx, "posts/live.md")
	if err != nil || string(body) != "content of posts/live.md" {
		t.Fatalf("live read: %q %v", body, err)
	}
	if err := f.storage.Put(ctx, "documents/concurrent", []byte("new document")); err != nil {
		t.Fatal(err)
	}
	_, err = f.db.SQL.ExecContext(ctx, "INSERT INTO source_documents(id,object_key,title) VALUES('concurrent','documents/concurrent','Concurrent')")
	if err != nil {
		t.Fatalf("live write blocked by rotation: %v", err)
	}
}
