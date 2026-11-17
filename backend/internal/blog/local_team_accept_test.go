package blog

import (
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func localAcceptanceFixture(t *testing.T) *App {
	t.Helper()
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	return a
}
func localAcceptanceInvitation(t *testing.T, a *App, email, role string) string {
	t.Helper()
	value := newsletterToken()
	a.DB.Must(t.Context(), "INSERT INTO engine_invitations(id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)", uuid(), email, role, hash(value), time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	return value
}
func acceptInvitationRequest(t *testing.T, a *App, value, email, password string) *httptest.ResponseRecorder {
	t.Helper()
	return request(t, a, "POST", "/api/public/team/accept", Row{"token": value, "email": email, "password": password, "name": "Local Teammate"}, false)
}
func TestLocalInvitationCreatesAccountAndConsumesToken(t *testing.T) {
	a := localAcceptanceFixture(t)
	value := localAcceptanceInvitation(t, a, "new@example.com", "writer")
	accepted := acceptInvitationRequest(t, a, value, "NEW@example.com", localMemberTestPassword)
	expectStatus(t, accepted, 200)
	cookie := cloudAuthenticatedCookie(t, accepted)
	session := responseRow(t, memberRequest(a, cookie, "GET", "/api/session", nil), 200)
	if session.str("role") != "writer" || object(session["user"]).str("name") != "Local Teammate" {
		t.Fatal(session)
	}
	expectStatus(t, acceptInvitationRequest(t, a, value, "new@example.com", localMemberTestPassword), 400)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "new@example.com", "password": localMemberTestPassword}, false), 200)
	rows := a.DB.Must(t.Context(), "SELECT id FROM engine_users")
	if len(rows) != 1 {
		t.Fatal("invitation duplicated local accounts")
	}
}
func TestLocalInvitationExistingAccountRequiresItsPassword(t *testing.T) {
	a, _, member := memberFixture(t, "writer")
	value := localAcceptanceInvitation(t, a, (*member).str("email"), "publisher")
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), "wrong-password-123"), 401)
	pending := first(a.DB.Must(t.Context(), "SELECT status FROM engine_invitations WHERE token_hash=$1", hash(value)))
	if pending.str("status") != "pending" {
		t.Fatal("wrong password consumed the invitation")
	}
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), localMemberTestPassword), 200)
	current := a.localMemberPrincipal(t.Context(), (*member).str("subject"))
	if current.str("role") != "publisher" || current.str("authVersion") != (*member).str("authVersion") || current.str("membershipVersion") != (*member).str("membershipVersion") {
		t.Fatal("acceptance replaced existing credentials or membership incarnation")
	}
}
func TestLocalInvitationRejoiningCannotResetExistingPassword(t *testing.T) {
	a, oldCookie, member := memberFixture(t, "writer")
	removeMemberFixture(t, a, (*member).str("subject"))
	expectStatus(t, memberRequest(a, oldCookie, "GET", "/api/posts", nil), 401)
	value := localAcceptanceInvitation(t, a, (*member).str("email"), "publisher")
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), "replacement-password"), 401)
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), localMemberTestPassword), 200)
	current := a.localMemberPrincipal(t.Context(), (*member).str("subject"))
	if current.str("membershipVersion") == (*member).str("membershipVersion") || current.str("authVersion") != (*member).str("authVersion") {
		t.Fatal("rejoining reused revoked membership or changed credentials")
	}
	expectStatus(t, memberRequest(a, oldCookie, "GET", "/api/posts", nil), 401)
}
func TestLocalInvitationValidationRollsBackAccountAndToken(t *testing.T) {
	for _, scenario := range []string{"expired", "revoked", "wrong-email", "invalid-token", "short-password", "owner-email"} {
		t.Run(scenario, func(t *testing.T) {
			a := localAcceptanceFixture(t)
			value := localAcceptanceInvitation(t, a, "new@example.com", "writer")
			original := value
			email, password := "new@example.com", localMemberTestPassword
			switch scenario {
			case "expired":
				a.DB.Must(t.Context(), "UPDATE engine_invitations SET expires_at=$1", "2000-01-01T00:00:00Z")
			case "revoked":
				a.DB.Must(t.Context(), "UPDATE engine_invitations SET status='revoked'")
			case "wrong-email":
				email = "someone-else@example.com"
			case "invalid-token":
				value = strings.Repeat("x", 64)
			case "short-password":
				password = "short"
			case "owner-email":
				a.DB.Must(t.Context(), "UPDATE admins SET email=$1", email)
			}
			expectStatus(t, acceptInvitationRequest(t, a, value, email, password), 400)
			if len(a.DB.Must(t.Context(), "SELECT id FROM engine_users")) != 0 {
				t.Fatal("failed invitation created an account")
			}
			status := first(a.DB.Must(t.Context(), "SELECT status FROM engine_invitations WHERE token_hash=$1", hash(original))).str("status")
			if status == "accepted" {
				t.Fatal("failed invitation was consumed")
			}
		})
	}
}
func checkConcurrentLocalInvitation(t *testing.T, a *App) {
	t.Helper()
	value := localAcceptanceInvitation(t, a, "concurrent@example.com", "writer")
	var workers sync.WaitGroup
	results := make(chan int, 2)
	for range 2 {
		workers.Go(func() {
			results <- acceptInvitationRequest(t, a, value, "concurrent@example.com", localMemberTestPassword).Code
		})
	}
	workers.Wait()
	close(results)
	counts := map[int]int{}
	for status := range results {
		counts[status]++
	}
	if counts[200] != 1 || counts[400] != 1 {
		t.Fatal("invitation was not single-use", counts)
	}
	if len(a.DB.Must(t.Context(), "SELECT id FROM engine_users WHERE email='concurrent@example.com'")) != 1 {
		t.Fatal("concurrent acceptance duplicated account")
	}
}
func TestLocalInvitationConcurrentSingleUse(t *testing.T) {
	checkConcurrentLocalInvitation(t, localAcceptanceFixture(t))
}
func TestPostgreSQLLocalInvitationConcurrentSingleUse(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a := cloudOwnerFixture(t)
	a.DB = db
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	checkConcurrentLocalInvitation(t, a)
}

