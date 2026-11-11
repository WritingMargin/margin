package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func generateConfig(t *testing.T, args ...string) (string, error) {
	t.Helper()
	var out bytes.Buffer
	err := run(append([]string{"deploy"}, args...), strings.NewReader(""), &out, func(string) string { t.Fatal("deployment generation read API credentials"); return "" }, "test")
	return out.String(), err
}
func requireConfigText(t *testing.T, config string, wanted ...string) {
	t.Helper()
	for _, text := range wanted {
		if !strings.Contains(config, text) {
			t.Errorf("configuration missing %q", text)
		}
	}
}
func TestDeployHTTPSDefaults(t *testing.T) {
	for _, server := range []string{"nginx", "apache"} {
		t.Run(server, func(t *testing.T) {
			out, err := generateConfig(t, server, "--domain", "Blog.Example.com", "--json")
			if err != nil {
				t.Fatal(err)
			}
			var d deployment
			if err = json.Unmarshal([]byte(out), &d); err != nil {
				t.Fatal(err)
			}
			if !d.TLS || d.Domain != "blog.example.com" || d.Upstream != "http://127.0.0.1:3001" {
				t.Fatalf("unexpected defaults: %+v", d)
			}
			requireConfigText(t, d.Config, "TRUST_PROXY=1", "PUBLIC_URL=https://blog.example.com", "/etc/letsencrypt/live/blog.example.com/fullchain.pem", "/etc/letsencrypt/live/blog.example.com/privkey.pem", "308", "300")
		})
	}
}
func TestDeployHTTPAndIPv6(t *testing.T) {
	for _, server := range []string{"nginx", "apache"} {
		out, err := generateConfig(t, server, "--domain", "localhost", "--upstream", "http://[::1]:4000/", "--http-only")
		if err != nil {
			t.Fatal(err)
		}
		requireConfigText(t, out, "http://[::1]:4000", "PUBLIC_URL=http://localhost", "HTTP-only")
		if strings.Contains(out, "fullchain.pem") || strings.Contains(out, "TLSv1.3") {
			t.Fatal("HTTP config contains TLS settings")
		}
	}
}
func TestDeployRejectsInjection(t *testing.T) {
	cases := [][]string{
		{"--domain", "example.com; return 200;"}, {"--domain", "example.com\nInclude /tmp/injected"}, {"--domain", "https://example.com"}, {"--domain", "example.com:443"}, {"--domain", "*.example.com"},
		{"--upstream", "http://127.0.0.1:3001;"}, {"--upstream", "http://user:pass@localhost:3001"}, {"--upstream", "http://localhost:3001/api"}, {"--upstream", "http://localhost:3001?x=1"}, {"--upstream", "http://localhost:3001#x"}, {"--upstream", "http://localhost:0"}, {"--upstream", "http://localhost:65536"}, {"--upstream", "http://localhost"}, {"--upstream", "https://localhost:3001"},
	}
	for _, flags := range cases {
		args := []string{"nginx"}
		if flags[0] != "--domain" {
			args = append(args, "--domain", "example.com")
		}
		out, err := generateConfig(t, append(args, flags...)...)
		if err == nil || out != "" {
			t.Errorf("accepted unsafe options %q", flags)
		}
	}
}
func TestDeployRejectsInvalidOptions(t *testing.T) {
	for _, args := range [][]string{
		{"caddy", "--domain", "example.com"}, {"nginx"}, {"nginx", "extra", "--domain", "example.com"}, {"nginx", "--domain", "example.com", "--publish"}, {"nginx", "--domain", "example.com", "--output="},
		{"nginx", "--domain", "example.com", "--tls-cert", "/a.pem"}, {"apache", "--domain", "example.com", "--tls-cert", "/a.pem", "--tls-key", "relative.pem"}, {"apache", "--domain", "example.com", "--tls-cert", "/a\n.pem", "--tls-key", "/b.pem"}, {"apache", "--domain", "example.com", "--tls-cert", "/a.pem", "--tls-key", "/$secret"}, {"nginx", "--domain", "example.com", "--http-only", "--tls-key", "/b.pem"},
	} {
		if _, err := generateConfig(t, args...); err == nil {
			t.Errorf("accepted invalid options %q", args)
		}
	}
}
func TestDeployCustomCertificatesAndSafeOutput(t *testing.T) {
	file := filepath.Join(t.TempDir(), "site.conf")
	args := []string{"apache", "--domain", "example.com", "--tls-cert", "/etc/ssl/example-chain.pem", "--tls-key", "/etc/ssl/example-key.pem", "--output", file, "--json"}
	out, err := generateConfig(t, args...)
	if err != nil {
		t.Fatal(err)
	}
	var d deployment
	if err = json.Unmarshal([]byte(out), &d); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if d.Path != file || string(content) != d.Config {
		t.Fatal("file and JSON differ")
	}
	requireConfigText(t, d.Config, "/etc/ssl/example-chain.pem", "/etc/ssl/example-key.pem")
	if _, err = generateConfig(t, args...); err == nil {
		t.Fatal("overwrote existing config")
	}
	after, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(content, after) {
		t.Fatal("existing config changed")
	}
}
func TestDeployHelpAndStdout(t *testing.T) {
	text, err := generateConfig(t, "--help")
	if err != nil {
		t.Fatal(err)
	}
	requireConfigText(t, text, "--domain", "--upstream", "--http-only")
	text, err = generateConfig(t, "nginx", "--domain", "example.com", "--output", "-")
	if err != nil {
		t.Fatal(err)
	}
	requireConfigText(t, text, "server {", "proxy_pass http://127.0.0.1:3001;")
	if err = run([]string{"list", "--domain", "example.com"}, strings.NewReader(""), io.Discard, func(string) string { return "" }, "test"); err == nil {
		t.Fatal("deploy option accepted for authoring")
	}
}

func TestDeployMountedNginx(t *testing.T) {
	out, err := generateConfig(t, "nginx", "--domain", "usefused.com", "--base-path", "/blog")
	if err != nil {
		t.Fatal(err)
	}
	requireConfigText(t, out, "location = /blog", "location ^~ /blog/", "proxy_pass http://127.0.0.1:3001;", "MARGIN_BASE_PATH=/blog", "PUBLIC_URL=https://usefused.com/blog")
	if strings.Contains(out, "server {") || strings.Contains(out, "listen 443") {
		t.Fatal("snippet would replace the existing host")
	}
	for _, mount := range []string{"/", "/blog/", "//blog", "/../blog", "/blog;return", "https://usefused.com/blog"} {
		if _, err := generateConfig(t, "nginx", "--domain", "usefused.com", "--base-path", mount); err == nil {
			t.Fatalf("accepted invalid mount %q", mount)
		}
	}
}
