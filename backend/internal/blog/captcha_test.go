package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func captchaVerdict(t *testing.T, a *App, token string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	func() {
		defer recoverRequest(w)
		a.verifyCaptcha(httptest.NewRequest("POST", "https://blog.test", nil), token)
		send(w, 200, Row{"ok": true})
	}()
	return w
}

func TestCaptchaLegacyKeysAndProviderSwitch(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	// Write the original payload format, which has no provider discriminator.
	encrypted, err := turnstileEncryption().Encrypt([]byte(`{"siteKey":"legacy-site","secretKey":"legacy-secret"}`), "settings", "turnstile")
	must(err)
	a.DB.Must(context.Background(), "INSERT INTO turnstile_settings(id,encrypted_configuration) VALUES(1,$1)", base64.StdEncoding.EncodeToString(encrypted))
	status := responseRow(t, request(t, a, "GET", "/api/settings/captcha", nil, true), 200)
	if status.str("provider") != "turnstile" || !status.yes("secretConfigured") || status["secretKey"] != nil {
		t.Fatal(status)
	}
	// A provider change must not reuse the previous provider's secret, even with the same site key.
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "recaptcha-v2", "siteKey": "legacy-site"}, true), 400)
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "recaptcha-v2", "siteKey": "google-site", "secretKey": "google-secret"}, true), 200)
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "recaptcha-v2", "siteKey": "google-site", "secretKey": ""}, true), 200)
	public := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if public.str("captchaProvider") != "recaptcha-v2" || public.str("captchaSiteKey") != "google-site" || strings.Contains(encode(public), "google-secret") {
		t.Fatal(public)
	}
	saved := first(a.DB.Must(context.Background(), "SELECT encrypted_configuration FROM turnstile_settings"))
	if strings.Contains(saved.str("encrypted_configuration"), "google-secret") {
		t.Fatal("secret stored in plaintext")
	}
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "recaptcha-v3", "siteKey": "site", "secretKey": "secret"}, true), 400)
}

func TestCustomCaptchaVerifiesDirectlyAndFailsClosed(t *testing.T) {
	for _, provider := range []string{"turnstile", "recaptcha-v2"} {
		t.Run(provider, func(t *testing.T) {
			a, _ := coreFixture(t)
			t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
			t.Setenv("PUBLIC_URL", "https://blog.test")
			expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": provider, "siteKey": "site", "secretKey": "secret"}, true), 200)
			host := "challenges.cloudflare.com"
			if provider == "recaptcha-v2" {
				host = "www.google.com"
			}
			verdict := Row{"success": true, "hostname": "blog.test"}
			var transportErr error
			a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
				if r.URL.Host != host {
					t.Fatalf("custom mode contacted %s", r.URL)
				}
				if err := r.ParseForm(); err != nil {
					t.Fatal(err)
				}
				if r.Form.Get("secret") != "secret" || r.Form.Get("response") != "valid" {
					t.Fatal(r.Form)
				}
				if transportErr != nil {
					return nil, transportErr
				}
				return fixtureResponse(verdict), nil
			})
			// Reading configuration also stays independent from Central.
			expectStatus(t, request(t, a, "GET", "/api/settings/captcha", nil, true), 200)
			expectStatus(t, captchaVerdict(t, a, "valid"), 200)
			verdict["success"] = false
			expectStatus(t, captchaVerdict(t, a, "valid"), 400)
			verdict["success"], verdict["hostname"] = true, "attacker.test"
			expectStatus(t, captchaVerdict(t, a, "valid"), 400)
			transportErr = errors.New("offline")
			expectStatus(t, captchaVerdict(t, a, "valid"), 503)
		})
	}
}

func managedCaptchaFixture(t *testing.T) (*App, *int, *int) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	configCalls, verifyCalls := 0, 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "central.example" || r.Header.Get("Authorization") != "Bearer test" {
			t.Fatalf("unexpected request: %s", r.URL)
		}
		if r.URL.Path == "/v1/captcha" {
			configCalls++
			return fixtureResponse(Row{"provider": "recaptcha-v2", "siteKey": "managed-site", "hostname": "blog.test"}), nil
		}
		if r.URL.Path != "/v1/captcha/verify" {
			t.Fatalf("unexpected route: %s", r.URL)
		}
		verifyCalls++
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		if len(input) != 2 || input.str("token") != "valid" || input["remoteip"] == nil {
			t.Fatal(input)
		}
		return fixtureResponse(Row{"success": true, "hostname": "blog.test"}), nil
	})
	return a, &configCalls, &verifyCalls
}

