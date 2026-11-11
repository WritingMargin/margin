package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type credentials struct {
	URL   string `json:"url"`
	Token string `json:"token"`
}

func credentialPath(getenv func(string) string) (string, error) {
	dir := getenv("MARGIN_CONFIG_DIR")
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(base, "margin")
	}
	return filepath.Join(dir, "credentials.json"), nil
}

func loadCredentials(getenv func(string) string) (credentials, error) {
	var saved credentials
	path, err := credentialPath(getenv)
	if err != nil {
		return saved, err
	}
	data, err := os.ReadFile(path) // #nosec G304 -- Fixed credentials filename in the local user configuration directory, optionally overridden by that user.
	if errors.Is(err, os.ErrNotExist) {
		return saved, nil
	}
	if err != nil {
		return saved, err
	}
	if json.Unmarshal(data, &saved) != nil {
		return saved, errors.New("Cannot read saved CLI connection; run margin login again")
	}
	return saved, nil
}

func saveCredentials(getenv func(string) string, saved credentials) error {
	path, err := credentialPath(getenv)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".credentials-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err = json.NewEncoder(f).Encode(saved); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func selectedURL(flags map[string]string, getenv func(string) string) string {
	if flags["url"] != "" {
		return flags["url"]
	}
	return getenv("MARGIN_URL")
}

func connectedClient(flags map[string]string, getenv func(string) string) (*client, error) {
	address := selectedURL(flags, getenv)
	if key := getenv("MARGIN_TOKEN"); key != "" {
		return newClient(address, key)
	}
	saved, err := loadCredentials(getenv)
	if err != nil {
		return nil, err
	}
	if address == "" {
		address = saved.URL
	}
	if saved.URL != "" && strings.TrimRight(address, "/") != saved.URL {
		return nil, errors.New("No saved login for this URL. Run margin login --url <blog-url>")
	}
	return newClient(address, saved.Token)
}

func credentialHash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}
