package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReencryptRequiresExplicitKeysBeforeOpeningDatabase(t *testing.T) {
	isolatedPaths(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", "")
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	if err := reencrypt(nil); err == nil || !strings.Contains(err.Error(), "CONTENT_ENCRYPTION_KEY_PREVIOUS") {
		t.Fatalf("missing key accepted: %v", err)
	}
	if _, err := os.Stat(os.Getenv("SQLITE_PATH")); !os.IsNotExist(err) {
		t.Fatal("database created before validating keys")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", strings.Repeat("cd", 32))
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	if err := reencrypt(nil); err == nil {
		t.Fatal("missing target key accepted")
	}
}

func TestReencryptConfigurationAndArguments(t *testing.T) {
	isolatedPaths(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", strings.Repeat("cd", 32))
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	directory := t.TempDir()
	envFile := filepath.Join(directory, "rotation.env")
	writeTestFile(t, envFile, []byte("CONTENT_ENCRYPTION_KEY="+strings.Repeat("ef", 32)+"\n"))
	opts, err := parseReencrypt([]string{"--data-dir", directory, "--env-file", envFile})
	if err != nil {
		t.Fatal(err)
	}
	if err := configureReencrypt(opts); err != nil {
		t.Fatal(err)
	}
	if os.Getenv("SQLITE_PATH") != filepath.Join(directory, "margin.db") {
		t.Fatal("ignored metadata directory")
	}
	if os.Getenv("CONTENT_ENCRYPTION_KEY") != strings.Repeat("ab", 32) {
		t.Fatal("environment did not override file")
	}
	if _, err := parseReencrypt([]string{"secret-key"}); err == nil {
		t.Fatal("positional keys accepted")
	}
	if err := reencrypt([]string{"--help"}); err != nil {
		t.Fatal(err)
	}
}

func TestReencryptVerificationNeedsOnlyPrimaryKey(t *testing.T) {
	isolatedPaths(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", "")
	envFile := filepath.Join(t.TempDir(), "empty.env")
	writeTestFile(t, envFile, nil)
	opts, err := parseReencrypt([]string{"--verify-only", "--env-file", envFile})
	if err != nil || !opts.verify {
		t.Fatal("verify flag unavailable", err)
	}
	if err := configureReencrypt(opts); err != nil {
		t.Fatal("verification unnecessarily requires old key", err)
	}
	opts.verify = false
	if err := configureReencrypt(opts); err == nil {
		t.Fatal("migration requires old key")
	}
}
