package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestPeerReviewCycle(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	var mail Row
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/newsletter/peer-review" {
			return fixtureResponse(paidAccount()), nil
		}
		must(json.NewDecoder(r.Body).Decode(&mail))
		return fixtureResponse(Row{"accepted": true}), nil
	})
	input := draftInput("peer-review")
	input["content"] = "The sample included ten people."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	author := "/api/posts/" + post.str("id")
	email := "reviewer@example.test"
	invitation := responseRow(t, request(t, a, "POST", author+"/reviews", Row{"email": email}, true), 201)
	if mail.str("invite") != invitation.str("id") || mail.str("to") != email {
		t.Fatal(mail)
	}
	path := "/api/public/reviews/" + invitation.str("id")
	reviewer := commentCookie(t, a, "google:peer", "google", email)
	checkPeerAccess(t, a, path, author, email, reviewer)
	call := func(action string, input Row, status int) Row {
		t.Helper()
		return responseRow(t, commentAuthRequest(a, "POST", path+"/"+action, input, reviewer, "http://blog.test"), status)
	}
	if call("open", Row{}, 200).str("status") != "In review" {
		t.Fatal("review not opened")
	}
	note := Row{"quote": "ten people", "body": "PRIVATE note about sample size", "revision": post["revision"], "submissionId": uuid()}
	call("notes", note, 201)
	call("notes", note, 200)
	if notes := a.peerNotes(context.Background(), invitation.str("id")); len(notes) != 1 {
		t.Fatal(notes)
	}
	if call("open", Row{}, 200).yes("canApprove") {
		t.Fatal("approval available with unresolved note")
	}
	call("approve", Row{"revision": post["revision"], "badge": true, "name": "Reviewer"}, 409)
	newDraft := responseRow(t, request(t, a, "PUT", author+"/draft", Row{"revision": post["revision"], "content": "The sample included twelve people."}, true), 200)
	id := a.peerNotes(context.Background(), invitation.str("id"))[0].str("id")
	expectStatus(t, request(t, a, "POST", author+"/reviews/notes/"+id+"/address", Row{"revision": post["revision"]}, true), 409)
	eligible := request(t, a, "GET", author+"/reviews/notes/"+id+"/revisions", nil, true)
	expectStatus(t, eligible, 200)
	containsHTML(t, eligible.Body.String(), newDraft.str("revision"))
	excludesHTML(t, eligible.Body.String(), post.str("revision"))
	expectStatus(t, request(t, a, "POST", author+"/reviews/notes/"+id+"/address", Row{"revision": newDraft["revision"]}, true), 200)
	checkReturningReview(t, a, path, id, reviewer, post, newDraft)
	call("approve", Row{"revision": newDraft["revision"], "badge": true, "name": "Dr. Lee"}, 200)
	expectStatus(t, request(t, a, "POST", author+"/draft/publish", Row{"revision": newDraft["revision"]}, true), 200)
	page := request(t, a, "GET", "/post/peer-review", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), "Reviewed by Dr. Lee")
	excludesHTML(t, page.Body.String(), "PRIVATE note", email, invitation.str("id"))
	call("open", Row{}, 404)
}

func TestPeerApprovalAndDiscardScope(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("peer-staged")
	input["status"] = "published"
	live := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	base := "/api/posts/" + live.str("id") + "/draft"
	stage := func(revision any) Row {
		return responseRow(t, request(t, a, "PUT", base, Row{"revision": revision, "content": "Staged content"}, true), 200)
	}
	draft := stage(live["revision"])
	id := token()
	email := "peer@example.test"
	a.DB.Must(context.Background(), "INSERT INTO peer_reviews(id,email,post_id) VALUES($1,$2,$3)", id, email, live["id"])
	reviewer := commentCookie(t, a, "google:peer", "google", email)
	path := "/api/public/reviews/" + id
	approve := func(row Row) {
		expectStatus(t, commentAuthRequest(a, "POST", path+"/approve", Row{"revision": row["revision"], "badge": false}, reviewer, "http://blog.test"), 200)
	}
	approve(draft)
	draft = stage(draft["revision"])
	visit := responseRow(t, commentAuthRequest(a, "POST", path+"/open", Row{}, reviewer, "http://blog.test"), 200)
	if visit.str("status") != "Changes made" {
		t.Fatal(visit)
	}
	expectStatus(t, request(t, a, "DELETE", base, Row{"revision": draft["revision"]}, true), 200)
	stage(live["revision"])
	expectStatus(t, commentAuthRequest(a, "POST", path+"/open", Row{}, reviewer, "http://blog.test"), 404)
}

