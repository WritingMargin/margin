package blog

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"golang.org/x/net/publicsuffix"
)

func TestCookieDomainValidation(t *testing.T) {
	for _, tc := range []struct {
		domain, public string
		valid          bool
	}{
		{"", "http://localhost:3001", true},
		{".", "https://usefused.com", false},
		{"host-only", "https://usefused.com", true},
		{"usefused.com", "https://usefused.com/blog", true},
		{" .UseFused.com ", "https://www.usefused.com/blog", true},
		{"https://usefused.com", "https://usefused.com", false},
		{"usefused.com/blog", "https://usefused.com", false},
		{"usefused.com:443", "https://usefused.com", false},
		{"*.usefused.com", "https://usefused.com", false},
		{"com", "https://usefused.com", false},
		{"co.uk", "https://example.co.uk", false},
		{"github.io", "https://example.github.io", false},
		{"localhost", "https://localhost", false},
		{"127.0.0.1", "https://127.0.0.1", false},
		{"other.com", "https://usefused.com", false},
		{"usefused.com", "https://evilusefused.com", false},
		{"www.usefused.com", "https://usefused.com", false},
		{"usefused.com", "", false},
		{"usefused.com", "http://usefused.com", false},
		{"usefused.com", "https://user@usefused.com", false},
	} {
		t.Run(tc.domain+"/"+tc.public, func(t *testing.T) {
			t.Setenv("MARGIN_COOKIE_DOMAIN", tc.domain)
			t.Setenv("PUBLIC_URL", tc.public)
			if err := ValidateCookieDomain(); (err == nil) != tc.valid {
				t.Fatalf("valid=%v, error=%v", tc.valid, err)
			}
		})
	}
}

func TestExplicitHostOnlySessionCookie(t *testing.T) {
	t.Setenv("MARGIN_COOKIE_DOMAIN", "host-only")
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("MARGIN_ENV", "production")
	w := httptest.NewRecorder()
	setSessionCookie(w, "margin_session", "test", 3600, time.Now().Add(time.Hour))
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("unexpected cookies", cookies)
	}
	c := cookies[0]
	assertCookieProtections(t, c)
	if c.Name != "margin_session" || c.Domain != "" || c.Path != "/blog/" {
		t.Fatalf("unexpected cookie: %+v", c)
	}
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	apex, _ := url.Parse("https://usefused.com/blog/")
	alias, _ := url.Parse("https://www.usefused.com/blog/")
	jar.SetCookies(apex, cookies)
	if len(jar.Cookies(alias)) != 0 {
		t.Fatal("default cookies must not be shared")
	}
}

func sharedCookieRequest(jar http.CookieJar, method, host, path, origin string) *http.Request {
	r := httptest.NewRequest(method, "https://"+host+"/blog"+path, nil)
	for _, c := range jar.Cookies(r.URL) {
		r.AddCookie(c)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	return r
}

func TestSharedOwnerAndReaderSessions(t *testing.T) {
	for _, reader := range []bool{false, true} {
		t.Run(map[bool]string{false: "owner", true: "reader"}[reader], func(t *testing.T) {
			testSharedSession(t, reader)
		})
	}
}

func testSharedSession(t *testing.T, reader bool) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("MARGIN_COOKIE_DOMAIN", "")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("MARGIN_ENV", "production")
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_ALLOWED_ORIGINS", "")
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	r := sharedCookieRequest(jar, "POST", "usefused.com", "/api/login", "https://usefused.com")
	w := httptest.NewRecorder()
	name, logout := "margin_session", "/api/logout"
	if reader {
		name, logout = "margin_reader", "/api/public/reader/logout"
		a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES($1,'subscribed',$2)", "reader@example.com", hash(newsletterToken()))
		a.startReaderSession(w, r, "reader@example.com")
	} else {
		a.startSession(w, r)
	}
	cookies := w.Result().Cookies()
	assertSharedCookie(t, cookies, name)
	jar.SetCookies(r.URL, cookies)
	// A leftover host-only cookie on www must not shadow the new shared session.
	alias, _ := url.Parse("https://www.usefused.com/blog/")
	jar.SetCookies(alias, []*http.Cookie{{Name: name, Value: "old-session", Path: "/blog/", Secure: true}})
	assertSessionHosts(t, a, jar, reader, true)
	for _, origin := range []string{"", "https://attacker.example"} {
		w = httptest.NewRecorder()
		a.ServeHTTP(w, sharedCookieRequest(jar, "POST", "www.usefused.com", logout, origin))
		expectStatus(t, w, http.StatusForbidden)
	}
	w = httptest.NewRecorder()
	a.ServeHTTP(w, sharedCookieRequest(jar, "POST", "www.usefused.com", logout, "https://www.usefused.com"))
	expectStatus(t, w, http.StatusOK)
	// Revocation must work even before the client processes the deletion cookie.
	assertSessionHosts(t, a, jar, reader, false)
	jar.SetCookies(alias, w.Result().Cookies())
	apex, _ := url.Parse("https://usefused.com/blog/")
	if len(jar.Cookies(apex)) != 0 || len(jar.Cookies(alias)) != 0 {
		t.Fatal("logout left session cookies behind")
	}
}

