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

func TestCentralPeerReviewRequiresBothAccountAndArticleGrant(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("assigned-review"), true), 201)
	other := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("other-review"), true), 201)
	member := Row{"subject": "reviewer-identity", "email": "reviewer@example.com", "name": "Reviewer", "role": "peer_reviewer", "articleIds": []string{post.str("id")}}
	firstID, secondID := token(), token()
	for id, article := range map[string]string{firstID: post.str("id"), secondID: other.str("id")} {
		a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", id, article, member["email"])
	}
	active := true
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/cloud/api/engine-member" {
			t.Fatalf("unexpected Central request %s", r.URL.Path)
		}
		if active {
			return fixtureResponse(member), nil
		}
		res := fixtureResponse(Row{"error": "Membership removed"})
		res.StatusCode = http.StatusForbidden
		return res, nil
	})
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
	// A reader login with the invited email cannot bypass the Central membership.
	reader := commentCookie(t, a, "email:reviewer@example.com", "email", member.str("email"))
	expectStatus(t, peerMemberRequest(a, "POST", path+"/open", Row{}, reader), 401)
	active = false
	expectStatus(t, peerMemberRequest(a, "POST", path+"/open", Row{}, cookie), 401)
}

func TestCentralPeerPrivateDocumentsAreArticleScopedAndRevocable(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	doc, unrelated := uuid(), uuid()
	for _, id := range []string{doc, unrelated} {
		must(a.Storage.Put(t.Context(), id, []byte("private PDF")))
		a.DB.Must(t.Context(), "INSERT INTO source_documents(id,object_key,title) VALUES($1,$1,'Source')", id)
	}
	input := draftInput("central-citation")
	input["content"] = `[Citation url="/api/public/documents/` + doc + `"]Evidence[/Citation]`
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	id := token()
	member := Row{"subject": "reviewer-identity", "email": "reviewer@example.com", "name": "Reviewer", "role": "peer_reviewer", "articleIds": []string{post.str("id")}}
	a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", id, post["id"], member["email"])
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return fixtureResponse(member), nil })
	cookie := peerMemberCookie(t, a, member)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc+"?review="+id, nil, cookie), 200)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc, nil, cookie), 404)
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+unrelated+"?review="+id, nil, cookie), 404)
	member["articleIds"] = []string{}
	expectStatus(t, peerMemberRequest(a, "GET", "/api/public/documents/"+doc+"?review="+id, nil, cookie), 404)
}

func TestCentralPeerInvitationUsesExistingReviewWorkflow(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("central-invite"), true), 201)
	owner := Row{"subject": "central-owner-id", "email": "owner@example.com", "name": "Owner", "role": "owner", "articleIds": []string{}}
	var sent Row
	deliveryFailed := true
	a.Client.Transport = centralPeerInviteTransport(t, owner, &sent, &deliveryFailed)
	cookie := peerMemberCookie(t, a, owner)
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
	if sent.str("role") != "peer_reviewer" || sent.str("articleId") != post.str("id") || sent.str("actorSubject") != owner.str("subject") {
		t.Fatal("invitation lost its publication, actor or article scope", sent)
	}
	if invite.str("status") != "Requested" || invite.str("invitationId") != "central-invitation" {
		t.Fatal(invite)
	}
	// Re-inviting an existing local reviewer migrates their access to Central.
	again := responseRow(t, peerMemberRequest(a, "POST", path, Row{"email": "reviewer@example.com"}, cookie), 201)
	if again.str("id") != invite.str("id") {
		t.Fatal("re-invitation duplicated review history")
	}
}

func centralPeerInviteTransport(t *testing.T, owner Row, sent *Row, deliveryFailed *bool) testTransport {
	t.Helper()
	return testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cloud/api/engine-member" {
			return fixtureResponse(owner), nil
		}
		if r.URL.Path != "/cloud/api/engine-team" {
			t.Fatalf("unexpected Central request %s", r.URL.Path)
		}
		must(json.NewDecoder(r.Body).Decode(sent))
		if *deliveryFailed {
			result := fixtureResponse(Row{"error": "Mail delivery unavailable"})
			result.StatusCode = 503
			return result, nil
		}
		return fixtureResponse(Row{"id": "central-invitation", "status": "pending"}), nil
	})
}
