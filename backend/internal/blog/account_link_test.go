package blog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"
)

func pendingAccountAuthentication() Row {
	return Row{"authenticationRequired": true, "authenticationUrl": "https://studio.example/connect-engine#request=22222222-2222-4222-8222-222222222222", "expiresAt": time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)}
}

type accountLinkTransport struct {
	t                 *testing.T
	approved, offline bool
	registrations     int
	key               string
}

func (f *accountLinkTransport) register(r *http.Request) (*http.Response, error) {
	f.registrations++
	var input Row
	must(json.NewDecoder(r.Body).Decode(&input))
	if len(input) != 4 || !input.yes("consent") || input.str("email") != "owner@example.com" {
		f.t.Fatal(input)
	}
	if f.key != "" && f.key != r.Header.Get("Authorization") {
		f.t.Fatal("retry changed credential")
	}
	f.key = r.Header.Get("Authorization")
	response := fixtureResponse(pendingAccountAuthentication())
	response.StatusCode = 202
	return response, nil
}
func (f *accountLinkTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if f.offline {
		return nil, errors.New("Studio unavailable")
	}
	switch r.URL.Path {
	case "/v1/accounts":
		return f.register(r)
	case "/v1/accounts/connection":
		if r.Header.Get("Authorization") != f.key {
			f.t.Fatal("poll used a different credential")
		}
		if f.approved {
			return fixtureResponse(Row{"id": "11111111-1111-4111-8111-111111111111"}), nil
		}
		return fixtureResponse(pendingAccountAuthentication()), nil
	case "/v1/account":
		if !f.approved {
			f.t.Fatal("credential used before Studio approval")
		}
		return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
	default:
		f.t.Fatalf("unexpected request %s", r.URL)
		return nil, nil
	}
}
func TestExistingAccountAuthenticationPersistsAndCompletesWithoutExposingCredential(t *testing.T) {
	a := registrationFixture(t)
	transport := &accountLinkTransport{t: t}
	a.Client.Transport = transport
	response := request(t, a, "POST", "/api/account", Row{"consent": true}, true)
	status := responseRow(t, response, 200)
	if status.yes("connected") || object(status["authentication"]).str("url") == "" {
		t.Fatal(status)
	}
	secret := decryptAccount(a.connection(context.Background()))
	if strings.Contains(response.Body.String(), secret) {
		t.Fatal("credential exposed to browser")
	}
	if a.accountToken(context.Background()) != "" {
		t.Fatal("unapproved token activated")
	}
	// A reload/restart retains the request, but never signs in or creates again.
	a = NewApp(a.DB, a.Storage, a.Client, nil)
	status = responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
	if object(status["authentication"]).str("url") == "" {
		t.Fatal("pending link lost on restart")
	}
	expectStatus(t, request(t, a, "POST", "/api/account/connection", Row{}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/account/connection", Row{}, true), 200)
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 200)
	if transport.registrations != 2 {
		t.Fatal("poll registered a new account")
	}
	transport.offline = true
	expectStatus(t, request(t, a, "POST", "/api/account/connection", Row{}, true), 503)
	if decryptAccount(a.connection(context.Background())) != secret {
		t.Fatal("outage replaced credential")
	}
	transport.offline, transport.approved = false, true
	assertAccountLinkCompleted(t, a, secret)
}
func assertAccountLinkCompleted(t *testing.T, a *App, secret string) {
	t.Helper()
	response := request(t, a, "POST", "/api/account/connection", Row{}, true)
	status := responseRow(t, response, 200)
	if !status.yes("connected") || status["authentication"] != nil || strings.Contains(response.Body.String(), secret) {
		t.Fatal(status)
	}
	if a.accountToken(context.Background()) != secret {
		t.Fatal("approval rotated installation credential")
	}
}

func TestAccountAuthenticationExpiryIsRetryableAndDoesNotActivate(t *testing.T) {
	a := registrationFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/accounts" {
			return fixtureResponse(pendingAccountAuthentication()), nil
		}
		response := fixtureResponse(Row{"error": "Sign-in expired", "code": "ACCOUNT_AUTH_EXPIRED"})
		response.StatusCode = 410
		return response, nil
	})
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 200)
	result := responseRow(t, request(t, a, "POST", "/api/account/connection", Row{}, true), 410)
	if result.str("code") != "ACCOUNT_AUTH_EXPIRED" || a.accountToken(context.Background()) != "" {
		t.Fatal(result)
	}
	expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 200)
}

func TestAccountAuthenticationRejectsUnsafeStudioLinks(t *testing.T) {
	for _, address := range []string{"javascript:alert(1)", "http://studio.example/connect-engine", "https://user:pass@studio.example/connect-engine", "https://studio.example/other", "https://studio.example/connect-engine#request=bad"} {
		result := pendingAccountAuthentication()
		result["authenticationUrl"] = address
		expectPanicCode(t, "ACCOUNT_UNAVAILABLE", func() { validatedAccountAuthentication(result) })
	}
}