func assertSharedCookie(t *testing.T, cookies []*http.Cookie, name string) {
	t.Helper()
	if len(cookies) != 2 {
		t.Fatal("expected legacy deletion and shared cookie", cookies)
	}
	if cookies[0].Name != name || cookies[0].Domain != "" || cookies[0].MaxAge != -1 {
		t.Fatal("legacy cookie not cleared")
	}
	c := cookies[1]
	assertCookieProtections(t, c)
	if c.Name != name+"_shared" || c.Domain != "usefused.com" || c.Path != "/blog/" {
		t.Fatalf("unexpected shared cookie: %+v", c)
	}
}

func assertSessionHosts(t *testing.T, a *App, jar http.CookieJar, reader, want bool) {
	t.Helper()
	for _, host := range []string{"usefused.com", "www.usefused.com"} {
		r := sharedCookieRequest(jar, "GET", host, "/api/posts", "")
		authenticated := a.authenticated(r)
		if reader {
			authenticated = a.readerEmail(r) == "reader@example.com"
		}
		if authenticated != want {
			t.Fatalf("%s authenticated=%v, want %v", host, authenticated, want)
		}
	}
}

func assertCookieProtections(t *testing.T, c *http.Cookie) {
	t.Helper()
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("cookie protections missing: %+v", c)
	}
}

func TestAutomaticCookieDomains(t *testing.T) {
	t.Setenv("MARGIN_COOKIE_DOMAIN", "")
	for _, tc := range []struct{ public, domain, alias string }{
		{"https://usefused.com/blog", "usefused.com", "https://www.usefused.com"},
		{"https://www.usefused.com/blog", "usefused.com", "https://usefused.com"},
		{"https://WWW.Example.co.uk/blog", "example.co.uk", "https://example.co.uk"},
		{"https://blog.example.com:8443/blog", "blog.example.com", "https://www.blog.example.com:8443"},
		{"https://tenant.github.io", "tenant.github.io", "https://www.tenant.github.io"},
		{"https://github.io", "", ""},
		{"https://www.co.uk", "", ""},
		{"https://localhost:3001", "", ""},
		{"https://127.0.0.1", "", ""},
		{"https://[::1]", "", ""},
		{"http://usefused.com", "", ""},
		{"https://user@usefused.com", "", ""},
		{"", "", ""},
	} {
		t.Run(tc.public, func(t *testing.T) {
			t.Setenv("PUBLIC_URL", tc.public)
			if got := cookieDomain(); got != tc.domain {
				t.Fatalf("domain=%q, want %q", got, tc.domain)
			}
			if publicAliasOriginAllowed(tc.alias) != (tc.alias != "") {
				t.Fatal("incorrect alias permission")
			}
		})
	}
}

func TestAutomaticAliasRejectsOtherOrigins(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	for _, origin := range []string{"https://evil.usefused.com", "https://www.usefused.com.evil.example", "http://www.usefused.com", "https://www.usefused.com:8443", "null"} {
		expectStatus(t, rawMiddlewareRequest(a, "/api/login", "{}", map[string]string{"Origin": origin}), 403)
	}
	t.Setenv("MARGIN_COOKIE_DOMAIN", "host-only")
	if publicAliasOriginAllowed("https://www.usefused.com") {
		t.Fatal("host-only mode implicitly allowed alias")
	}
}