func TestLocalInvitationBlankNameUsesEmail(t *testing.T) {
	a := localAcceptanceFixture(t)
	value := localAcceptanceInvitation(t, a, "unnamed@example.com", "writer")
	accepted := request(t, a, "POST", "/api/public/team/accept", Row{"token": value, "email": "unnamed@example.com", "password": localMemberTestPassword, "name": ""}, false)
	expectStatus(t, accepted, 200)
	user := first(a.DB.Must(t.Context(), "SELECT name FROM engine_users WHERE email='unnamed@example.com'"))
	if user.str("name") != "unnamed@example.com" {
		t.Fatal("blank optional name lost email fallback")
	}
}

func TestLocalPeerInvitationRetainsBroaderRoleAndPinsArticle(t *testing.T) {
	a, _, member := memberFixture(t, "publisher")
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("local-extra-review"), true), 201)
	value := localAcceptanceInvitation(t, a, (*member).str("email"), "peer_reviewer")
	a.DB.Must(t.Context(), "UPDATE engine_invitations SET article_id=$1 WHERE token_hash=$2", post["id"], hash(value))
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), localMemberTestPassword), 200)
	principal := a.localMemberPrincipal(t.Context(), (*member).str("subject"))
	if principal.str("role") != "publisher" || principal.str("membershipVersion") != (*member).str("membershipVersion") || !memberReviewArticle(principal, post.str("id")) {
		t.Fatal("peer invite altered existing role or lost article grant")
	}
}
func checkConcurrentLocalSignup(t *testing.T, a *App) {
	t.Helper()
	email := "one-account@example.com"
	tokens := []string{localAcceptanceInvitation(t, a, email, "writer"), localAcceptanceInvitation(t, a, email, "publisher")}
	passwords := []string{"first-account-password", "second-account-password"}
	results := make(chan int, 2)
	var workers sync.WaitGroup
	for i := range 2 {
		workers.Go(func() { results <- acceptInvitationRequest(t, a, tokens[i], email, passwords[i]).Code })
	}
	workers.Wait()
	close(results)
	counts := map[int]int{}
	for status := range results {
		counts[status]++
	}
	if counts[200] != 1 || counts[401] != 1 {
		t.Fatal("concurrent signup authenticated different passwords for one account", counts)
	}
	if len(a.DB.Must(t.Context(), "SELECT id FROM engine_users WHERE email=$1", email)) != 1 {
		t.Fatal("concurrent signup created duplicate accounts")
	}
}
func TestLocalInvitationConcurrentSignupUsesOnePassword(t *testing.T) {
	checkConcurrentLocalSignup(t, localAcceptanceFixture(t))
}
func TestPostgreSQLLocalInvitationConcurrentSignupUsesOnePassword(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a := cloudOwnerFixture(t)
	a.DB = db
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	checkConcurrentLocalSignup(t, a)
}

func TestLocalInvitationCannotReactivateDisabledAccount(t *testing.T) {
	a, _, member := memberFixture(t, "writer")
	value := localAcceptanceInvitation(t, a, (*member).str("email"), "publisher")
	a.DB.Must(t.Context(), "UPDATE engine_users SET enabled=FALSE WHERE id=$1", (*member)["subject"])
	expectStatus(t, acceptInvitationRequest(t, a, value, (*member).str("email"), localMemberTestPassword), 401)
	invitation := first(a.DB.Must(t.Context(), "SELECT status FROM engine_invitations WHERE token_hash=$1", hash(value)))
	if invitation.str("status") != "pending" || a.localMemberPrincipal(t.Context(), (*member).str("subject")) != nil {
		t.Fatal("invitation reactivated disabled account")
	}
}
