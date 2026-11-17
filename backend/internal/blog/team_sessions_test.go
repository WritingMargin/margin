package blog

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const localMemberTestPassword = "engine-account-password"

// Membership and credentials live on this engine, including when no hosted
// publication or account-service connection has been configured.
func memberFixture(t *testing.T, role string) (*App, *http.Cookie, *Row) {
	t.Helper()
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	member := Row{"authenticated": true, "authVersion": "test-version", "membershipVersion": "membership-1", "subject": "teammate-subject", "email": "teammate@example.com", "name": "Team Mate", "role": role, "articleIds": []any{}, "articleGrantVersions": Row{}}
	saveMemberFixture(t, a, member)
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		t.Errorf("local account unexpectedly called %s", r.URL.Path)
		return nil, fmt.Errorf("account service unavailable")
	})}
	login := request(t, a, "POST", "/api/login", Row{"email": member["email"], "password": localMemberTestPassword}, false)
	expectStatus(t, login, 200)
	return a, cloudAuthenticatedCookie(t, login), &member
}
func saveMemberFixture(t *testing.T, a *App, member Row) {
	t.Helper()
	password, err := bcrypt.GenerateFromPassword([]byte(localMemberTestPassword), bcrypt.MinCost)
	must(err)
	a.DB.Must(t.Context(), `INSERT INTO engine_users(id,email,name,password_hash,auth_version) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,auth_version=excluded.auth_version`, member["subject"], member["email"], member.str("name"), string(password), member.str("authVersion"))
	a.DB.Must(t.Context(), `INSERT INTO engine_memberships(user_id,role,version) VALUES($1,$2,$3)
 ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,version=excluded.version`, member["subject"], member["role"], member.str("membershipVersion"))
	a.DB.Must(t.Context(), "DELETE FROM engine_article_grants WHERE user_id=$1", member["subject"])
	for id, version := range oauthArticleVersions(member) {
		a.DB.Must(t.Context(), `INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES($1,$1,$1,'','draft',$1,'fixture') ON CONFLICT(id) DO NOTHING`, id)
		a.DB.Must(t.Context(), "INSERT INTO engine_article_grants(user_id,post_id,version) VALUES($1,$2,$3)", member["subject"], id, version)
	}
}
func removeMemberFixture(t *testing.T, a *App, subject string) {
	t.Helper()
	a.DB.Must(t.Context(), "DELETE FROM engine_memberships WHERE user_id=$1", subject)
}
func memberRequest(a *App, cookie *http.Cookie, method, path string, input Row) *httptest.ResponseRecorder {
	data := ""
	if input != nil {
		data = encode(input)
	}
	r := httptest.NewRequest(method, "https://notes.pages.example"+path, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://notes.pages.example")
	r.AddCookie(cookie)
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestMemberSessionIdentityAndRevisionAuthor(t *testing.T) {
	a, cookie, _ := memberFixture(t, "writer")
	session := responseRow(t, memberRequest(a, cookie, "GET", "/api/session", nil), 200)
	if session.str("role") != "writer" || object(session["user"]).str("id") != "teammate-subject" || session.yes("primaryOwner") {
		t.Fatal(session)
	}
	if session["ownerEmail"] != nil {
		t.Fatal("owner account leaked into member identity")
	}
	post := responseRow(t, memberRequest(a, cookie, "POST", "/api/posts", Row{"title": "Shared draft", "slug": "shared-draft", "content": "Member wrote this"}), 201)
	author := object(post["author"])
	if author.str("kind") != "member" || author.str("id") != "teammate-subject" || author.str("name") != "teammate@example.com" {
		t.Fatal(author)
	}
	expectStatus(t, memberRequest(a, cookie, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "published"}), 403)
}
func TestMemberWriterReadsEditorSettingsButCannotAdminister(t *testing.T) {
	a, cookie, _ := memberFixture(t, "writer")
	for _, path := range []string{"/api/settings", "/api/settings/profile", "/api/settings/media"} {
		expectStatus(t, memberRequest(a, cookie, "GET", path, nil), 200)
	}
	expectStatus(t, memberRequest(a, cookie, "PUT", "/api/settings", Row{}), 403)
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/team", nil), 403)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/tokens", Row{"name": "escape"}), 403)
}
func TestMemberRevocationAndRoleChangesApplyToExistingSessions(t *testing.T) {
	a, cookie, member := memberFixture(t, "publisher")
	post := responseRow(t, memberRequest(a, cookie, "POST", "/api/posts", Row{"title": "Live post", "slug": "live-post", "content": "First", "status": "published"}), 201)
	(*member)["role"] = "writer"
	saveMemberFixture(t, a, *member)
	expectStatus(t, memberRequest(a, cookie, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "Unauthorized live edit"}), 403)
	removeMemberFixture(t, a, (*member).str("subject"))
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 401)
	if len(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash(cookie.Value))) != 0 {
		t.Fatal("revoked session retained")
	}
}
func TestMemberSessionDoesNotDependOnRemoteIdentity(t *testing.T) {
	a, cookie, _ := memberFixture(t, "writer")
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/session", nil), 200)
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 200)
	if a.cloudOwner(t.Context()).str("subject") != "" {
		t.Fatal("fixture unexpectedly depends on a hosted identity")
	}
}
func TestMemberPrincipalMemoizesOnlyWithinRequest(t *testing.T) {
	a, cookie, member := memberFixture(t, "writer")
	r := httptest.NewRequest("GET", "https://notes.pages.example/api/posts", nil)
	r.AddCookie(cookie)
	cached := r.WithContext(context.WithValue(r.Context(), browserPrincipalKey{}, &browserPrincipalCache{}))
	if a.browserPrincipal(cached).str("role") != "writer" {
		t.Fatal("local writer not authenticated")
	}
	(*member)["role"] = "publisher"
	saveMemberFixture(t, a, *member)
	if a.browserPrincipal(cached).str("role") != "writer" {
		t.Fatal("request changed membership snapshot")
	}
	if a.browserPrincipal(r).str("role") != "publisher" {
		t.Fatal("membership snapshot escaped request lifetime")
	}
}
func TestPeerReviewerCannotUseUnscopedContentOrPrivateMedia(t *testing.T) {
	a, cookie, _ := memberFixture(t, "peer_reviewer")
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 403)
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/settings", nil), 403)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/posts", Row{"title": "No"}), 403)
	r := httptest.NewRequest("GET", "https://notes.pages.example/assets/private", nil)
	r.AddCookie(cookie)
	if a.privateMediaAllowed(r, "content:read") {
		t.Fatal("reviewer granted all private media")
	}
	if a.postStreamAuthorized(r) {
		t.Fatal("reviewer granted all post streams")
	}
}
func TestInvitedOwnerCannotCreateUnrevocableCredentials(t *testing.T) {
	a, cookie, member := memberFixture(t, "owner")
	(*member)["membershipVersion"] = "membership-1"
	saveMemberFixture(t, a, *member)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/tokens", Row{"name": "escape", "role": "owner"}), 403)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/tokens/cli/approve", Row{"code": "ABCD-EFGH-IJKL"}), 403)
	r := httptest.NewRequest("GET", "https://notes.pages.example/oauth/authorize", nil)
	r.AddCookie(cookie)
	if !a.oauthActor(r).IsBrowserSession {
		t.Fatal("invited owner cannot delegate revocable member grants")
	}
}
func TestInvitedOwnerCannotManagePrimaryAccountOrBilling(t *testing.T) {
	a, cookie, _ := memberFixture(t, "owner")
	t.Setenv("AI_SERVICE_TOKEN", "")
	for _, path := range []string{"/api/account", "/api/account/connection", "/api/account/email-verification", "/api/ai/checkout", "/api/ai/topups", "/api/ai/billing/portal", "/api/ai/billing/stop"} {
		result := responseRow(t, memberRequest(a, cookie, "POST", path, Row{"consent": true}), 403)
		if result.str("code") != "PERMISSION_DENIED" {
			t.Fatal(path, result)
		}
	}
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/account/email-verification", nil), 403)
	// Publication feature readiness remains available to invited owners.
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/account", nil), 200)
	if len(a.DB.Must(t.Context(), "SELECT id FROM central_connection")) != 0 {
		t.Fatal("invited owner changed the publication account")
	}
}

