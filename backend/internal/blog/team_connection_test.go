package blog

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const selfHostedPublicationID = "11111111-1111-4111-8111-111111111111"
const selfHostedOwnerID = "22222222-2222-4222-8222-222222222222"
const selfHostedKey = "mai_1234567890123456789012345678901234567890"

func TestSelfHostedTeamConnectionRequiresApprovalAndPreservesLocalOwner(t *testing.T) {
	a := registrationFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", selfHostedKey)
	calls, approved := 0, false
	a.Client.Transport = selfHostedConnectionTransport(t, &calls, &approved)
	status := responseRow(t, request(t, a, "GET", "/api/team/connection", nil, true), 200)
	if status.yes("connected") || calls != 0 {
		t.Fatal("read unexpectedly activated team")
	}
	expectStatus(t, request(t, a, "POST", "/api/team/connection", Row{"consent": false}, true), 400)
	expectStatus(t, request(t, a, "POST", "/api/team/connection", Row{"consent": true}, false), 401)
	pending := responseRow(t, request(t, a, "POST", "/api/team/connection", Row{"consent": true}, true), 200)
	if pending.yes("connected") || object(pending["authentication"]).str("url") == "" || a.teamOwnerSubject(t.Context()) != "" {
		t.Fatal(pending)
	}
	approved = true
	response := request(t, a, "POST", "/api/team/connection/complete", Row{}, true)
	connected := responseRow(t, response, 200)
	if !connected.yes("connected") || strings.Contains(response.Body.String(), selfHostedKey) {
		t.Fatal(response.Body.String())
	}
	assertSelfHostedOwnerUnchanged(t, a)
	before := calls
	expectStatus(t, request(t, a, "GET", "/api/team/connection", nil, true), 200)
	if calls != before {
		t.Fatal("connected status performed remote mutation")
	}
}

func selfHostedMemberFixture(t *testing.T, role string) (*App, *http.Cookie, *Row) {
	t.Helper()
	a := registrationFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", selfHostedKey)
	t.Setenv("PUBLIC_URL", "https://notes.pages.example")
	t.Setenv("MARGIN_ENV", "production")
	t.Setenv("MARGIN_COOKIE_DOMAIN", "host-only")
	binding := Row{"subject": selfHostedOwnerID, "publicationId": selfHostedPublicationID, "centralOrigin": "https://central.example"}
	a.DB.Must(t.Context(), "INSERT INTO site_settings(name,configuration) VALUES('team_connection',$1)", encode(binding))
	member := Row{"authenticated": true, "subject": "teammate-subject", "email": "teammate@example.com", "name": "Teammate", "role": role, "authVersion": "auth-1", "membershipVersion": "member-1", "articleIds": []any{}, "articleGrantVersions": map[string]any{}}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		if input.str("subject") != selfHostedPublicationID || r.Header.Get("Authorization") != "Bearer "+selfHostedKey {
			t.Fatal("wrong publication credential or scope")
		}
		response := fixtureResponse(member)
		if member == nil {
			response.StatusCode = 403
		}
		return response, nil
	})
	login := request(t, a, "POST", "/api/login", Row{"email": "teammate@example.com", "password": "margin-member-password"}, false)
	expectStatus(t, login, 200)
	return a, cloudAuthenticatedCookie(t, login), &member
}

func TestSelfHostedTeamLoginPreservesOwnerAndEnforcesRoles(t *testing.T) {
	for _, role := range []string{"writer", "publisher", "peer_reviewer"} {
		t.Run(role, func(t *testing.T) {
			a, cookie, _ := selfHostedMemberFixture(t, role)
			session := responseRow(t, memberRequest(a, cookie, "GET", "/api/session", nil), 200)
			if session.str("role") != role || session.yes("primaryOwner") || session.yes("cloudManaged") || !session.yes("teamConnected") {
				t.Fatal(session)
			}
			expectStatus(t, memberRequest(a, cookie, "POST", "/api/team/connection", Row{"consent": true}), 403)
			expected := 201
			if role == "peer_reviewer" {
				expected = 403
			}
			post := request(t, a, "POST", "/api/posts", Row{"title": "Draft", "slug": "draft", "content": "Private draft"}, true)
			expectStatus(t, post, 201)
			expectStatus(t, memberRequest(a, cookie, "POST", "/api/posts", Row{"title": "Member", "slug": "member", "content": "Member draft"}), expected)
			if role == "peer_reviewer" {
				expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 403)
			}
			digest, err := bcrypt.GenerateFromPassword([]byte("local-owner-password"), bcrypt.MinCost)
			must(err)
			a.DB.Must(t.Context(), "UPDATE admins SET password_hash=$1 WHERE id=1", string(digest))
			a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
				t.Fatal("local owner password forwarded")
				return nil, nil
			})
			local := request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "local-owner-password"}, false)
			expectStatus(t, local, 200)
			ownerSession := responseRow(t, memberRequest(a, cloudAuthenticatedCookie(t, local), "GET", "/api/session", nil), 200)
			if !ownerSession.yes("primaryOwner") || ownerSession["user"] != nil {
				t.Fatal("local owner identity changed", ownerSession)
			}
		})
	}
}

