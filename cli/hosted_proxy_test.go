package cli

import (
	"strings"
	"testing"
)

func TestHostedProxyRootHTTPSAndForwarding(t *testing.T) {
	config, err := GenerateHostedProxy("https://Blog.Example.com/", "https://Assigned.Hosting.Example/")
	if err != nil {
		t.Fatal(err)
	}
	requireConfigText(t, config,
		"server_name blog.example.com;", "listen 443 ssl;", "location / {",
		"return 308 https://blog.example.com$request_uri;",
		`ssl_certificate "/etc/letsencrypt/live/blog.example.com/fullchain.pem";`,
		"proxy_set_header Host assigned.hosting.example;",
		"proxy_ssl_server_name on;", "proxy_ssl_name assigned.hosting.example;",
		"proxy_ssl_verify on;", "proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;",
		"proxy_set_header X-Forwarded-Host blog.example.com;",
		"proxy_set_header X-Forwarded-Proto https;", "proxy_set_header X-Forwarded-Port 443;",
		"proxy_set_header X-Forwarded-For $remote_addr;", "proxy_set_header X-Real-IP $remote_addr;",
		`proxy_set_header Forwarded "";`, "proxy_redirect off;", "proxy_cookie_domain off;",
		"location = /.well-known/oauth-authorization-server {",
		"location = /.well-known/oauth-protected-resource/mcp {",
		"location = /.well-known/oauth-protected-resource/api {",
		"First activate https://blog.example.com", "YOUR Nginx server")
	assertHostedProxyOrigins(t, config, 4)
}

func TestHostedProxyMountedPathPreserved(t *testing.T) {
	for _, mount := range []string{"/blog", "/journal/notes", "/admin"} {
		t.Run(mount, func(t *testing.T) {
			config, err := GenerateHostedProxy("https://example.com"+mount+"/", "https://assigned.hosting.example")
			if err != nil {
				t.Fatal(err)
			}
			requireConfigText(t, config,
				"location = "+mount+" {", "location ^~ "+mount+"/ {",
				"location = /.well-known/oauth-authorization-server"+mount+" {",
				"location = /.well-known/oauth-protected-resource"+mount+"/mcp {",
				"location = /.well-known/oauth-protected-resource"+mount+"/api {",
				"Include INSIDE the existing HTTPS server block", "First activate https://example.com"+mount)
			if strings.Contains(config, "server {") || strings.Contains(config, "location / {") || strings.Contains(config, "rewrite ") {
				t.Fatal("mounted snippet changed unrelated site routes or rewrote the mount")
			}
			assertHostedProxyOrigins(t, config, 5)
		})
	}
}

func assertHostedProxyOrigins(t *testing.T, config string, expected int) {
	t.Helper()
	count := 0
	for _, line := range strings.Split(config, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "proxy_pass ") {
			count++
			if line != "proxy_pass https://assigned.hosting.example;" {
				t.Fatalf("upstream must preserve the complete request URI: %s", line)
			}
		}
	}
	if count != expected {
		t.Fatalf("expected %d hosted proxy locations, found %d", expected, count)
	}
}

func TestHostedProxyRejectsUnsafeOrigins(t *testing.T) {
	for _, address := range []string{
		"http://example.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://db.internal",
		"https://app.localhost", "https://app.local", "https://example.com:443", "https://example.com:8443",
		"https://user:secret@example.com", "https://example.com?", "https://example.com?x=1", "https://example.com#",
		"https://example.com\nproxy_ssl_verify off;", "https://example.com;$request_uri", "https://$host",
	} {
		t.Run(address, func(t *testing.T) {
			if config, err := GenerateHostedProxy(address, "https://assigned.hosting.example"); err == nil || config != "" {
				t.Fatal("accepted unsafe public URL")
			}
			if config, err := GenerateHostedProxy("https://blog.example.com", address); err == nil || config != "" {
				t.Fatal("accepted unsafe upstream URL")
			}
		})
	}
}

func TestHostedProxyRejectsUnsafePathsAndUpstreamMount(t *testing.T) {
	for _, path := range []string{"/../blog", "/blog/../", "/.well-known", "/blog//more", "/%62log", "/blog;return", "/blog/$request_uri", "/" + strings.Repeat("a", 201)} {
		if config, err := GenerateHostedProxy("https://blog.example.com"+path, "https://assigned.hosting.example"); err == nil || config != "" {
			t.Errorf("accepted unsafe mount %q", path)
		}
	}
	if config, err := GenerateHostedProxy("https://blog.example.com/blog", "https://assigned.hosting.example/blog"); err == nil || config != "" {
		t.Fatal("accepted upstream with a path")
	}
	if config, err := GenerateHostedProxy("https://assigned.hosting.example/blog", "https://assigned.hosting.example"); err == nil || config != "" {
		t.Fatal("accepted proxy loop to the same hostname")
	}
}

func TestHostedProxyDoesNotRelaxSelfHostedValidation(t *testing.T) {
	if config, err := GenerateDeployment("nginx", "https://example.com", "https://assigned.hosting.example"); err == nil || config != "" {
		t.Fatal("self-hosted upstream validation was relaxed")
	}
}