func TestPostStreamRechecksMembership(t *testing.T) {
	a, cookie, member := memberFixture(t, "writer")
	r := httptest.NewRequest("GET", "https://notes.pages.example/api/posts/id/events", nil)
	r.AddCookie(cookie)
	if !a.postStreamAuthorized(r) {
		t.Fatal("writer stream rejected")
	}
	removeMemberFixture(t, a, (*member).str("subject"))
	if a.postStreamAuthorized(r) {
		t.Fatal("revoked member stream retained")
	}
}
func TestTeamAcceptCreatesMemberSession(t *testing.T) {
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	invite := strings.Repeat("a", 64)
	a.DB.Must(t.Context(), `INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES('article-1','Review','review','','draft','article-1','fixture')`)
	a.DB.Must(t.Context(), "INSERT INTO engine_invitations(id,email,role,article_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)", "invitation-1", "reviewer@example.com", "peer_reviewer", "article-1", hash(invite), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	accepted := request(t, a, "POST", "/api/public/team/accept", Row{"email": "reviewer@example.com", "name": "Reviewer", "password": localMemberTestPassword, "token": invite}, false)
	expectStatus(t, accepted, 200)
	cookie := cloudAuthenticatedCookie(t, accepted)
	row := first(a.DB.Must(t.Context(), "SELECT subject FROM session_principals WHERE token_hash=$1", hash(cookie.Value)))
	principal := a.localMemberPrincipal(t.Context(), row.str("subject"))
	if principal.str("email") != "reviewer@example.com" || principal.str("role") != "peer_reviewer" || oauthArticleVersions(principal)["article-1"] == "" {
		t.Fatal(principal)
	}
}

func TestMemberPasswordResetRevokesExistingEngineSession(t *testing.T) {
	a, cookie, member := memberFixture(t, "writer")
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 200)
	(*member)["authVersion"] = "changed-after-password-reset"
	saveMemberFixture(t, a, *member)
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 401)
	if len(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash(cookie.Value))) != 0 {
		t.Fatal("credential-change session was not revoked")
	}
}
func TestMemberLoginRequiresCredentialVersion(t *testing.T) {
	a, _, member := memberFixture(t, "writer")
	delete(*member, "authVersion")
	saveMemberFixture(t, a, *member)
	login := request(t, a, "POST", "/api/login", Row{"email": "teammate@example.com", "password": localMemberTestPassword}, false)
	expectStatus(t, login, 401)
	if len(login.Result().Cookies()) != 0 {
		t.Fatal("versionless member was signed in")
	}
}