func TestReviewPDFRequiresCitedDocumentAndInvitedAccount(t *testing.T) {
	a, _ := coreFixture(t)
	ctx := context.Background()
	doc, other := uuid(), uuid()
	for _, id := range []string{doc, other} {
		must(a.Storage.Put(ctx, id, []byte("private PDF")))
		a.DB.Must(ctx, "INSERT INTO source_documents(id,object_key,title) VALUES($1,$1,'Source')", id)
	}
	input := draftInput("cited-paper")
	input["content"] = `[Citation url="/api/public/documents/` + doc + `"]Evidence[/Citation]`
	draft := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	id := token()
	email := "peer@example.test"
	a.DB.Must(ctx, "INSERT INTO peer_reviews(id,email,post_id) VALUES($1,$2,$3)", id, email, draft["id"])
	reviewer := commentCookie(t, a, "google:peer", "google", email)
	for _, route := range []string{"/api/public/documents/", "/sources/"} {
		path := route + doc + "?review=" + id
		expectStatus(t, commentAuthRequest(a, "GET", path, nil, nil, ""), 404)
		expectStatus(t, commentAuthRequest(a, "GET", path, nil, reviewer, ""), 200)
		expectStatus(t, commentAuthRequest(a, "GET", route+other+"?review="+id, nil, reviewer, ""), 404)
	}
	// Closing the invitation withdraws access from subsequent byte-range requests too.
	a.DB.Must(ctx, "UPDATE peer_reviews SET closed=TRUE WHERE id=$1", id)
	expectStatus(t, commentAuthRequest(a, "GET", "/api/public/documents/"+doc+"?review="+id, nil, reviewer, ""), 404)
}

func TestReviewPassageTracksARepeatedQuoteAfterInsertion(t *testing.T) {
	note := Row{"quote": "Here", "occurrence": int64(1)}
	locateReviewPassage(note, "Original. Here. Section two. Here.", "Here. Original. Here. Section two. Here.")
	if note["occurrence"] != 2 || note["anchorStatus"] != nil {
		t.Fatal(note)
	}
}

func checkPeerAccess(t *testing.T, a *App, path, author, email string, reviewer *http.Cookie) {
	t.Helper()
	wrong := commentCookie(t, a, "google:other", "google", "other@example.test")
	emailReader := commentCookie(t, a, "email:"+email, "email", email)
	for _, tc := range []struct {
		cookie *http.Cookie
		status int
	}{{nil, 401}, {wrong, 404}} {
		w := commentAuthRequest(a, "POST", path+"/open", Row{}, tc.cookie, "http://blog.test")
		expectStatus(t, w, tc.status)
		excludesHTML(t, w.Body.String(), "ten people")
	}
	expectStatus(t, commentAuthRequest(a, "POST", path+"/open", Row{}, emailReader, "http://blog.test"), 200)
	expectStatus(t, commentAuthRequest(a, "GET", author+"/draft", nil, reviewer, ""), 401)
}

func checkReturningReview(t *testing.T, a *App, path, id string, reviewer *http.Cookie, post, newDraft Row) {
	t.Helper()
	visit := responseRow(t, commentAuthRequest(a, "POST", path+"/open", Row{}, reviewer, "http://blog.test"), 200)
	if visit.str("status") != "Changes made" || object(visit["previous"]).str("content") != post.str("content") {
		t.Fatal(visit)
	}
	if note := object(visit["notes"].([]any)[0]); note.str("anchorStatus") != "earlier" {
		t.Fatal(note)
	}
	fix := responseRow(t, commentAuthRequest(a, "GET", path+"/notes/"+id+"/fix", nil, reviewer, ""), 200)
	if object(fix["addressed_revision"]).str("revision") != newDraft.str("revision") {
		t.Fatal(fix)
	}
}
