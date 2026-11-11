package contentcrypto

import (
	"bytes"
	"strings"
	"testing"
)

func TestDualKeyReadsAlwaysWritePrimary(t *testing.T) {
	oldKey, newKey := strings.Repeat("11", 32), strings.Repeat("22", 32)
	old, _ := New(oldKey)
	primary, _ := New(newKey)
	both, err := NewWithPrevious(newKey, oldKey)
	if err != nil {
		t.Fatal(err)
	}
	plaintext := []byte("article or private credential")
	for _, writer := range []*Encryption{old, primary} {
		data, _ := writer.Encrypt(plaintext, "bucket", "object")
		got, err := both.Decrypt(data, "bucket", "object")
		if err != nil || !bytes.Equal(got, plaintext) {
			t.Fatalf("dual read: %q %v", got, err)
		}
	}
	data, _ := both.Encrypt(plaintext, "bucket", "object")
	if _, err := primary.Decrypt(data, "bucket", "object"); err != nil {
		t.Fatal("write did not use primary", err)
	}
	if _, err := old.Decrypt(data, "bucket", "object"); err == nil {
		t.Fatal("new write used previous key")
	}
	previousData, _ := old.Encrypt(plaintext, "bucket", "object")
	if _, err := both.PrimaryOnly().Decrypt(previousData, "bucket", "object"); err == nil {
		t.Fatal("primary-only verification accepted fallback ciphertext")
	}
}

func TestDualKeyReadsRejectTamperingAndWrongContext(t *testing.T) {
	old, _ := New(strings.Repeat("11", 32))
	both, _ := NewWithPrevious(strings.Repeat("22", 32), strings.Repeat("11", 32))
	data, _ := old.Encrypt([]byte("private"), "bucket", "object")
	for _, pair := range [][2]string{{"other", "object"}, {"bucket", "moved"}} {
		if plain, err := both.Decrypt(data, pair[0], pair[1]); err == nil || len(plain) != 0 {
			t.Fatal("fallback bypassed authenticated context")
		}
	}
	data[len(data)-1] ^= 1
	if plain, err := both.Decrypt(data, "bucket", "object"); err == nil || len(plain) != 0 {
		t.Fatal("fallback accepted tampering")
	}
	if _, err := NewWithPrevious(strings.Repeat("22", 32), "bad"); err == nil {
		t.Fatal("invalid fallback silently ignored")
	}
	if _, err := NewWithPrevious("bad", strings.Repeat("11", 32)); err == nil {
		t.Fatal("fallback replaced invalid primary")
	}
	if _, err := NewWithPrevious(strings.Repeat("22", 32), ""); err != nil {
		t.Fatal(err)
	}
}
