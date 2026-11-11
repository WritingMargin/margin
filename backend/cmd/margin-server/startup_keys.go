package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"margin/backend/internal/contentcrypto"
	"os"
	"path/filepath"
	"strings"
)

const encryptionKeyFile = "content-encryption-key.secret"
const setupTokenFile = "setup-token.secret" // #nosec G101 -- This constant is a filename, not a token or credential.
const encryptionFingerprintFile = "encryption-key.sha256"

func configureStartupKeys(directory string, output io.Writer) error {
	// Validate explicit input before creating or changing any persisted state.
	for _, name := range []string{"CONTENT_ENCRYPTION_KEY", "CONTENT_ENCRYPTION_KEY_PREVIOUS"} {
		if key := os.Getenv(name); key != "" {
			if _, err := contentcrypto.New(key); err != nil {
				return fmt.Errorf("%s must be 32 bytes encoded as 64 hexadecimal characters", name)
			}
		}
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return fmt.Errorf("create key directory: %w", err)
	}
	if err := configureEncryptionKey(directory, output); err != nil {
		return err
	}
	return configureSetupToken(directory, output)
}

func configureEncryptionKey(directory string, output io.Writer) error {
	path := filepath.Join(directory, encryptionKeyFile)
	fingerprintPath := filepath.Join(directory, encryptionFingerprintFile)
	previous, err := os.ReadFile(fingerprintPath) // #nosec G304 -- Fixed fingerprint filename under the operator-selected data directory.
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read encryption key fingerprint: %w", err)
	}
	key := os.Getenv("CONTENT_ENCRYPTION_KEY")
	if key == "" {
		key, err = persistentKey(path, len(previous) == 0)
		if err != nil {
			return err
		}
		fmt.Fprintf(output, "Using persisted content encryption key at %s. Back up this file with your data. \n", path)
	} else {
		fmt.Fprintln(output, "Using CONTENT_ENCRYPTION_KEY from the environment; it overrides saved defaults.")
	}
	if _, err := contentcrypto.New(key); err != nil {
		return fmt.Errorf("content encryption key at %s: %w", path, err)
	}
	hash := sha256.Sum256([]byte(strings.ToLower(key)))
	fingerprint := hex.EncodeToString(hash[:]) + "\n"
	reportEncryptionKeys(output, len(previous) != 0 && string(previous) != fingerprint)
	if err := writePrivateFile(fingerprintPath, []byte(fingerprint), false); err != nil {
		return err
	}
	return os.Setenv("CONTENT_ENCRYPTION_KEY", key)
}

func configureSetupToken(directory string, output io.Writer) error {
	if os.Getenv("SETUP_TOKEN") != "" {
		return nil
	}
	path := filepath.Join(directory, setupTokenFile)
	token, err := persistentKey(path, true)
	if err != nil {
		return err
	}
	fmt.Fprintf(output, "Using persisted SETUP_TOKEN at %s. Read this private file to create the first owner.\n", path)
	return os.Setenv("SETUP_TOKEN", token)
}

func persistentKey(path string, allowCreate bool) (string, error) {
	key, err := readPrivateKey(path)
	if !errors.Is(err, os.ErrNotExist) {
		return key, err
	}
	if !allowCreate {
		return "", fmt.Errorf("saved encryption key is missing at %s; restore it or set CONTENT_ENCRYPTION_KEY to the previous key to avoid losing access to existing data", path)
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	if err := writePrivateFile(path, []byte(hex.EncodeToString(bytes)+"\n"), true); err != nil {
		return "", err
	}
	return readPrivateKey(path)
}

func readPrivateKey(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("key file %s must be a regular private file (chmod 600)", path)
	}
	if err := checkKeyFilePermissions(path, info); err != nil {
		return "", err
	}
	data, err := os.ReadFile(path) // #nosec G304 -- Startup-only key path under the operator-selected data directory; regular-file and private-permission checks precede reading.
	if err != nil {
		return "", err
	}
	key := strings.TrimSpace(string(data))
	if _, err := contentcrypto.New(key); err != nil {
		return "", fmt.Errorf("invalid saved key at %s: %w", path, err)
	}
	return key, nil
}

// Write and sync before exposing the file. Link installs generated keys without
// replacing an existing key, even when two processes start for the first time.
func writePrivateFile(path string, data []byte, exclusive bool) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".margin-key-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err = syncPrivateFile(file, data); err != nil {
		return err
	}
	if exclusive {
		err = os.Link(file.Name(), path)
		if errors.Is(err, os.ErrExist) {
			return nil
		}
	} else {
		err = os.Rename(file.Name(), path)
	}
	if err != nil {
		return err
	}
	return syncKeyDirectory(filepath.Dir(path))
}

func syncPrivateFile(file *os.File, data []byte) error {
	defer file.Close()
	if err := secureGeneratedFile(file.Name()); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return file.Close()
}

func reportEncryptionKeys(output io.Writer, changed bool) {
	if changed {
		fmt.Fprintln(output, "WARNING: CONTENT_ENCRYPTION_KEY has changed since the previous startup.")
	}
	if os.Getenv("CONTENT_ENCRYPTION_KEY_PREVIOUS") != "" {
		fmt.Fprintln(output, "Dual-key reads enabled. New writes use CONTENT_ENCRYPTION_KEY. Keep the fallback key until margin reencrypt and margin reencrypt --verify-only succeed with all instances writing the new key.")
	} else {
		fmt.Fprintln(output, "WARNING: changing or losing the encryption key without re-encryption loses access to previous encrypted content and saved credentials. Keep the old key; configure CONTENT_ENCRYPTION_KEY_PREVIOUS and run margin reencrypt before retiring it.")
	}
}
