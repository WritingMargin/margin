package blog

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/publicsuffix"
)

func TestCommentFlowCookieScopes(t *testing.T) {
	for _, name := range []string{"margin_comment_flow", "margin_comment_email"} {
		for _, domain := range []string{"", "host-only"} {
			t.Run(name+"/"+domain, func(t *testing.T) { testCommentFlowCookieScope(t, name, domain) })
		}
	}
}

func testCommentFlowCookieScope(t *testing.T, name, domain string) {
	t.Helper()
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("MARGIN_COOKIE_DOMAIN", domain)
	t.Setenv("MARGIN_ENV", "production")
	w := httptest.NewRecorder()
	commentFlowCookie(w, name, "browser-state", 600)
	cookie := w.Result().Cookies()[0]
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/blog/" || cookie.MaxAge != 600 {
		t.Fatalf("incorrect flow cookie protections: %+v", cookie)
	}
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	start, _ := url.Parse("https://www.usefused.com/blog/")
	jar.SetCookies(start, w.Result().Cookies())
	callback, _ := url.Parse("https://usefused.com/blog/reader/auth/callback")
	if shared := len(jar.Cookies(callback)) == 1; shared != (domain == "") {
		t.Fatalf("incorrect alias sharing for %q", domain)
	}
	for _, address := range []string{"https://usefused.com/reader/auth/callback", "https://unrelated.example/blog/reader/auth/callback", "http://www.usefused.com/blog/"} {
		u, _ := url.Parse(address)
		if len(jar.Cookies(u)) != 0 {
			t.Fatalf("flow cookie leaked outside its scope: %s", address)
		}
	}
}

func commentAliasRequest(a *App, jar http.CookieJar, method, address string, input Row) *httptest.ResponseRecorder {
	data := ""
	if input != nil {
		data = encode(input)
	}
	r := httptest.NewRequest(method, address, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	if method == "POST" {
		r.Header.Set("Origin", "https://"+r.URL.Host)
	}
	for _, cookie := range jar.Cookies(r.URL) {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	jar.SetCookies(r.URL, w.Result().Cookies())
	return w
}

func TestCommentSignInReturnsAcrossBlogAliases(t *testing.T) {
	for _, method := range []string{"google", "email"} {
		for _, host := range []string{"usefused.com", "www.usefused.com"} {
			t.Run(method+"/"+host, func(t *testing.T) { testCommentAliasSignIn(t, method, host) })
		}
	}
}

func testCommentAliasSignIn(t *testing.T, method, host string) {
	t.Helper()
	a, _, mail := commentMailFixture(t)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("MARGIN_ENV", "production")
	transport := a.Client.Transport
	var state string
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/reader-auth/start":
			var input Row
			must(json.NewDecoder(r.Body).Decode(&input))
			state = input.str("state")
			return fixtureResponse(Row{"url": "https://accounts.google.com/o/oauth2/v2/auth"}), nil
		case "/v1/reader-auth/exchange":
			return fixtureResponse(Row{"identity": strings.Repeat("a", 64), "provider": "google", "name": "Reader", "email": "reader@example.test"}), nil
		default:
			return transport.RoundTrip(r)
		}
	})
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	base := "https://" + host + "/blog"
	input := Row{"returnTo": "/blog/post/room", "provider": "google"}
	endpoint, status := "/start", http.StatusOK
	if method == "email" {
		input = Row{"returnTo": "/blog/post/room", "email": "reader@example.test"}
		endpoint, status = "/email", http.StatusAccepted
	}
	expectStatus(t, commentAliasRequest(a, jar, "POST", base+"/api/public/comment-auth"+endpoint, input), status)
	// An old host-only cookie on the canonical host must not shadow the shared one.
	canonical, _ := url.Parse("https://usefused.com/blog/")
	jar.SetCookies(canonical, []*http.Cookie{{Name: "margin_comment_flow", Value: "stale", Path: "/blog/", Secure: true}, {Name: "margin_comment_email", Value: "stale", Path: "/blog/", Secure: true}})
	if method == "email" {
		input = Row{"token": mail.messages[len(mail.messages)-1].str("verificationToken")}
		expectStatus(t, commentAliasRequest(a, jar, "POST", canonical.String()+"api/public/comment-auth/confirm", input), http.StatusOK)
	} else {
		callback := canonical.String() + "reader/auth/callback?code=ticket&state=" + state
		expectStatus(t, commentAliasRequest(a, jar, "GET", callback, nil), http.StatusSeeOther)
	}
	result := responseRow(t, commentAliasRequest(a, jar, "GET", canonical.String()+"api/public/comment-auth", nil), http.StatusOK)
	if result["reader"] == nil {
		t.Fatal("callback did not establish the reader session")
	}
}
