package blog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func peerMemberCookie(t *testing.T, a *App, member Row) *http.Cookie {
	t.Helper()
	if member.str("authVersion") == "" {
		member["authVersion"] = "test-version"
	}
	member["membershipVersion"] = "membership-1"
	grants := Row{}
	for _, id := range member["articleIds"].([]string) {
		grants[id] = "grant-1"
	}
	member["articleGrantVersions"] = grants
	saveMemberFixture(t, a, member)
	r := httptest.NewRequest("POST", "https://notes.pages.example/api/login", nil)
	w := httptest.NewRecorder()
	a.startMemberSession(w, r, member)
	return cloudAuthenticatedCookie(t, w)
}

func peerMemberRequest(a *App, method, path string, input Row, cookie *http.Cookie) *httptest.ResponseRecorder {
	data := ""
	if input != nil {
		data = encode(input)
	}
	r := httptest.NewRequest(method, "https://notes.pages.example"+path, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://notes.pages.example")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}

func TestLocalPeerReviewRequiresBothAccountAndArticleGrant(t *testing.T) {
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("assigned-review"), true), 201)
	other := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("other-review"), true), 201)
	member := Row{"subject": "reviewer-identity", "email": "reviewer@example.com", "name": "Reviewer", "role": "peer_reviewer", "articleIds": []string{post.str("id")}}
	firstID, secondID := token(), token()
	for id, article := range map[string]string{firstID: post.str("id"), secondID: other.str("id")} {
		a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", id, article, member["email"])
	}
	cookie := peerMemberCookie(t, a, member)
	path := "/api/public/reviews/" + firstID
	expectStatus(t, peerMemberRequest(a, "POST", path+"/open", Row{}, cookie), 200)
	expectStatus(t, peerMemberRequest(a, "POST", "/api/public/reviews/"+secondID+"/open", Row{}, cookie), 404)
	for _, route := range []string{"/api/posts", "/api/posts/" + post.str("id"), "/api/posts/" + other.str("id") + "/draft", "/api/settings", "/api/tokens", "/draft/post/other-review"} {
		expectStatus(t, peerMemberRequest(a, "GET", route, nil, cookie), 403)
	}
	list := peerMemberRequest(a, "GET", "/api/public/team/reviews", nil, cookie)
	expectStatus(t, list, 200)
	containsHTML(t, list.Body.String(), firstID)
	excludesHTML(t, list.Body.String(), secondID)
	// A reader login with the invited email cannot bypass the engine membership.
	reader := commentCookie(t, a, "email:reviewer@example.com", "email", member.str("email"))
	expectStatus(t, peerMemberRequest(a, "POST", path+"/open", Row{}, reader), 401)
	removeMemberFixture(t, a, member.str("subject"))
	expectStatus(t, peerMemberRequest(a, "POST", path+"/open", Row{}, cookie), 401)
}

func TestLocalPeerPrivateDocumentsAreArticleScopedAndRevocable(t *testing.T) {
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	doc, unrelated := uuid(), uuid()
	for _, id := range []string{doc, unrelated} {
		must(a.Storage.Put(t.Context(), id, []byte("private PDF")))
		a.DB.Must(t.Context(), "INSERT INTO source_documents(id,object_key,title) VALUES($1,$1,'Source')", id)
	}
	input := draftInput("local-citation")
	input["content"] = `[Citation url="/api/public/documents/` + doc + `"]Evidence[/Citation]`
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	id := token()
	member := Row{"subject": "reviewer-identity", "email": "reviewer@example.com", "name": "Reviewer", "role": "peer_reviewer", "articleIds": []string{post.str("id")}}
	a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", id, post["id"], member["email"])
	cookie := peerMemberCookie(t, a, member)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc+"?review="+id, nil, cookie), 200)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc, nil, cookie), 404)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+unrelated+"?review="+id, nil, cookie), 404)
	member["articleIds"] = []string{}
	member["articleGrantVersions"] = Row{}
	saveMemberFixture(t, a, member)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc+"?review="+id, nil, cookie), 404)
}

func TestLocalPeerInvitationUsesExistingReviewWorkflow(t *testing.T) {
	a := cloudOwnerFixture(t)
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("local-invite"), true), 201)
	var sent Row
	deliveryFailed := true
	a.Client.Transport = localPeerInviteTransport(t, &sent, &deliveryFailed)
	a.DB.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("local-owner-session"), "2100-01-01T00:00:00Z")
	cookie := &http.Cookie{Name: sessionCookieName("margin_session"), Value: "local-owner-session"}
	path := "/api/posts/" + post.str("id") + "/reviews"
	expectStatus(t, peerMemberRequest(a, "POST", path, Row{"email": "reviewer@example.com"}, cookie), 503)
	retained := first(a.DB.Must(t.Context(), "SELECT id FROM peer_reviews WHERE post_id=$1 AND email=$2", post["id"], "reviewer@example.com"))
	if retained == nil {
		t.Fatal("delivery failure discarded the review needed by invitation resend")
	}
	deliveryFailed = false
	invite := responseRow(t, peerMemberRequest(a, "POST", path, Row{"email": "reviewer@example.com"}, cookie), 201)
	if invite.str("id") != retained.str("id") {
		t.Fatal("resend replaced review history")
	}
	assertLocalPeerInvitation(t, a, invite, sent, post)
	// Re-inviting retains the existing review history and local identity binding.
	again := responseRow(t, peerMemberRequest(a, "POST", path, Row{"email": "reviewer@example.com"}, cookie), 201)
	if again.str("id") != invite.str("id") {
		t.Fatal("re-invitation duplicated review history")
	}
}

func assertLocalPeerInvitation(t *testing.T, a *App, invite, sent, post Row) {
	t.Helper()
	stored := first(a.DB.Must(t.Context(), "SELECT * FROM engine_invitations WHERE id=$1", invite["invitationId"]))
	if sent.str("role") != "peer_reviewer" || sent.str("to") != "reviewer@example.com" || sent.str("publicUrl") != "https://notes.pages.example" || stored.str("article_id") != post.str("id") || stored.str("token_hash") != hash(sent.str("invitationToken")) {
		t.Fatal("invitation lost publication or article binding")
	}
	if invite.str("status") != "Requested" || stored == nil {
		t.Fatal(invite)
	}
}

func localPeerInviteTransport(t *testing.T, sent *Row, deliveryFailed *bool) testTransport {
	t.Helper()
	return testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true}), nil
		case "/v1/newsletter/team-invitation":
			must(json.NewDecoder(r.Body).Decode(sent))
			if *deliveryFailed {
				result := fixtureResponse(Row{"error": "Mail delivery unavailable"})
				result.StatusCode = 503
				return result, nil
			}
			return fixtureResponse(Row{"accepted": true}), nil
		default:
			t.Errorf("unexpected remote request %s", r.URL.Path)
			return fixtureResponse(Row{}), nil
		}
	})
}
