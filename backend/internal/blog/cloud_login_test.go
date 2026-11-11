package blog

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudPasswordLoginUsesCentralCredentialsAndCreatesLocalSession(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	if !a.ownerEmail(t.Context()).yes("verified") {
		t.Fatal("Central email verification not recorded")
	}
	password := strings.Repeat("x", 90) // Central passwords are not truncated to bcrypt's local-account limit.
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatal("missing JSON content type")
		}
		if r.URL.String() != "https://margin.example/cloud/api/engine-login" || r.Header.Get("Authorization") != "Bearer "+strings.Repeat("s", 32) {
			t.Fatal("wrong credential destination")
		}
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		if input.str("email") != "owner@example.com" || input.str("password") != password || input.str("subject") != "central-owner-id" {
			t.Fatal("wrong login contract")
		}
		return fixtureResponse(Row{"authenticated": true, "subject": "central-owner-id"}), nil
	})}
	w := request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": password}, false)
	expectStatus(t, w, 200)
	cookie := cloudAuthenticatedCookie(t, w)
	r := httptest.NewRequest("GET", "https://notes.pages.example/api/session", nil)
	r.AddCookie(cookie)
	session := httptest.NewRecorder()
	a.ServeHTTP(session, r)
	if !responseRow(t, session, 200).yes("authenticated") {
		t.Fatal("not authenticated")
	}
}
func cloudAuthenticatedCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == "margin_session" {
			cookie = c
		}
	}
	if cookie == nil || !cookie.Secure || !cookie.HttpOnly {
		t.Fatal("missing local session")
	}
	return cookie
}
func TestCloudPasswordLoginFailsClosedAndNeverRedirectsPasswords(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	for _, test := range []struct {
		status   int
		output   Row
		expected int
	}{{401, Row{}, 401}, {403, Row{}, 401}, {200, Row{"authenticated": true, "subject": "another-owner"}, 401}, {200, Row{"authenticated": false, "subject": "central-owner-id"}, 401}, {503, Row{}, 503}, {302, Row{}, 503}} {
		calls := 0
		a.Client = &http.Client{Transport: testTransport(func(*http.Request) (*http.Response, error) {
			calls++
			res := fixtureResponse(test.output)
			res.StatusCode = test.status
			res.Header.Set("Location", "https://attacker.example")
			return res, nil
		})}
		w := request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "valid-looking-password"}, false)
		expectStatus(t, w, test.expected)
		if len(w.Result().Cookies()) != 0 || calls != 1 {
			t.Fatal("unsafe session or redirect")
		}
	}
	a.Client = &http.Client{Transport: testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("unavailable") })}
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "valid-looking-password"}, false), 503)
}
func TestCloudBootstrapRequiresVerifiedEmail(t *testing.T) {
	a := cloudOwnerFixture(t)
	input := cloudOwnerInput()
	input["emailVerified"] = false
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", input), 403)
}
