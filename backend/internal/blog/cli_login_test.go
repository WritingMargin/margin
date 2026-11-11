package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func cliChallenge(t *testing.T, a *App, key string) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/cli/login", Row{"tokenHash": hash(key)}, false), 201)
}

func TestCLIApprovalAndRevocation(t *testing.T) {
	a, _ := coreFixture(t)
	challenge := cliChallenge(t, a, "new-cli-key")
	poll := Row{"deviceCode": challenge["deviceCode"]}
	code := Row{"code": challenge["userCode"]}
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", code, false), 401)
	state := responseRow(t, request(t, a, "POST", "/api/cli/poll", poll, false), 200)
	if state.yes("approved") {
		t.Fatal("credential activated without approval")
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM api_tokens WHERE token_hash=$1", hash("new-cli-key"))) != 0 {
		t.Fatal("pending credential usable")
	}
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", code, true), 201)
	state = responseRow(t, request(t, a, "POST", "/api/cli/poll", poll, false), 200)
	if !state.yes("approved") {
		t.Fatal("approval not received")
	}
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", code, true), 410)
	expectStatus(t, request(t, a, "DELETE", "/api/tokens/"+hash("new-cli-key"), nil, true), 200)
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", code, true), 410)
	state = responseRow(t, request(t, a, "POST", "/api/cli/poll", poll, false), 200)
	if state.yes("approved") {
		t.Fatal("revoked credential reactivated")
	}
}

func TestCLILoginExpiryAndValidation(t *testing.T) {
	a, _ := coreFixture(t)
	expectStatus(t, request(t, a, "POST", "/api/cli/login", Row{"tokenHash": strings.Repeat("g", 64)}, false), 400)
	challenge := cliChallenge(t, a, "private-key")
	expectStatus(t, request(t, a, "POST", "/api/cli/poll", Row{"deviceCode": strings.Repeat("x", 43)}, false), 410)
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", Row{"code": "invalid"}, true), 410)
	a.DB.Must(context.Background(), "UPDATE cli_logins SET expires_at=$1", "2000-01-01T00:00:00.000Z")
	expectStatus(t, request(t, a, "POST", "/api/cli/poll", Row{"deviceCode": challenge["deviceCode"]}, false), 410)
	expectStatus(t, request(t, a, "POST", "/api/tokens/cli/approve", Row{"code": challenge["userCode"]}, true), 410)
	if strings.Contains(encode(challenge), "private-key") {
		t.Fatal("credential leaked")
	}
}

func TestCLIApprovalUsesSessionAndOrigin(t *testing.T) {
	a, _ := coreFixture(t)
	challenge := cliChallenge(t, a, "new-cli-key")
	a.DB.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser-session"), "2099-01-01T00:00:00.000Z")
	for _, origin := range []string{"https://attacker.example", "", "http://blog.test"} {
		r := httptest.NewRequest("POST", "http://blog.test/api/tokens/cli/approve", strings.NewReader(encode(Row{"code": challenge["userCode"]})))
		r.Header.Set("Cookie", "margin_session=browser-session")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		want := 403
		if origin == "http://blog.test" {
			want = 201
		}
		expectStatus(t, w, want)
	}
}

func TestCLILoginRateLimit(t *testing.T) {
	a, _ := coreFixture(t)
	for i := 0; i < 10; i++ {
		cliChallenge(t, a, "new-cli-key")
	}
	expectStatus(t, request(t, a, "POST", "/api/cli/login", Row{"tokenHash": hash("new-cli-key")}, false), 429)
}
