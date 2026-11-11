package cli

import (
	"strings"
	"testing"
)

func TestGenerateDeploymentFromPublicURL(t *testing.T) {
	for _, server := range []string{"nginx", "apache"} {
		for _, address := range []string{"https://UseFused.com/blog", "https://usefused.com/blog/", "https://blog.example.com", "http://localhost:8080/blog"} {
			config, err := GenerateDeployment(server, address, "http://127.0.0.1:30010")
			if err != nil {
				t.Fatal(err)
			}
			requireConfigText(t, config, "http://127.0.0.1:30010", "TRUST_PROXY=1")
			if strings.HasSuffix(strings.TrimSuffix(address, "/"), "/blog") {
				requireConfigText(t, config, "MARGIN_BASE_PATH=/blog")
				if strings.Contains(config, "<VirtualHost") || strings.Contains(config, "server {") {
					t.Fatal("path should only generate an existing-site snippet")
				}
			}
			if strings.Contains(address, "8080") {
				requireConfigText(t, config, "PUBLIC_URL=http://localhost:8080/blog", "localhost:8080", "8080")
			}
		}
	}
}

func TestDeploymentUIAndCLIParity(t *testing.T) {
	for _, server := range []string{"nginx", "apache"} {
		cliConfig, err := generateConfig(t, server, "--domain", "blog.example.com")
		if err != nil {
			t.Fatal(err)
		}
		uiConfig, err := GenerateDeployment(server, "https://blog.example.com", "http://127.0.0.1:3001")
		if err != nil || uiConfig != cliConfig {
			t.Fatal("UI and CLI must use the same configuration", err)
		}
	}
}

func TestGenerateDeploymentRejectsUnsafeURLs(t *testing.T) {
	for _, address := range []string{"ftp://example.com", "https://user:secret@example.com", "https://example.com?", "https://example.com#", "https://example.com/../blog", "https://example.com/blog;return", "https://example.com/%62log", "https://example.com:0", "https://example.com:65536", "https://example.com:", "https://example.com\nInclude /etc/passwd"} {
		config, err := GenerateDeployment("nginx", address, "http://127.0.0.1:3001")
		if err == nil || config != "" {
			t.Errorf("accepted %q", address)
		}
	}
}

func TestApacheMountedConfig(t *testing.T) {
	config, err := generateConfig(t, "apache", "--domain", "usefused.com", "--base-path", "/blog", "--upstream", "http://127.0.0.1:30010")
	if err != nil {
		t.Fatal(err)
	}
	requireConfigText(t, config, `ProxyPassMatch "^(/blog(?:/.*)?)$" "http://127.0.0.1:30010$1"`, `ProxyPassReverse "/blog" "http://127.0.0.1:30010/blog"`, `<LocationMatch "^(?:/blog(?:/|$)|/\.well-known/`)
}
