package blog

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func oauthMemberFixture(t *testing.T, role string) (*App, *Row) {
	t.Helper()
	a, _, member := memberFixture(t, role)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	(*member)["membershipVersion"] = "membership-1"
	(*member)["articleGrantVersions"] = map[string]any{}
	a.DB.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	a.DB.Must(t.Context(), "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash("browser"), (*member)["subject"], (*member)["authVersion"])
	return a, member
}
func oauthRefresh(t *testing.T, a *App, client, tokens Row, status int) Row {
	t.Helper()
	return responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {client.str("client_id")}, "refresh_token": {tokens.str("refresh_token")}}, false), status)
}
func TestOAuthMemberScopeCeilingsAndExchangeDowngrade(t *testing.T) {
	a, member := oauthMemberFixture(t, "publisher")
	client := oauthRegisterTest(t, a, "content:read content:draft content:publish settings:manage")
	form := oauthConsentForm(t, a, oauthQuery(client.str("client_id"), "content:read content:draft content:publish settings:manage", "https://blog.test/api"))
	// Even when a client requests owner permissions, a publisher can only approve
	// the subset held by their own account. Forging a hidden choice is denied.
	form["permission"] = []string{"settings:manage"}
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/consent", form, true), 403)
	form["permission"] = []string{"content:read", "content:draft", "content:publish"}
	w := oauthHTTPRequest(a, "POST", "/oauth/consent", form, true)
	expectStatus(t, w, 303)
	target, _ := url.Parse(w.Header().Get("Location"))
	(*member)["role"] = "writer"
	tokens := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), target.Query().Get("code")), false), 200)
	if tokens.str("scope") != "content:read content:draft" {
		t.Fatal("exchange ignored current role", tokens["scope"])
	}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/posts", Row{"title": "Draft", "slug": "member-draft", "content": "text"}), 201)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/posts", Row{"title": "Live", "slug": "member-live", "content": "text", "status": "published"}), 403)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/settings", nil), 403)
	expectStatus(t, oauthHTTPRequest(a, "GET", "/api/oauth/connections", nil, true), 200)
	expectStatus(t, oauthHTTPRequest(a, "GET", "/api/oauth/clients", nil, true), 403)
}
func TestOAuthMemberCurrentRoleCapsAccessAndRefresh(t *testing.T) {
	a, member := oauthMemberFixture(t, "publisher")
	client, tokens := oauthTokenTest(t, a, "publisher", "https://blog.test/api")
	(*member)["role"] = "writer"
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/posts", Row{"title": "Live", "slug": "role-live", "content": "text", "status": "published"}), 403)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	next := oauthRefresh(t, a, client, tokens, 200)
	if strings.Contains(next.str("scope"), "content:publish") {
		t.Fatal("refresh restored lost publish scope")
	}
}
func TestOAuthMemberOutageDoesNotRevoke(t *testing.T) {
	a, _ := oauthMemberFixture(t, "writer")
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	healthy := a.Client
	a.Client = &http.Client{Transport: testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("Central unavailable") })}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 503)
	oauthRefresh(t, a, client, tokens, 503)
	a.Client = healthy
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	oauthRefresh(t, a, client, tokens, 200)
}
func TestOAuthMemberRemovalAndCredentialChangesPersist(t *testing.T) {
	for _, change := range []string{"removed", "authVersion", "membershipVersion"} {
		t.Run(change, func(t *testing.T) {
			a, member := oauthMemberFixture(t, "writer")
			client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
			before := Row{}
			for k, v := range *member {
				before[k] = v
			}
			if change == "removed" {
				*member = nil
			} else {
				(*member)[change] = "changed"
			}
			expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
			*member = before
			expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
			oauthRefresh(t, a, client, tokens, 400)
		})
	}
}
func TestOAuthOldIncarnationCannotRevokeRejoinedMember(t *testing.T) {
	a, member := oauthMemberFixture(t, "writer")
	client, old := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	(*member)["membershipVersion"] = "rejoined"
	code := oauthCodeTest(t, a, client.str("client_id"), "writer", "https://blog.test/api")
	fresh := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), code), false), 200)
	expectStatus(t, tokenRequest(a, old.str("access_token"), "GET", "/api/posts", nil), 401)
	expectStatus(t, tokenRequest(a, fresh.str("access_token"), "GET", "/api/posts", nil), 200)
	oauthRefresh(t, a, client, old, 400)
	expectStatus(t, tokenRequest(a, fresh.str("access_token"), "GET", "/api/posts", nil), 200)
}
func TestOAuthCodeRejectsChangedMembership(t *testing.T) {
	a, member := oauthMemberFixture(t, "writer")
	client := oauthRegisterTest(t, a, "writer")
	code := oauthCodeTest(t, a, client.str("client_id"), "writer", "https://blog.test/api")
	(*member)["membershipVersion"] = "rejoined"
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), code), false), 400)
	(*member)["membershipVersion"] = "membership-1"
	expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), code), false), 400)
}
func TestOAuthReviewerConsentPinsArticleGrantVersions(t *testing.T) {
	a, member := oauthMemberFixture(t, "peer_reviewer")
	(*member)["articleIds"] = []any{"article-a"}
	(*member)["articleGrantVersions"] = map[string]any{"article-a": "grant-a"}
	_, tokens := oauthTokenTest(t, a, "review:assigned", "https://blog.test/api")
	access := tokens.str("access_token")
	expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), 403)
	(*member)["articleIds"] = []any{"article-a", "article-b"}
	(*member)["articleGrantVersions"] = map[string]any{"article-a": "grant-a", "article-b": "grant-b"}
	r := httptest.NewRequest("GET", "https://blog.test/api/public/team/reviews", nil)
	principal := a.oauthPrincipal(r, access)
	ids := principal["articleIds"].([]string)
	if len(ids) != 1 || ids[0] != "article-a" {
		t.Fatal("later invitation expanded consent", ids)
	}
	(*member)["articleGrantVersions"] = map[string]any{"article-a": "grant-a-reinvited", "article-b": "grant-b"}
	if a.oauthPrincipal(r, access) != nil {
		t.Fatal("recreated article grant restored old consent")
	}
}
func TestOAuthSameClientIndependentMemberConsents(t *testing.T) {
	a, member := oauthMemberFixture(t, "writer")
	firstMember := *member
	second := Row{"subject": "second-member", "email": "second@example.test", "role": "publisher", "authVersion": "second-auth", "membershipVersion": "second-membership", "articleGrantVersions": map[string]any{}}
	identities := map[string]Row{firstMember.str("subject"): firstMember, second.str("subject"): second}
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		var input Row
		must(json.NewDecoder(r.Body).Decode(&input))
		return fixtureResponse(identities[input.str("memberSubject")]), nil
	})}
	client := oauthRegisterTest(t, a, "publisher")
	firstCode := oauthCodeTest(t, a, client.str("client_id"), "writer", "https://blog.test/api")
	firstTokens := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), firstCode), false), 200)
	a.DB.Must(t.Context(), "UPDATE session_principals SET subject=$1,auth_version=$2 WHERE token_hash=$3", second["subject"], second["authVersion"], hash("browser"))
	secondCode := oauthCodeTest(t, a, client.str("client_id"), "publisher", "https://blog.test/api")
	secondTokens := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), secondCode), false), 200)
	expectStatus(t, tokenRequest(a, firstTokens.str("access_token"), "GET", "/api/posts", nil), 200)
	expectStatus(t, tokenRequest(a, secondTokens.str("access_token"), "GET", "/api/posts", nil), 200)
	rows := a.DB.Must(t.Context(), "SELECT client_id,subject_id FROM oauth_consents")
	if len(rows) != 2 {
		t.Fatal("one member overwrote the other consent", rows)
	}
	expectStatus(t, oauthHTTPRequest(a, "DELETE", "/api/oauth/connections/"+rows[0].str("client_id"), nil, true), 200)
	expectStatus(t, tokenRequest(a, secondTokens.str("access_token"), "GET", "/api/posts", nil), 401)
	expectStatus(t, tokenRequest(a, firstTokens.str("access_token"), "GET", "/api/posts", nil), 200)
	oauthRefresh(t, a, client, firstTokens, 200)
}

