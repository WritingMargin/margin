package cli

import (
	"bytes"
	"io"
	"os"
	"runtime"
	"strings"
	"testing"
)

func configEnvironment(t *testing.T) func(string) string {
	t.Helper()
	dir := t.TempDir()
	return func(key string) string {
		if key == "MARGIN_CONFIG_DIR" {
			return dir
		}
		return ""
	}
}

func TestSavedCredentialsStayBoundToTheirBlog(t *testing.T) {
	env := configEnvironment(t)
	want := credentials{URL: "https://example.test/blog", Token: "private-cli-key"}
	if err := saveCredentials(env, want); err != nil {
		t.Fatal(err)
	}
	got, err := loadCredentials(env)
	if err != nil || got != want {
		t.Fatal("credential round trip failed")
	}
	assertPrivateCredentials(t, env)
	c, err := connectedClient(map[string]string{}, env)
	if err != nil || c.base != want.URL || c.token != want.Token {
		t.Fatal("saved connection not used")
	}
	for _, address := range []string{"https://attacker.test", "https://example.test/other", "http://example.test/blog"} {
		if _, err = connectedClient(map[string]string{"url": address}, env); err == nil {
			t.Fatal("credential allowed on a different URL")
		}
	}
}

func assertPrivateCredentials(t *testing.T, env func(string) string) {
	t.Helper()
	path, err := credentialPath(env)
	if err != nil {
		t.Fatal(err)
	}
	stat, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && stat.Mode().Perm() != 0600 {
		t.Fatal("credential file is not private")
	}
}

func TestExplicitCredentialOverride(t *testing.T) {
	env := configEnvironment(t)
	if err := saveCredentials(env, credentials{URL: "https://first.test", Token: "old"}); err != nil {
		t.Fatal(err)
	}
	override := func(key string) string {
		switch key {
		case "MARGIN_URL":
			return "https://second.test/blog"
		case "MARGIN_TOKEN":
			return "explicit"
		default:
			return env(key)
		}
	}
	c, err := connectedClient(map[string]string{}, override)
	if err != nil || c.base != "https://second.test/blog" || c.token != "explicit" {
		t.Fatal("explicit override ignored")
	}
}

func TestLoginRequiresSecureRemoteURL(t *testing.T) {
	for _, address := range []string{"http://example.test/blog", "https://user:password@example.test", "https://example.test?token=secret"} {
		if _, err := loginClient(address); err == nil {
			t.Fatal("unsafe login destination accepted")
		}
	}
	for _, address := range []string{"http://localhost:3001/blog", "http://127.0.0.1:3001", "http://[::1]:3001", "https://example.test/blog"} {
		c, err := loginClient(address)
		if err != nil || c.token != "" {
			t.Fatal("valid login destination rejected or sent authorization")
		}
	}
}

func TestCommandHelpWorksWithoutCredentials(t *testing.T) {
	env := func(string) string { t.Fatal("help must not read credentials"); return "" }
	commands := []string{"login", "logout", "whoami", "push", "list", "get", "find", "grep", "create", "update", "publish", "unpublish", "delete", "info", "skills", "deploy"}
	for _, command := range commands {
		for _, args := range [][]string{{command, "--help"}, {command, "-h"}, {"help", command}} {
			var out bytes.Buffer
			if err := run(args, nil, &out, env, "test"); err != nil {
				t.Fatal(args, err)
			}
			if !strings.Contains(out.String(), "margin "+command) {
				t.Fatal("missing command usage", args)
			}
		}
	}
	for _, args := range [][]string{{"--help"}, {"-h"}, {"help"}, {}} {
		if err := run(args, nil, io.Discard, env, "test"); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPushRejectsUnsafeRequestsBeforeConnecting(t *testing.T) {
	env := func(string) string { t.Fatal("invalid push contacted configuration"); return "" }
	for _, args := range [][]string{
		{"push"}, {"push", "id", "--file", "-"}, {"push", "--file", "-", "--title", "Title"},
		{"push", "--file", "-", "--title", "Title", "--slug", "title", "--revision", "old"},
		{"push", "id", "another", "--file", "-"}, {"push", "--text", "body"},
	} {
		if err := run(args, strings.NewReader("body"), io.Discard, env, "test"); err == nil {
			t.Fatal("unsafe push accepted", args)
		}
	}
}
