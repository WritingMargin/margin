package blog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestStandaloneBlogWithoutCentral(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	t.Setenv("AI_SERVICE_URL", "")
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("core blogging contacted Central")
		return nil, nil
	})
	responseRow(t, request(t, a, "GET", "/api/session", nil, false), 200)
	setup := request(t, a, "POST", "/api/setup", Row{"email": "owner@example.com", "password": "standalone-password"}, false)
	expectStatus(t, setup, 201)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "standalone-password"}, false), 200)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Standalone", "slug": "standalone", "content": "My local post"}, true), 201)
	post = responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"status": "published", "revision": post["revision"]}, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/"+post.str("slug"), nil, false), 200)
	image := uploadSharingImage(t, a)
	expectStatus(t, request(t, a, "GET", image, nil, true), 200)
	t.Setenv("CLOUDINARY_CLOUD_NAME", "configured")
	t.Setenv("CLOUDINARY_API_KEY", "key")
	t.Setenv("CLOUDINARY_API_SECRET", "secret")
	expectStatus(t, request(t, a, "GET", "/api/media/images", nil, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/posts", nil, false), 401)
	row := responseRow(t, request(t, a, "GET", "/api/ai/config", nil, true), 503)
	if row.str("code") != "ACCOUNT_REQUIRED" {
		t.Fatal(row)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM central_connection")) != 0 {
		t.Fatal("account created without consent")
	}
}

func TestCentralOutageDoesNotBlockCoreFeatures(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("central offline") })
	for _, path := range []string{"/api/session", "/api/posts", "/api/settings", "/api/storage", "/api/tokens"} {
		expectStatus(t, request(t, a, "GET", path, nil, true), 200)
	}
	expectStatus(t, request(t, a, "POST", "/api/posts", Row{"title": "Still writing", "slug": "still-writing", "content": "Offline from Central"}, true), 201)
	expectStatus(t, request(t, a, "GET", "/api/media", nil, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/ai/config", nil, true), 503)
	image := uploadSharingImage(t, a)
	expectStatus(t, request(t, a, "GET", image, nil, true), 200)
}

func registrationFixture(t *testing.T) *App {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	t.Setenv("PUBLIC_URL", "https://blog.example.com")
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "owner@example.com", "not-used")
	return a
}
func TestAccountCreationRequiresConsentAndRecoversAfterTimeout(t *testing.T) {
	a := registrationFixture(t)
	calls := 0
	a.Client.Transport = registrationTransport(t, &calls)

	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": false}, true), 400)
	status := responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if calls != 0 {
		t.Fatal(status, calls)
	}
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 503)
	saved := a.connection(context.Background())
	secret := decryptAccount(saved)
	if strings.Contains(encode(saved), secret) {
		t.Fatal("registration credential was exposed or prematurely activated")
	}
	// Restarting the engine keeps the same pending registration key.
	a = NewApp(a.DB, a.Storage, a.Client, nil)
	response := request(t, a, "POST", "/api/account", Row{"consent": true}, true)
	status = responseRow(t, response, 200)
	if !status.yes("connected") || strings.Contains(response.Body.String(), secret) {
		t.Fatal(status)
	}
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 200)
	if calls != 2 {
		t.Fatal("repeated click registered again", calls)
	}
	if a.accountToken(context.Background()) != secret {
		t.Fatal("credential not persisted")
	}
	expectStatus(t, request(t, a, "GET", "/api/media", nil, true), 200)
	t.Setenv("AI_SERVICE_URL", "https://other.example.com")
	expectPanicCode(t, "ACCOUNT_CONFIGURATION", func() { a.accountToken(context.Background()) })
}

func registrationTransport(t *testing.T, calls *int) testTransport {
	t.Helper()
	registrationKey := ""
	var registration Row
	return testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
		}
		*calls++
		if r.URL.Path != "/v1/accounts" || r.Method != "POST" {
			t.Fatalf("unexpected Central request %s", r.URL)
		}
		var input Row
		json.NewDecoder(r.Body).Decode(&input)
		key := r.Header.Get("Authorization")
		if *calls == 1 {
			registrationKey, registration = key, input
			if input.str("email") != "owner@example.com" || input.str("blogUrl") != "https://blog.example.com" || !input.yes("consent") {
				t.Fatal(input)
			}
			return nil, errors.New("response lost after account was created")
		}
		if key != registrationKey || encode(input) != encode(registration) {
			t.Fatal("retry changed registration identity")
		}
		return fixtureResponse(Row{"id": "11111111-1111-4111-8111-111111111111"}), nil
	})
}

func TestAccountGateVerifiesConfiguredCredential(t *testing.T) {
	a := registrationFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "invalid-test-key")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/account" || r.Method != "GET" {
			t.Fatal("status must never register an account")
		}
		response := fixtureResponse(Row{"error": "A valid AI account key is required.", "code": "AI_UNAUTHORIZED"})
		response.StatusCode = 401
		return response, nil
	})
	status := responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if status.yes("connected") || status.yes("registrationAvailable") || status.str("connectionState") != "rejected" || !status.yes("serverTokenConfigured") {
		t.Fatal(status)
	}
	if strings.Contains(encode(status), "invalid-test-key") {
		t.Fatal("status exposed the configured credential")
	}
	t.Setenv("AI_SERVICE_TOKEN", "")
	status = responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if !status.yes("registrationAvailable") || status.str("connectionState") != "disconnected" {
		t.Fatal("removing the invalid override must enable account creation", status)
	}
}

func TestAccountGateDoesNotTreatOutageAsMissingAccount(t *testing.T) {
	a := registrationFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "configured-test-key")
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("Central is offline")
	})
	status := responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if status.yes("connected") || status.yes("registrationAvailable") || status.str("connectionState") != "unavailable" {
		t.Fatal(status)
	}
	if a.accountToken(context.Background()) != "configured-test-key" {
		t.Fatal("outage changed account identity")
	}
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
	})
	status = responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if !status.yes("connected") {
		t.Fatal("valid free accounts must remain connected", status)
	}
}