func TestSelfHostedOAuthUsesPublicationMembershipAndRevocation(t *testing.T) {
	a, _, member := selfHostedMemberFixture(t, "writer")
	t.Setenv("PUBLIC_URL", "https://blog.test")
	a.DB.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	a.DB.Must(t.Context(), "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash("browser"), (*member)["subject"], (*member)["authVersion"])
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/posts", Row{"title": "Denied", "slug": "denied", "content": "No", "status": "published"}), 403)
	*member = nil
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
	oauthRefresh(t, a, client, tokens, 400)
}

func TestSelfHostedReviewerOnlyOpensAssignedArticle(t *testing.T) {
	a, cookie, member := selfHostedMemberFixture(t, "peer_reviewer")
	firstPost := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Assigned", "slug": "assigned", "content": "Assigned private draft"}, true), 201)
	otherPost := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Other", "slug": "other", "content": "Other private draft"}, true), 201)
	a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", "assigned-review", firstPost["id"], "teammate@example.com")
	a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", "other-review", otherPost["id"], "teammate@example.com")
	(*member)["articleIds"] = []any{firstPost["id"]}
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/public/reviews/assigned-review/open", Row{}), 200)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/public/reviews/other-review/open", Row{}), 404)
	(*member)["articleIds"] = []any{}
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/public/reviews/assigned-review/open", Row{}), 404)
}

func selfHostedConnectionTransport(t *testing.T, calls *int, approved *bool) testTransport {
	return testTransport(func(r *http.Request) (*http.Response, error) {
		(*calls)++
		if r.URL.Path != "/v1/team/connection" || r.Header.Get("Authorization") != "Bearer "+selfHostedKey {
			t.Fatalf("unexpected connection request: %s", r.URL.Path)
		}
		if *approved {
			return fixtureResponse(Row{"connected": true, "publicationId": selfHostedPublicationID, "ownerSubject": selfHostedOwnerID, "blogUrl": "https://blog.example.com"}), nil
		}
		pending := pendingAccountAuthentication()
		pending["blogUrl"] = "https://blog.example.com"
		pending["authenticationUrl"] = "https://central.example/connect-engine#team=1&request=" + selfHostedPublicationID
		return fixtureResponse(pending), nil
	})
}

func assertSelfHostedOwnerUnchanged(t *testing.T, a *App) {
	t.Helper()
	owner := first(a.DB.Must(t.Context(), "SELECT * FROM admins WHERE id=1"))
	if owner.str("password_hash") != "not-used" || a.cloudOwner(t.Context()).str("subject") != "" {
		t.Fatal("replaced local ownership")
	}
	session := responseRow(t, request(t, a, "GET", "/api/session", nil, false), 200)
	if session.yes("cloudManaged") || !session.yes("teamConnected") || session.str("centralOrigin") != "https://central.example" {
		t.Fatal(session)
	}
}

func TestSelfHostedTeamDoesNotSendReconfiguredCredentialToOldService(t *testing.T) {
	a, cookie, _ := selfHostedMemberFixture(t, "writer")
	t.Setenv("AI_SERVICE_URL", "https://different-margin.example")
	t.Setenv("AI_SERVICE_TOKEN", "mai_new-private-account-credential-123456789")
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("reconfigured credential sent to old service")
		return nil, nil
	})
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/posts", nil), 503)
}

func TestSelfHostedTeamRejectsCredentialForDifferentMountedPublication(t *testing.T) {
	a := registrationFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", selfHostedKey)
	t.Setenv("PUBLIC_URL", "https://blog.example.com/another-blog")
	t.Setenv("MARGIN_BASE_PATH", "/another-blog")
	a.Client.Transport = selfHostedConnectionTransport(t, new(int), new(bool))
	expectStatus(t, request(t, a, "POST", "/another-blog/api/team/connection", Row{"consent": true}, true), 409)
	approved := true
	a.Client.Transport = selfHostedConnectionTransport(t, new(int), &approved)
	expectStatus(t, request(t, a, "POST", "/another-blog/api/team/connection/complete", Row{}, true), 409)
	if a.teamOwnerSubject(t.Context()) != "" {
		t.Fatal("accepted a different publication's team")
	}
}