func TestManagedCaptchaDefaultCache(t *testing.T) {
	a, configs, _ := managedCaptchaFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	for i := 0; i < 3; i++ {
		result := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
		if result.str("captchaSiteKey") != "managed-site" || result.str("captchaProvider") != "recaptcha-v2" || result.str("captchaAction") != "" || result.str("captchaCData") != "" {
			t.Fatal(result)
		}
	}
	if *configs != 1 {
		t.Fatalf("configuration not cached: %d", *configs)
	}
}

func TestManagedCaptchaCommentAndLocalOverride(t *testing.T) {
	a, configs, verifies := managedCaptchaFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	a.publicSiteKey(context.Background())
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Managed", "slug": "managed", "content": "body", "status": "published"}, true), 201)
	expectStatus(t, conversationRequest(t, a, "POST", "/api/public/posts/"+post.str("id")+"/comments", Row{"name": "Reader", "email": "reader@example.test", "body": "Hello", "captchaToken": "valid"}, false), 201)
	saved := first(a.DB.Must(context.Background(), "SELECT * FROM comments"))
	if saved.yes("approved") || *verifies != 0 {
		t.Fatal("signed-in comments must skip CAPTCHA and preserve moderation")
	}
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "turnstile", "siteKey": "own-site", "secretKey": "own-secret"}, true), 200)
	own := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if own.str("captchaSiteKey") != "own-site" || *configs != 1 {
		t.Fatal("custom keys did not take precedence")
	}
	managed := responseRow(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "managed"}, true), 200)
	if managed.str("provider") != "managed" || managed.str("source") != "central" || managed.yes("secretConfigured") {
		t.Fatal(managed)
	}
	if first(a.DB.Must(context.Background(), "SELECT * FROM turnstile_settings")) != nil {
		t.Fatal("custom secret not removed")
	}
}

func TestManagedCaptchaUnavailableDoesNotBreakReadingOrBypassVerification(t *testing.T) {
	a, _, _ := managedCaptchaFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	public := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if public.str("captchaSiteKey") != "" {
		t.Fatal(public)
	}
	status := responseRow(t, request(t, a, "GET", "/api/settings/captcha", nil, true), 200)
	if status.str("issue") == "" {
		t.Fatal("missing actionable managed error")
	}
	expectStatus(t, captchaVerdict(t, a, "valid"), 503)
	expectStatus(t, request(t, a, "GET", "/", nil, false), 200)
}

func TestManagedCaptchaRejectsWrongHostnameAndInvalidConfiguration(t *testing.T) {
	for _, mutation := range []Row{{"hostname": "elsewhere.test"}, {"provider": "turnstile"}, {"provider": "recaptcha-v3"}, {"siteKey": ""}} {
		valid := Row{"provider": "recaptcha-v2", "siteKey": "site", "hostname": "blog.test"}
		for key, value := range mutation {
			valid[key] = value
		}
		if managedCaptchaResult(valid, 200, nil, "blog.test").str("siteKey") != "" {
			t.Fatal(mutation)
		}
	}
}

func TestRecaptchaV3VerdictCannotBypassScoreValidation(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "recaptcha-v2", "siteKey": "site", "secretKey": "secret"}, true), 200)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"success": true, "hostname": "blog.test", "score": 0.1, "action": "comment"}), nil
	})
	expectStatus(t, captchaVerdict(t, a, "valid"), 400)
}

func TestManagedCaptchaVerificationFailuresAndNoVerdictCache(t *testing.T) {
	a, _, calls := managedCaptchaFixture(t)
	expectStatus(t, captchaVerdict(t, a, "valid"), 200)
	expectStatus(t, captchaVerdict(t, a, "valid"), 200)
	if *calls != 2 {
		t.Fatal("verification results must not be cached")
	}
	for _, tc := range []struct {
		status  int
		verdict Row
		want    int
	}{
		{200, Row{"success": false}, 400},
		{200, Row{"success": true, "hostname": "other.test"}, 400},
		{400, Row{"error": "invalid token"}, 400},
		{429, Row{"error": "rate limited"}, 429},
		{503, Row{"error": "offline"}, 503},
	} {
		a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
			response := fixtureResponse(tc.verdict)
			response.StatusCode = tc.status
			return response, nil
		})
		expectStatus(t, captchaVerdict(t, a, "valid"), tc.want)
	}
}
