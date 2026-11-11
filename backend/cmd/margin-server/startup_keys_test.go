package main

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func TestStartupKeysPersistAndStayPrivate(t *testing.T) {
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	t.Setenv("SETUP_TOKEN", "")
	directory := filepath.Join(t.TempDir(), "data")
	var output bytes.Buffer
	configureTestStartupKeys(t, directory, &output)
	key, token := os.Getenv("CONTENT_ENCRYPTION_KEY"), os.Getenv("SETUP_TOKEN")
	if key == token || len(key) != 64 || len(token) != 64 {
		t.Fatal("expected independent random keys")
	}
	assertPrivateKeyFiles(t, directory)
	if strings.Contains(output.String(), key) || strings.Contains(output.String(), token) {
		t.Fatal("startup leaked credentials")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	t.Setenv("SETUP_TOKEN", "")
	configureTestStartupKeys(t, directory, &output)
	if os.Getenv("CONTENT_ENCRYPTION_KEY") != key || os.Getenv("SETUP_TOKEN") != token {
		t.Fatal("restart changed keys")
	}
}

func TestStartupEnvironmentOverridesAndWarns(t *testing.T) {
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	t.Setenv("SETUP_TOKEN", "")
	directory := t.TempDir()
	var output bytes.Buffer
	configureTestStartupKeys(t, directory, &output)
	savedKey, savedToken := os.Getenv("CONTENT_ENCRYPTION_KEY"), os.Getenv("SETUP_TOKEN")
	override := strings.Repeat("ab", 32)
	t.Setenv("CONTENT_ENCRYPTION_KEY", override)
	t.Setenv("SETUP_TOKEN", "explicit-setup")
	output.Reset()
	configureTestStartupKeys(t, directory, &output)
	if os.Getenv("CONTENT_ENCRYPTION_KEY") != override || os.Getenv("SETUP_TOKEN") != "explicit-setup" {
		t.Fatal("environment override ignored")
	}
	if !strings.Contains(output.String(), "has changed") || !strings.Contains(output.String(), "reencrypt") {
		t.Fatal("missing key change warning")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	t.Setenv("SETUP_TOKEN", "")
	output.Reset()
	configureTestStartupKeys(t, directory, &output)
	if os.Getenv("CONTENT_ENCRYPTION_KEY") != savedKey || os.Getenv("SETUP_TOKEN") != savedToken {
		t.Fatal("overrides replaced saved defaults")
	}
	if !strings.Contains(output.String(), "has changed") {
		t.Fatal("removing encryption override must warn too")
	}
}

func TestStartupRejectsInvalidOrMissingSavedEncryptionKey(t *testing.T) {
	for _, invalid := range []string{"bad", "", strings.Repeat("gg", 32)} {
		t.Run("saved-"+invalid, func(t *testing.T) {
			t.Setenv("CONTENT_ENCRYPTION_KEY", "")
			t.Setenv("SETUP_TOKEN", "")
			directory := t.TempDir()
			writeTestFile(t, filepath.Join(directory, encryptionKeyFile), []byte(invalid))
			if err := configureStartupKeys(directory, &bytes.Buffer{}); err == nil {
				t.Fatal("invalid saved encryption key replaced")
			}
		})
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY", "invalid")
	directory := t.TempDir()
	if err := configureStartupKeys(directory, &bytes.Buffer{}); err == nil {
		t.Fatal("invalid environment key accepted")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY", "")
	writeTestFile(t, filepath.Join(directory, encryptionFingerprintFile), []byte("previous fingerprint"))
	if err := configureStartupKeys(directory, &bytes.Buffer{}); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatal("lost encryption key silently replaced", err)
	}
}

func TestPersistentKeysConcurrentCreation(t *testing.T) {
	path := filepath.Join(t.TempDir(), encryptionKeyFile)
	const count = 12
	keys, failures := make([]string, count), make([]error, count)
	var group sync.WaitGroup
	for i := range count {
		group.Add(1)
		go func() { defer group.Done(); keys[i], failures[i] = persistentKey(path, true) }()
	}
	group.Wait()
	for i := range count {
		if failures[i] != nil || keys[i] != keys[0] {
			t.Fatalf("concurrent startup diverged: %v", failures[i])
		}
	}
}

func TestPersistentKeyRejectsUnsafeFiles(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix file permissions and symlinks; Windows uses account ACLs")
	}
	directory := t.TempDir()
	path := filepath.Join(directory, encryptionKeyFile)
	writeTestFile(t, path, []byte(strings.Repeat("ab", 32)))
	if err := os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := persistentKey(path, true); err == nil {
		t.Fatal("world-readable secret accepted")
	}
	link := filepath.Join(directory, "linked.secret")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, err := persistentKey(link, true); err == nil {
		t.Fatal("symlink secret accepted")
	}
}

func assertPrivateKeyFiles(t *testing.T, directory string) {
	t.Helper()
	for _, name := range []string{encryptionKeyFile, setupTokenFile, encryptionFingerprintFile} {
		info, err := os.Stat(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		if err := checkKeyFilePermissions(filepath.Join(directory, name), info); err != nil {
			t.Fatalf("private file %s: %v %v", name, info, err)
		}
	}
}

func configureTestStartupKeys(t *testing.T, directory string, output *bytes.Buffer) {
	t.Helper()
	if err := configureStartupKeys(directory, output); err != nil {
		t.Fatal(err)
	}
}

func TestStartupValidatesAndReportsFallback(t *testing.T) {
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("22", 32))
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", "invalid")
	t.Setenv("SETUP_TOKEN", "explicit-token")
	directory := filepath.Join(t.TempDir(), "new-data")
	if err := configureStartupKeys(directory, &bytes.Buffer{}); err == nil {
		t.Fatal("invalid fallback accepted")
	}
	if _, err := os.Stat(directory); !os.IsNotExist(err) {
		t.Fatal("invalid fallback changed persisted state")
	}
	t.Setenv("CONTENT_ENCRYPTION_KEY_PREVIOUS", strings.Repeat("11", 32))
	var output bytes.Buffer
	configureTestStartupKeys(t, directory, &output)
	if !strings.Contains(output.String(), "Dual-key reads enabled") || !strings.Contains(output.String(), "--verify-only") {
		t.Fatal("fallback retirement instructions missing")
	}
	if strings.Contains(output.String(), os.Getenv("CONTENT_ENCRYPTION_KEY_PREVIOUS")) {
		t.Fatal("fallback leaked in log")
	}
}
