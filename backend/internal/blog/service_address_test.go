package blog

import (
	"context"
	"net/http"
	"os"
	"testing"
)

func TestServiceAddressDefaultAndOverrides(t *testing.T) {
	for _, tc := range []struct {
		name, address, environment, want string
	}{
		{"unset", "", "production", "https://margin.usefused.com"},
		{"empty", "", "production", "https://margin.usefused.com"},
		{"override", "https://central.example", "production", "https://central.example"},
		{"development", "http://localhost:3010", "development", "http://localhost:3010"},
		{"insecure", "http://central.example", "production", ""},
		{"invalid", "central.example", "production", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("AI_SERVICE_URL", tc.address)
			t.Setenv("MARGIN_ENV", tc.environment)
			if tc.name == "unset" {
				if err := os.Unsetenv("AI_SERVICE_URL"); err != nil {
					t.Fatal(err)
				}
			}
			got, err := serviceURL()
			if tc.want == "" {
				if err == nil {
					t.Fatal("invalid override accepted")
				}
				return
			}
			if err != nil || got.String() != tc.want || accountURL().String() != tc.want {
				t.Fatalf("service URL = %v, error = %v; want %s", got, err, tc.want)
			}
		})
	}
}

func TestDefaultServiceAccountConnection(t *testing.T) {
	for _, initial := range []string{"", "https://margin.usefused.com"} {
		t.Run("configured="+initial, func(t *testing.T) {
			a := registrationFixture(t)
			t.Setenv("AI_SERVICE_URL", initial)
			a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
				if r.URL.Scheme != "https" || r.URL.Host != "margin.usefused.com" {
					t.Fatalf("wrong destination: %s", r.URL)
				}
				if r.URL.Path == "/v1/accounts" {
					return fixtureResponse(Row{"id": "11111111-1111-4111-8111-111111111111"}), nil
				}
				return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
			})
			status := responseRow(t, request(t, a, "GET", "/api/account", nil, true), 200)
			if !status.yes("registrationAvailable") {
				t.Fatal("account registration must be available without a URL setting", status)
			}
			expectStatus(t, request(t, a, "POST", "/api/account", Row{"consent": true}, true), 200)
			ctx := context.Background()
			key := a.accountToken(ctx)
			if key == "" || a.connection(ctx).str("service_url") != "https://margin.usefused.com" {
				t.Fatal("default account was not persisted")
			}
			t.Setenv("AI_SERVICE_URL", "")
			a = NewApp(a.DB, a.Storage, a.Client, nil)
			if a.accountToken(ctx) != key || a.accountState(ctx) != "connected" {
				t.Fatal("removing the URL override broke the saved account")
			}
			a.serviceRequest(ctx, "/v1/account", nil, "")
			t.Setenv("AI_SERVICE_URL", "https://other.example.com")
			expectPanicCode(t, "ACCOUNT_CONFIGURATION", func() { a.accountToken(ctx) })
		})
	}
}