func TestMemberAccountsRemainIndependentAcrossEngines(t *testing.T) {
	firstEngine, firstCookie, reviewer := memberFixture(t, "peer_reviewer")
	(*reviewer)["articleGrantVersions"] = Row{"first-engine-article": "first-grant"}
	saveMemberFixture(t, firstEngine, *reviewer)
	secondEngine, secondCookie, publisher := memberFixture(t, "publisher")
	secondPassword := "second-engine-password"
	digest, err := bcrypt.GenerateFromPassword([]byte(secondPassword), bcrypt.MinCost)
	must(err)
	secondEngine.DB.Must(t.Context(), "UPDATE engine_users SET password_hash=$1 WHERE id=$2", string(digest), (*publisher)["subject"])
	// Identical emails (and even coincidentally equal local IDs) do not share
	// passwords, sessions, roles or article delegations between engine databases.
	for _, item := range []struct {
		app      *App
		password string
		status   int
	}{
		{firstEngine, localMemberTestPassword, 200}, {firstEngine, secondPassword, 401},
		{secondEngine, localMemberTestPassword, 401}, {secondEngine, secondPassword, 200},
	} {
		expectStatus(t, request(t, item.app, "POST", "/api/login", Row{"email": (*reviewer)["email"], "password": item.password}, false), item.status)
	}
	expectStatus(t, memberRequest(firstEngine, firstCookie, "GET", "/api/posts", nil), 403)
	expectStatus(t, memberRequest(secondEngine, secondCookie, "GET", "/api/posts", nil), 200)
	expectStatus(t, memberRequest(firstEngine, secondCookie, "GET", "/api/posts", nil), 401)
	expectStatus(t, memberRequest(secondEngine, firstCookie, "GET", "/api/posts", nil), 401)
	first := firstEngine.localMemberPrincipal(t.Context(), (*reviewer).str("subject"))
	second := secondEngine.localMemberPrincipal(t.Context(), (*publisher).str("subject"))
	if !memberReviewArticle(first, "first-engine-article") || memberReviewArticle(second, "first-engine-article") {
		t.Fatal("article delegation crossed engine boundary")
	}
	removeMemberFixture(t, firstEngine, first.str("subject"))
	expectStatus(t, memberRequest(firstEngine, firstCookie, "GET", "/api/public/team/reviews", nil), 401)
	expectStatus(t, memberRequest(secondEngine, secondCookie, "GET", "/api/posts", nil), 200)
}
