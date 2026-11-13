package blog

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func memberFixture(t *testing.T, role string) (*App, *http.Cookie, *Row) {
	t.Helper()
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	member := Row{"authenticated": true, "authVersion": "test-version", "subject": "teammate-subject", "email": "teammate@example.com", "name": "Team Mate", "role": role, "articleIds": []any{}}
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		if input.str("subject") != "central-owner-id" || r.Header.Get("Authorization") != "Bearer "+strings.Repeat("s", 32) {
			t.Fatal("wrong publication binding")
		}
		if r.URL.Path == "/cloud/api/engine-member" && input.str("memberSubject") != "teammate-subject" {
			t.Fatal("wrong member lookup")
		}
		response := fixtureResponse(member)
		if member == nil {
			response.StatusCode = 403
		}
		return response, nil
	})}
	login := request(t, a, "POST", "/api/login", Row{"email": "teammate@example.com", "password": "central-account-password"}, false)
	expectStatus(t, login, 200)
	return a, cloudAuthenticatedCookie(t, login), &member
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
	expectStatus(t, memberRequest(a, cookie, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "Unauthorized live edit"}), 403)
	*member = nil
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 401)
	if len(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash(cookie.Value))) != 0 {
		t.Fatal("revoked session retained")
	}
}
func TestMemberLookupFailsClosedAndMemoizesPerRequest(t *testing.T) {
	a, cookie, member := memberFixture(t, "writer")
	calls := 0
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) { calls++; return fixtureResponse(*member), nil })}
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/session", nil), 200)
	if calls != 1 {
		t.Fatalf("membership checked %d times in one request", calls)
	}
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) { return nil, errors.New("offline") })}
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 503)
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
	for _, path := range []string{"/api/account", "/api/account/connection", "/api/account/email-verification", "/api/ai/checkout", "/api/ai/topups", "/api/ai/billing/portal"} {
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
	*member = nil
	if a.postStreamAuthorized(r) {
		t.Fatal("revoked member stream retained")
	}
}
func TestTeamAcceptCreatesMemberSession(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		if r.URL.Path != "/cloud/api/engine-invite" || input.str("subject") != "central-owner-id" || input.str("email") != "reviewer@example.com" {
			t.Fatal(input, r.URL)
		}
		return fixtureResponse(Row{"authenticated": true, "authVersion": "test-version", "subject": "reviewer-id", "email": "reviewer@example.com", "role": "peer_reviewer", "articleIds": []any{"article-1"}}), nil
	})}
	accepted := request(t, a, "POST", "/api/public/team/accept", Row{"email": "reviewer@example.com", "password": "account-password", "token": strings.Repeat("x", 64)}, false)
	expectStatus(t, accepted, 200)
	cookie := cloudAuthenticatedCookie(t, accepted)
	row := first(a.DB.Must(t.Context(), "SELECT subject FROM session_principals WHERE token_hash=$1", hash(cookie.Value)))
	if row.str("subject") != "reviewer-id" {
		t.Fatal(row)
	}
}

func TestMemberPasswordResetRevokesExistingEngineSession(t *testing.T) {
	a, cookie, member := memberFixture(t, "writer")
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 200)
	(*member)["authVersion"] = "changed-after-password-reset"
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 401)
	if len(a.DB.Must(t.Context(), "SELECT token_hash FROM sessions WHERE token_hash=$1", hash(cookie.Value))) != 0 {
		t.Fatal("credential-change session was not revoked")
	}
}
func TestMemberLoginRequiresCredentialVersion(t *testing.T) {
	a, _, member := memberFixture(t, "writer")
	delete(*member, "authVersion")
	login := request(t, a, "POST", "/api/login", Row{"email": "teammate@example.com", "password": "central-account-password"}, false)
	expectStatus(t, login, 401)
	if len(login.Result().Cookies()) != 0 {
		t.Fatal("versionless member was signed in")
	}
}
