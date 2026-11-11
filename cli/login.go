package cli

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"time"
)

type loginChallenge struct {
	DeviceCode string `json:"deviceCode"`
	UserCode   string `json:"userCode"`
	ExpiresIn  int    `json:"expiresIn"`
	Interval   int    `json:"interval"`
}

func runConnectedCommand(command string, args []string, flags map[string]string, in io.Reader, out io.Writer, getenv func(string) string) (bool, error) {
	switch command {
	case "login":
		return true, runLogin(args, flags, out, getenv)
	case "logout":
		return true, runLogout(args, flags, out, getenv)
	case "whoami":
		return true, runWhoami(args, flags, out, getenv)
	case "audit":
		return true, runAudit(args, flags, in, out, getenv)
	case "push":
		return true, runPush(args, flags, in, out, getenv)
	}
	return false, nil
}

func commandFlags(args []string, flags map[string]string, allowed ...string) error {
	if len(args) != 0 {
		return errors.New("Unexpected arguments; use --help")
	}
	for key := range flags {
		if !containsFlag(allowed, key) {
			return fmt.Errorf("Unsupported option --%s; use --help", key)
		}
	}
	return nil
}
func containsFlag(allowed []string, key string) bool {
	for _, name := range allowed {
		if name == key {
			return true
		}
	}
	return false
}

func loginClient(address string) (*client, error) {
	c, err := newClient(address, "login")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(c.base)
	ip := net.ParseIP(u.Hostname())
	local := u.Hostname() == "localhost" || (ip != nil && ip.IsLoopback())
	if u.Scheme != "https" && !local {
		return nil, errors.New("Use HTTPS to connect a remote blog")
	}
	c.token = ""
	return c, nil
}

func runLogin(args []string, flags map[string]string, out io.Writer, getenv func(string) string) error {
	if err := commandFlags(args, flags, "url", "no-browser", "json"); err != nil {
		return err
	}
	c, err := loginClient(selectedURL(flags, getenv))
	if err != nil {
		return err
	}
	key, challenge, err := beginLogin(c)
	if err != nil {
		return err
	}
	address := c.base + "/admin/settings?cliCode=" + url.QueryEscape(challenge.UserCode)
	if err = showLogin(out, flags, address, challenge.UserCode); err != nil {
		return err
	}
	if flags["no-browser"] != "true" {
		_ = openLoginBrowser(address)
	}
	if err = awaitLogin(c, challenge); err != nil {
		return err
	}
	if err = saveCredentials(getenv, credentials{URL: c.base, Token: key}); err != nil {
		return err
	}
	return connectionOutput(out, flags, c.base, "Connected")
}

func beginLogin(c *client) (string, loginChallenge, error) {
	var challenge loginChallenge
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", challenge, err
	}
	key := "margin_" + base64.RawURLEncoding.EncodeToString(secret)
	err := c.request("POST", "/api/cli/login", map[string]string{"tokenHash": credentialHash(key)}, &challenge)
	if err == nil && (challenge.DeviceCode == "" || challenge.UserCode == "") {
		err = errors.New("Server returned an invalid login request")
	}
	return key, challenge, err
}

func showLogin(out io.Writer, flags map[string]string, address, code string) error {
	if flags["json"] == "true" {
		return output(out, map[string]string{"status": "pending", "verificationUrl": address, "code": code})
	}
	_, err := fmt.Fprintf(out, "Open %s\n\nCheck this code in your signed-in admin: %s\nApprove the connection. Waiting up to 10 minutes…\n", address, code)
	return err
}

func awaitLogin(c *client, challenge loginChallenge) error {
	if challenge.ExpiresIn < 1 || challenge.ExpiresIn > 600 {
		return errors.New("Invalid login expiry")
	}
	interval := time.Duration(challenge.Interval) * time.Second
	if interval < time.Second || interval > 10*time.Second {
		interval = 2 * time.Second
	}
	deadline := time.Now().Add(time.Duration(challenge.ExpiresIn) * time.Second)
	for time.Now().Before(deadline) {
		var state struct {
			Approved bool `json:"approved"`
		}
		if err := c.request("POST", "/api/cli/poll", map[string]string{"deviceCode": challenge.DeviceCode}, &state); err != nil {
			return err
		}
		if state.Approved {
			return nil
		}
		time.Sleep(interval)
	}
	return errors.New("Login expired. Run margin login again")
}

func openLoginBrowser(address string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", address) // #nosec G204 -- Fixed OS browser launcher with a single HTTP(S) URL argument validated by loginClient; no shell interpretation.
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", address) // #nosec G204 -- Fixed OS browser launcher with a single HTTP(S) URL argument validated by loginClient; no shell interpretation.
	default:
		command = exec.Command("xdg-open", address) // #nosec G204 -- Fixed OS browser launcher with a single HTTP(S) URL argument validated by loginClient; no shell interpretation.
	}
	return command.Run()
}

func connectionOutput(out io.Writer, flags map[string]string, address, status string) error {
	if flags["json"] == "true" {
		return output(out, map[string]string{"status": status, "url": address})
	}
	_, err := fmt.Fprintf(out, "%s: %s\n", status, address)
	return err
}

func runWhoami(args []string, flags map[string]string, out io.Writer, getenv func(string) string) error {
	if err := commandFlags(args, flags, "url", "json"); err != nil {
		return err
	}
	c, err := connectedClient(flags, getenv)
	if err != nil {
		return err
	}
	var state struct {
		Authenticated bool `json:"authenticated"`
	}
	if err = c.request("GET", "/api/session", nil, &state); err != nil {
		return err
	}
	if !state.Authenticated {
		return errors.New("CLI access was revoked or expired. Run margin login again")
	}
	return connectionOutput(out, flags, c.base, "Connected as owner")
}

func runLogout(args []string, flags map[string]string, out io.Writer, getenv func(string) string) error {
	if err := commandFlags(args, flags, "json"); err != nil {
		return err
	}
	saved, err := loadCredentials(getenv)
	if err != nil {
		return err
	}
	if saved.Token == "" {
		return errors.New("No saved CLI connection. Environment tokens are managed in Settings")
	}
	c, err := newClient(saved.URL, saved.Token)
	if err != nil {
		return err
	}
	var result any
	err = c.request("DELETE", "/api/tokens/"+credentialHash(saved.Token), nil, &result)
	var failure *cliError
	if err != nil && !(errors.As(err, &failure) && failure.Status == 401) {
		return err
	}
	path, err := credentialPath(getenv)
	if err != nil {
		return err
	}
	if err = os.Remove(path); err != nil {
		return err
	}
	return connectionOutput(out, flags, saved.URL, "Disconnected")
}
