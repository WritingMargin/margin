package blog

import "testing"

func TestAdditionalOriginsAllowAliasLoginAndSessionMutations(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_ALLOWED_ORIGINS", " https://WWW.usefused.com:443/, https://writers.example.com:8443 ")
	for _, origin := range []string{"https://usefused.com", "https://www.usefused.com", "https://writers.example.com:8443"} {
		headers := map[string]string{"Origin": origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}
		// Missing credentials reach login validation, proving the origin check passed.
		expectStatus(t, rawMiddlewareRequest(a, "/api/login", "{}", headers), 400)
		headers["Cookie"] = "margin_session=present"
		expectStatus(t, rawMiddlewareRequest(a, "/api/logout", "{}", headers), 200)
		headers["Sec-Fetch-Site"] = "cross-site"
		expectStatus(t, rawMiddlewareRequest(a, "/api/logout", "{}", headers), 403)
	}
	for _, origin := range []string{"https://evil.example", "https://www.usefused.com.evil.example", "http://www.usefused.com", "https://writers.example.com", "https://www.usefused.com:8443", "null"} {
		expectStatus(t, rawMiddlewareRequest(a, "/api/login", "{}", map[string]string{"Origin": origin, "Content-Type": "application/json"}), 403)
	}
	t.Setenv("MARGIN_ALLOWED_ORIGINS", "")
	expectStatus(t, rawMiddlewareRequest(a, "/api/login", "{}", map[string]string{"Origin": "https://www.usefused.com", "Content-Type": "application/json"}), 400)
}

func TestAdditionalOriginsFailClosedForInvalidConfiguration(t *testing.T) {
	for _, value := range []string{"", "*", "https://*.example.com", "www.example.com", "//www.example.com", "null", "https://user:password@www.example.com", "https://www.example.com/blog", "https://www.example.com?", "https://www.example.com#", "https://www.example.com?q=1", "https://www.example.com#fragment", "ftp://www.example.com", "https://www.example.com:0", "https://www.example.com:65536", "https://www.example.com:", "https://www.example.com:invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("MARGIN_ALLOWED_ORIGINS", value)
			if additionalOriginAllowed("https://www.example.com") || additionalOriginAllowed("") || configuredOrigin(value) != "" {
				t.Fatalf("invalid origin accepted: %q", value)
			}
		})
	}
	t.Setenv("MARGIN_ALLOWED_ORIGINS", "*,https://www.example.com/blog,https://safe.example.com")
	if additionalOriginAllowed("https://www.example.com") || !additionalOriginAllowed("https://safe.example.com") {
		t.Fatal("invalid entries must not grant access or discard valid entries")
	}
}

func TestAdditionalOriginsSupportExplicitPortsAndLocalDevelopment(t *testing.T) {
	for _, test := range []struct{ configured, origin string }{
		{"HTTP://LOCALHOST:80/", "http://localhost"},
		{"http://127.0.0.1:5173", "http://127.0.0.1:5173"},
		{"https://[2001:DB8::1]:443", "https://[2001:db8::1]"},
		{"https://writers.example.com:8443", "https://writers.example.com:8443"},
	} {
		t.Setenv("MARGIN_ALLOWED_ORIGINS", test.configured)
		if !additionalOriginAllowed(test.origin) {
			t.Fatalf("configured origin %q did not match %q", test.configured, test.origin)
		}
	}
}
