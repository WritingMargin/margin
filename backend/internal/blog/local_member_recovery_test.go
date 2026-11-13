package blog

import (
	"net/http"
	"testing"
	"time"
)

func TestLocalMemberPasswordRecoveryIsSingleUseAndRevokesOnlyThatAccount(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	member := Row{"subject": "member", "email": "member@example.test", "name": "Member", "role": "writer", "authVersion": "old-auth", "membershipVersion": "member-v1"}
	saveMemberFixture(t, a, member)
	a.DB.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2),($3,$2)", hash("member-session"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339), hash("owner-session"))
	a.DB.Must(t.Context(), "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash("member-session"), "member", "old-auth")
	requestPasswordRecovery(t, a, "MEMBER@example.test")
	if len(*messages) != 1 || (*messages)[0].str("to") != "member@example.test" {
		t.Fatal("missing member reset", messages)
	}
	value := (*messages)[0].str("resetToken")
	row := first(a.DB.Must(t.Context(), "SELECT * FROM engine_password_resets"))
	if row.str("token_hash") != hash(value) {
		t.Fatal("reset token not hashed")
	}
	reset := Row{"token": value, "password": "new-member-password"}
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", reset, false), 200)
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", reset, false), 400)
	if first(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash("member-session"))) != nil {
		t.Fatal("old member session survived")
	}
	if first(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash("owner-session"))) == nil {
		t.Fatal("unrelated owner session removed")
	}
	if a.localMemberPrincipal(t.Context(), "member").str("authVersion") == "old-auth" {
		t.Fatal("OAuth credential version not rotated")
	}
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": member["email"], "password": localMemberTestPassword}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": member["email"], "password": "new-member-password"}, false), 200)
}

func TestLocalMemberResetRejectsExpiredOrChangedCredentials(t *testing.T) {
	for _, change := range []string{"expired", "password", "email", "disabled"} {
		t.Run(change, func(t *testing.T) {
			a, messages := passwordRecoveryFixture(t)
			member := Row{"subject": "member", "email": "member@example.test", "name": "Member", "role": "writer", "authVersion": "old-auth", "membershipVersion": "member-v1"}
			saveMemberFixture(t, a, member)
			requestPasswordRecovery(t, a, "member@example.test")
			value := (*messages)[0].str("resetToken")
			queries := map[string]string{"expired": "UPDATE engine_password_resets SET expires_at='2000-01-01T00:00:00Z'", "password": "UPDATE engine_users SET password_hash='changed'", "email": "UPDATE engine_users SET email='other@example.test'", "disabled": "UPDATE engine_users SET enabled=FALSE"}
			a.DB.Must(t.Context(), queries[change])
			expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-member-password"}, false), 400)
		})
	}
}
func TestLocalMemberResetRevokesOAuthAccessAndRefresh(t *testing.T) {
	a, member := oauthMemberFixture(t, "writer")
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	value := newsletterToken()
	user := first(a.DB.Must(t.Context(), "SELECT * FROM engine_users WHERE id=$1", (*member)["subject"]))
	a.DB.Must(t.Context(), "INSERT INTO engine_password_resets(user_id,email,password_hash,token_hash,expires_at,sent_at) VALUES($1,$2,$3,$4,$5,$6)", user["id"], user["email"], user["password_hash"], hash(value), time.Now().Add(time.Hour).UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339))
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-member-password"}, false), 200)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), http.MethodGet, "/api/posts", nil), 401)
	oauthRefresh(t, a, client, tokens, 400)
}

func TestOwnerPasswordRecoveryPreservesTeammateSessions(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	member := Row{"subject": "member", "email": "member@example.test", "name": "Member", "role": "writer", "authVersion": "auth-v1", "membershipVersion": "member-v1"}
	saveMemberFixture(t, a, member)
	login := request(t, a, "POST", "/api/login", Row{"email": member["email"], "password": localMemberTestPassword}, false)
	expectStatus(t, login, 200)
	cookies := login.Result().Cookies()
	cookie := cookies[len(cookies)-1]
	requestPasswordRecovery(t, a, "owner@example.test")
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": (*messages)[0]["resetToken"], "password": "new-owner-password"}, false), 200)
	expectStatus(t, commentAuthRequest(a, "GET", "/api/posts", nil, cookie, ""), 200)
}