func TestOAuthMemberConsentCancelAndRequestSnapshot(t *testing.T) {
	a, _ := oauthMemberFixture(t, "writer")
	client := oauthRegisterTest(t, a, "content:read settings:manage")
	form := oauthConsentForm(t, a, oauthQuery(client.str("client_id"), "content:read settings:manage", "https://blog.test/api"))
	form.Set("decision", "deny")
	denied := oauthHTTPRequest(a, "POST", "/oauth/consent", form, true)
	expectStatus(t, denied, 303)
	target, _ := url.Parse(denied.Header().Get("Location"))
	if target.Query().Get("error") != "access_denied" {
		t.Fatal(target)
	}
	_, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	previous := a.Client.Transport
	calls := 0
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) { calls++; return previous.RoundTrip(r) })}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	if calls != 1 {
		t.Fatalf("one API request did %d Central lookups", calls)
	}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	if calls != 2 {
		t.Fatal("membership snapshot escaped request lifetime")
	}
}
func TestOAuthInvitedOwnerCannotDelegatePrimaryAccount(t *testing.T) {
	a, _ := oauthMemberFixture(t, "owner")
	_, tokens := oauthTokenTest(t, a, "administration:manage", "https://blog.test/api")
	for _, path := range []string{"/api/account", "/api/account/connection", "/api/account/email-verification", "/api/ai/checkout", "/api/ai/topups", "/api/ai/billing/portal", "/api/ai/billing/stop"} {
		expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", path, Row{"consent": true}), 403)
	}
}
func TestOAuthPrimaryOwnerCanDisconnectLegacyGrant(t *testing.T) {
	a := oauthFixture(t)
	_, tokens := oauthTokenTest(t, a, "reader", "https://blog.test/api")
	t.Setenv("SETUP_TOKEN", strings.Repeat("s", 32))
	a.DB.Must(t.Context(), "INSERT INTO site_settings(name,configuration) VALUES('cloud_owner',$1)", encode(Row{"subject": "primary-central", "centralOrigin": "https://central.example.test"}))
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"subject": "primary-central", "role": "owner", "primaryOwner": true, "authVersion": "primary-auth", "membershipVersion": "primary-membership", "articleGrantVersions": map[string]any{}}), nil
	})}
	listing := oauthHTTPRequest(a, "GET", "/api/oauth/connections", nil, true)
	expectStatus(t, listing, 200)
	var apps []Row
	must(json.Unmarshal(listing.Body.Bytes(), &apps))
	if len(apps) != 1 {
		t.Fatal("legacy connection hidden from current primary owner", apps)
	}
	expectStatus(t, oauthHTTPRequest(a, "DELETE", "/api/oauth/connections/"+apps[0].str("id"), nil, true), 200)
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 401)
}

func TestPostgreSQLOAuthMemberSubject(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, member := oauthMemberFixture(t, "writer")
	binding := a.cloudOwner(t.Context())
	a.DB = db
	db.Must(t.Context(), "INSERT INTO admins(id,email,password_hash) VALUES(1,'owner@example.test','unused')")
	db.Must(t.Context(), "INSERT INTO site_settings(name,configuration) VALUES('cloud_owner',$1)", encode(binding))
	db.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	db.Must(t.Context(), "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash("browser"), (*member)["subject"], (*member)["authVersion"])
	client, tokens := oauthTokenTest(t, a, "writer", "https://blog.test/api")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/posts", nil), 200)
	oauthRefresh(t, a, client, tokens, 200)
}
