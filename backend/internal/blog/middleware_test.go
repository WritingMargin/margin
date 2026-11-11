package blog

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

func rawMiddlewareRequest(a *App, path, payload string, headers map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "http://blog.test"+path, strings.NewReader(payload))
	for name, value := range headers {
		r.Header.Set(name, value)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestPublicOriginCanonicalization(t *testing.T) {
	a, _ := coreFixture(t)
	for _, test := range []struct{ configured, origin string }{{"https://BLOG.Example:443/base", "https://blog.example"}, {"http://BLOG.Example:80/", "http://blog.example"}, {"https://BLOG.Example:8443/", "https://blog.example:8443"}, {"https://[2001:DB8::1]:443/", "https://[2001:db8::1]"}} {
		t.Run(test.configured, func(t *testing.T) {
			t.Setenv("PUBLIC_URL", test.configured)
			headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer owner", "Origin": test.origin}
			expectStatus(t, rawMiddlewareRequest(a, "/api/tokens", "{}", headers), 201)
			headers["Origin"] = "https://unrelated.example"
			expectStatus(t, rawMiddlewareRequest(a, "/api/tokens", "{}", headers), 403)
		})
	}
}
func TestMalformedJSONRejectedBeforeAuthentication(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	for _, payload := range []string{`{`, `null`, `"text"`, `{} {}`} {
		t.Run(payload, func(t *testing.T) {
			expectStatus(t, rawMiddlewareRequest(a, "/api/posts", payload, map[string]string{"Content-Type": "application/json"}), 400)
		})
	}
	expectStatus(t, rawMiddlewareRequest(a, "/api/posts", `{}`, map[string]string{"Content-Type": "application/json"}), 401)
	expectStatus(t, rawMiddlewareRequest(a, "/api/posts", strings.Repeat(" ", 3<<20)+"{}", map[string]string{"Content-Type": "application/json"}), 413)
}
func TestOptionalTokenBodiesAndInvalidObjects(t *testing.T) {
	a, _ := coreFixture(t)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer owner"}
	for _, payload := range []string{"", "{}"} {
		row := responseRow(t, rawMiddlewareRequest(a, "/api/tokens", payload, headers), 201)
		saved := first(a.DB.Must(context.Background(), "SELECT name FROM api_tokens WHERE token_hash=$1", hash(row.str("token"))))
		if saved.str("name") != "CLI" || !strings.HasPrefix(row.str("token"), "margin_") {
			t.Fatal(row)
		}
	}
	for _, payload := range []string{`[]`, `null`, `{"name":null}`, `{"name":" "}`} {
		expectStatus(t, rawMiddlewareRequest(a, "/api/tokens", payload, headers), 400)
	}
}

type middlewareLimitCase struct {
	name, path, message string
	limit, minutes      int
	owner               bool
}

var middlewareLimitCases = []middlewareLimitCase{
	{"auth", "/api/login", "Too many sign-in attempts. Try again later.", 15, 15, false},
	{"comments", "/api/public/posts/missing/comments", "Please wait before leaving another comment.", 5, 15, false},
	{"ai-summaries", "/api/ai/summaries", "Please wait before generating more social drafts.", 15, 15, true},
	{"ai-images", "/api/ai/images", "Please wait before generating more images.", 6, 15, true},
	{"newsletter-subscribe", "/api/public/newsletter/subscribe", "Too many subscription requests. Please try again later.", 10, 60, false},
	{"newsletter-token", "/api/public/newsletter/unsubscribe", "Too many requests. Please try again later.", 60, 15, false},
}

func assertLimitHeaders(t *testing.T, response *httptest.ResponseRecorder, test middlewareLimitCase) {
	t.Helper()
	seconds := test.minutes * 60
	rate, policy := response.Header().Get("RateLimit"), response.Header().Get("RateLimit-Policy")
	pattern := fmt.Sprintf(`^"%d-in-%dmin"; r=0; t=\d+$`, test.limit, test.minutes)
	if strings.HasPrefix(test.name, "newsletter-") {
		pattern = fmt.Sprintf(`^limit=%d, remaining=0, reset=\d+$`, test.limit)
		if policy != fmt.Sprintf("%d;w=%d", test.limit, seconds) {
			t.Fatal(policy)
		}
	} else {
		policyPattern := fmt.Sprintf(`^"%d-in-%dmin"; q=%d; w=%d; pk=:[A-Za-z0-9+/=]+:$`, test.limit, test.minutes, test.limit, seconds)
		if !regexp.MustCompile(policyPattern).MatchString(policy) {
			t.Fatal(policy)
		}
	}
	if !regexp.MustCompile(pattern).MatchString(rate) {
		t.Fatal(rate)
	}
	retry, err := strconv.Atoi(response.Header().Get("Retry-After"))
	if err != nil || retry < seconds-2 || retry > seconds {
		t.Fatal("invalid retry interval", retry, err)
	}
	if response.Header().Get("X-RateLimit-Limit") != "" {
		t.Fatal("legacy rate headers unexpectedly enabled")
	}
}
func TestLimiterResponsesMatchNodeMessagesAndHeaders(t *testing.T) {
	a, _ := coreFixture(t)
	for _, test := range middlewareLimitCases {
		t.Run(test.name, func(t *testing.T) {
			key := "192.0.2.1"
			if test.owner {
				key = "owner"
			}
			a.limits[test.name+":"+key] = window{Start: time.Now(), Count: test.limit}
			response := request(t, a, "POST", test.path, Row{}, true)
			row := responseRow(t, response, 429)
			if row.str("error") != test.message {
				t.Fatal(row)
			}
			assertLimitHeaders(t, response, test)
		})
	}
}
func TestLimiterHeadersPresentBeforeQuotaExceeded(t *testing.T) {
	a, _ := coreFixture(t)
	response := request(t, a, "POST", "/api/login", Row{}, false)
	expectStatus(t, response, 400)
	requireReadableText(t, response.Header().Get("RateLimit"), `"15-in-15min"; r=14; t=`)
	if response.Header().Get("RateLimit-Policy") == "" || response.Header().Get("Retry-After") != "" {
		t.Fatal(response.Header())
	}
}
func TestSessionMutationRequiresOriginAndRejectsCrossSite(t *testing.T) {
	a, _ := coreFixture(t)
	headers := map[string]string{"Content-Type": "application/json", "Cookie": "margin_session=present"}
	expectStatus(t, rawMiddlewareRequest(a, "/api/logout", "{}", headers), 403)
	headers["Origin"] = "http://blog.test"
	expectStatus(t, rawMiddlewareRequest(a, "/api/logout", "{}", headers), 200)
	headers["Sec-Fetch-Site"] = "cross-site"
	expectStatus(t, rawMiddlewareRequest(a, "/api/logout", "{}", headers), 403)
}
func TestJSONMediaTypeParametersStillParse(t *testing.T) {
	a, _ := coreFixture(t)
	headers := map[string]string{"Content-Type": "application/json; charset=utf-8", "Authorization": "Bearer owner"}
	response := rawMiddlewareRequest(a, "/api/tokens", `{"name":"Parameter test"}`, headers)
	row := responseRow(t, response, http.StatusCreated)
	saved := first(a.DB.Must(context.Background(), "SELECT name FROM api_tokens WHERE token_hash=$1", hash(row.str("token"))))
	if saved.str("name") != "Parameter test" {
		t.Fatal(row)
	}
}
