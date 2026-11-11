package contentcrypto

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

type fixture struct {
	Key       string `json:"key"`
	Bucket    string `json:"bucket"`
	ObjectKey string `json:"objectKey"`
	Plaintext []byte `json:"plaintext"`
	Envelope  []byte `json:"envelope"`
}

func fixtures(t *testing.T) []fixture {
	t.Helper()
	data, err := os.ReadFile("testdata/envelopes.json")
	if err != nil {
		t.Fatal(err)
	}
	var values []fixture
	if err := json.Unmarshal(data, &values); err != nil {
		t.Fatal(err)
	}
	return values
}

func TestReadEnvelopeVectors(t *testing.T) {
	for _, f := range fixtures(t) {
		e, err := New(f.Key)
		if err != nil {
			t.Fatal(err)
		}
		got, err := e.Decrypt(f.Envelope, f.Bucket, f.ObjectKey)
		if err != nil || !bytes.Equal(got, f.Plaintext) {
			t.Fatalf("Envelope vector %q: %v", f.ObjectKey, err)
		}
	}
}

func TestRoundTripAndFreshNonces(t *testing.T) {
	e, _ := New(strings.Repeat("ab", 32))
	for _, plaintext := range [][]byte{nil, []byte("日本語 🪴"), bytes.Repeat([]byte{0, 255, 32}, 400000)} {
		first, err := e.Encrypt(plaintext, "blog", "posts/one.md")
		if err != nil {
			t.Fatal(err)
		}
		second, err := e.Encrypt(plaintext, "blog", "posts/one.md")
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Equal(first, second) || len(first) != len(plaintext)+Overhead {
			t.Fatal("invalid envelope or reused nonce")
		}
		got, err := e.Decrypt(first, "blog", "posts/one.md")
		if err != nil || !bytes.Equal(got, plaintext) {
			t.Fatalf("round trip: %v", err)
		}
	}
}

func TestRejectTamperingWithoutPlaintext(t *testing.T) {
	f := fixtures(t)[0]
	e, _ := New(f.Key)
	check := func(data []byte, bucket, key string) {
		t.Helper()
		plaintext, err := e.Decrypt(data, bucket, key)
		if err == nil || plaintext != nil {
			t.Fatal("unauthenticated plaintext was returned")
		}
	}
	for i := range f.Envelope {
		corrupted := bytes.Clone(f.Envelope)
		corrupted[i] ^= 1
		check(corrupted, f.Bucket, f.ObjectKey)
	}
	for i := 0; i < len(f.Envelope); i++ {
		check(f.Envelope[:i], f.Bucket, f.ObjectKey)
	}
	check(f.Envelope, "other-bucket", f.ObjectKey)
	check(f.Envelope, f.Bucket, "posts/two.md")
	check([]byte("Legacy plaintext must never be accepted"), f.Bucket, f.ObjectKey)
	wrong, _ := New(strings.Repeat("ab", 32))
	if got, err := wrong.Decrypt(f.Envelope, f.Bucket, f.ObjectKey); got != nil || !errors.Is(err, ErrAuthentication) {
		t.Fatal("wrong key accepted")
	}
}

func TestInvalidKeysAndEnvelopeVersions(t *testing.T) {
	for _, key := range []string{"", "secret", strings.Repeat("a", 63), strings.Repeat("a", 65), strings.Repeat("g", 64)} {
		if _, err := New(key); !errors.Is(err, ErrKey) {
			t.Fatalf("accepted key %q", key)
		}
	}
	encryption, err := New(strings.Repeat("ab", 32))
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"MRGSEC99" + strings.Repeat("x", 28), "MRGSEC01", "MRGSE", "plaintext"} {
		plain, err := encryption.Decrypt([]byte(value), "bucket", "key")
		if err == nil || plain != nil {
			t.Fatal("invalid envelope accepted")
		}
	}
}
