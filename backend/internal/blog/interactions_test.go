package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func interactionFixture(t *testing.T) (*App, Row) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	expectStatus(t, request(t, a, "PUT", "/api/settings/turnstile", Row{"siteKey": "site", "secretKey": "secret"}, true), 200)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"success": true, "hostname": "blog.test"}), nil
	})
	expectStatus(t, request(t, a, "PUT", "/api/settings/interactions", Row{"enabled": true, "editPolicy": "keep"}, true), 200)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A little room", "slug": "room", "content": "Before.\n\nA **little room** for ideas.\n\nAfter.", "status": "published"}, true), 201)
	return a, post
}
func askPassage(t *testing.T, a *App, post Row) Row {
	t.Helper()
	input := Row{"name": "Reader", "email": "private@example.test", "body": "How much room?", "quote": "A little room for ideas.", "revision": post["revision"], "captchaToken": "valid"}
	expectStatus(t, conversationRequest(t, a, "POST", "/api/public/posts/"+post.str("id")+"/questions", input, false), 201)
	return first(a.DB.Must(context.Background(), "SELECT * FROM comments ORDER BY created_at DESC LIMIT 1"))
}
func TestPassageQuestionsModeration(t *testing.T) {
	a, post := interactionFixture(t)
	question := askPassage(t, a, post)
	path := "/api/public/posts/" + post.str("id") + "/interactions"
	excludesHTML(t, request(t, a, "GET", path, nil, false).Body.String(), "How much room?", "private@example.test")
	excludesHTML(t, request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/comments", nil, false).Body.String(), "How much room?")
	expectStatus(t, request(t, a, "PATCH", "/api/comments/"+question.str("id"), Row{"approved": true}, true), 200)
	expectStatus(t, request(t, a, "PUT", "/api/comments/"+question.str("id")+"/answer", Row{"answer": "Enough for a walk."}, false), 401)
	expectStatus(t, request(t, a, "PUT", "/api/comments/"+question.str("id")+"/answer", Row{"answer": "Enough for a walk."}, true), 200)
	result := request(t, a, "GET", path, nil, false).Body.String()
	containsHTML(t, result, "A little room for ideas.", "How much room?", "Enough for a walk.")
	excludesHTML(t, result, "private@example.test")
	feed := request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/comments", nil, false).Body.String()
	containsHTML(t, feed, "How much room?", "A little room for ideas.", "Enough for a walk.")
	excludesHTML(t, feed, "private@example.test")
	page := request(t, a, "GET", "/post/room", nil, false).Body.String()
	containsHTML(t, page, "On this passage", "How much room?", "A little room for ideas.", "Author’s reply", "Enough for a walk.")
	excludesHTML(t, page, "private@example.test")
	expectStatus(t, request(t, a, "DELETE", "/api/comments/"+question.str("id"), nil, true), 200)
	if len(a.DB.Must(context.Background(), "SELECT * FROM passage_questions")) != 0 {
		t.Fatal("question anchor survived moderation deletion")
	}
}
func TestPassageQuestionFollowupsStayInOriginalConversation(t *testing.T) {
	a, post := interactionFixture(t)
	question := askPassage(t, a, post)
	base := "/api/public/posts/" + post.str("id")
	path := base + "/questions/" + question.str("id") + "/followups"
	reader := commentCookie(t, a, "test-reader", "email", "reader@example.com")
	other := commentCookie(t, a, "another-reader", "email", "other@example.com")
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"body": "Could you explain more?"}, reader, "http://blog.test"), 404)
	expectStatus(t, request(t, a, "PATCH", "/api/comments/"+question.str("id"), Row{"approved": true}, true), 200)
	expectStatus(t, request(t, a, "PUT", "/api/comments/"+question.str("id")+"/answer", Row{"answer": "Start small."}, true), 200)
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"body": "Could you explain more?"}, other, "http://blog.test"), 404)
	expectStatus(t, request(t, a, "POST", path, Row{"body": "Could you explain more?"}, false), 401)
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"body": "Could you explain more?"}, reader, "http://blog.test"), 201)
	followup := first(a.DB.Must(context.Background(), "SELECT * FROM passage_followups WHERE question_id=$1", question["id"]))
	if followup == nil || followup.yes("approved") {
		t.Fatal("follow-up should await moderation", followup)
	}
	excludesHTML(t, request(t, a, "GET", base+"/interactions", nil, false).Body.String(), "Could you explain more?")
	containsHTML(t, commentAuthRequest(a, "GET", base+"/interactions", nil, reader, "").Body.String(), "Could you explain more?")
	excludesHTML(t, commentAuthRequest(a, "GET", base+"/interactions", nil, other, "").Body.String(), "Could you explain more?")
	containsHTML(t, request(t, a, "GET", "/api/comments", nil, true).Body.String(), "Could you explain more?")
	admin := "/api/comments/" + question.str("id") + "/followups/" + followup.str("id")
	expectStatus(t, request(t, a, "PATCH", admin, Row{"approved": true, "answer": "Try one paragraph."}, false), 401)
	expectStatus(t, request(t, a, "PATCH", admin, Row{"approved": true, "answer": strings.Repeat("x", 10001)}, true), 400)
	if first(a.DB.Must(context.Background(), "SELECT approved FROM passage_followups WHERE id=$1", followup["id"])).yes("approved") {
		t.Fatal("invalid answer approved the follow-up")
	}
	expectStatus(t, request(t, a, "PATCH", admin, Row{"approved": true, "answer": "Try one paragraph."}, true), 200)
	for _, route := range []string{base + "/interactions", base + "/comments", "/post/room"} {
		containsHTML(t, request(t, a, "GET", route, nil, false).Body.String(), "Could you explain more?", "Try one paragraph.")
	}
	a.mu.Lock()
	clear(a.limits)
	a.mu.Unlock()
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"body": "One more thing?"}, reader, "http://blog.test"), 201)
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"body": "Again?"}, reader, "http://blog.test"), 409)
	expectStatus(t, request(t, a, "DELETE", "/api/comments/"+question.str("id"), nil, true), 200)
	if len(a.DB.Must(context.Background(), "SELECT id FROM passage_followups")) != 0 {
		t.Fatal("deleting a question retained follow-ups")
	}
}
func TestPassagePolicyOnlyAppliesToFutureEdits(t *testing.T) {
	for _, policy := range []string{"keep", "hide"} {
		t.Run(policy, func(t *testing.T) { testPassagePolicy(t, policy) })
	}
}
func testPassagePolicy(t *testing.T, policy string) {
	a, post := interactionFixture(t)
	question := askPassage(t, a, post)
	ctx := context.Background()
	a.DB.Must(ctx, "UPDATE comments SET approved=TRUE")
	expectStatus(t, request(t, a, "PUT", "/api/settings/interactions", Row{"enabled": true, "editPolicy": policy}, true), 200)
	path := "/api/posts/" + post.str("id")
	moved := responseRow(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "content": "Extra introduction.\n\nA **little room** for ideas.\n\nAfter."}, true), 200)
	if first(a.DB.Must(ctx, "SELECT * FROM passage_questions")).str("anchor_status") != "active" {
		t.Fatal("unchanged quote detached")
	}
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "content": "Stale edit"}, true), 409)
	edited := responseRow(t, request(t, a, "PUT", path, Row{"revision": moved["revision"], "content": "A different thought."}, true), 200)
	expected := "detached"
	if policy == "hide" {
		expected = "hidden"
	}
	anchor := first(a.DB.Must(ctx, "SELECT * FROM passage_questions"))
	if anchor.str("anchor_status") != expected || anchor.str("applied_policy") != policy {
		t.Fatal(anchor)
	}
	other := "hide"
	if policy == "hide" {
		other = "keep"
	}
	expectStatus(t, request(t, a, "PUT", "/api/settings/interactions", Row{"enabled": true, "editPolicy": other}, true), 200)
	responseRow(t, request(t, a, "PUT", path, Row{"revision": edited["revision"], "content": post["content"]}, true), 200)
	anchor = first(a.DB.Must(ctx, "SELECT * FROM passage_questions"))
	if anchor.str("anchor_status") != expected || anchor.str("applied_policy") != policy {
		t.Fatal("policy replayed retrospectively", anchor)
	}
	public := request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/interactions", nil, false).Body.String()
	if strings.Contains(public, question.str("body")) != (policy == "keep") {
		t.Fatal(public)
	}
	feed := request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/comments", nil, false).Body.String()
	if strings.Contains(feed, question.str("body")) != (policy == "keep") {
		t.Fatal(feed)
	}
}
func TestPassageInputAndDisabledSettings(t *testing.T) {
	a, post := interactionFixture(t)
	path := "/api/public/posts/" + post.str("id") + "/questions"
	input := Row{"name": "Reader", "email": "reader@example.test", "body": "Question", "quote": "Invented text", "revision": post["revision"], "captchaToken": "valid"}
	expectStatus(t, conversationRequest(t, a, "POST", path, input, false), 400)
	input["quote"] = "A little room for ideas."
	input["revision"] = "stale"
	expectStatus(t, conversationRequest(t, a, "POST", path, input, false), 409)
	expectStatus(t, request(t, a, "PUT", "/api/settings/interactions", Row{"enabled": false, "editPolicy": "keep"}, false), 401)
	expectStatus(t, request(t, a, "PUT", "/api/settings/interactions", Row{"enabled": false, "editPolicy": "erase"}, true), 400)
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", Row{"newsletter": false, "comments": "hidden", "notes": false, "editPolicy": "keep"}, true), 200)
	input["revision"] = post["revision"]
	expectStatus(t, conversationRequest(t, a, "POST", path, input, false), 403)
}
func readerRequest(t *testing.T, a *App, method, path string, input Row, token string) *httptest.ResponseRecorder {
	t.Helper()
	body := ""
	if input != nil {
		body = encode(input)
	}
	r := httptest.NewRequest(method, "http://blog.test"+path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", a.origin(r))
	if token != "" {
		r.AddCookie(&http.Cookie{Name: "margin_reader", Value: token})
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func seedReader(t *testing.T, a *App, email string) string {
	t.Helper()
	ctx := context.Background()
	token := newsletterToken()
	a.DB.Must(ctx, "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES($1,'subscribed',$2)", email, hash(newsletterToken()))
	a.DB.Must(ctx, "INSERT INTO reader_sessions(token_hash,email,expires_at) VALUES($1,$2,$3)", hash(token), email, time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
	return token
}
func TestReaderNotesPrivacyAndLegacySubscription(t *testing.T) {
	a, post := interactionFixture(t)
	one := seedReader(t, a, "one@example.test")
	two := seedReader(t, a, "two@example.test")
	path := "/api/public/posts/" + post.str("id") + "/notes"
	input := Row{"quote": "A little room for ideas.", "revision": post["revision"], "body": "My private thought"}
	expectStatus(t, readerRequest(t, a, "POST", path, input, ""), 401)
	expectStatus(t, conversationRequest(t, a, "POST", path, input, true), 401)
	expectStatus(t, readerRequest(t, a, "POST", path, input, one), 201)
	containsHTML(t, readerRequest(t, a, "GET", path, nil, one).Body.String(), "My private thought")
	excludesHTML(t, readerRequest(t, a, "GET", path, nil, two).Body.String(), "My private thought")
	excludesHTML(t, request(t, a, "GET", "/api/comments", nil, true).Body.String(), "My private thought")
	note := first(a.DB.Must(context.Background(), "SELECT * FROM reader_notes"))
	expectStatus(t, readerRequest(t, a, "DELETE", "/api/public/notes/"+note.str("id"), nil, two), 200)
	if len(a.DB.Must(context.Background(), "SELECT * FROM reader_notes")) != 1 {
		t.Fatal("another reader deleted a note")
	}
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "Completely rewritten."}, true), 200)
	containsHTML(t, readerRequest(t, a, "GET", path, nil, one).Body.String(), "A little room for ideas.", "My private thought")
	a.DB.Must(context.Background(), "UPDATE newsletter_subscribers SET status='unsubscribed' WHERE email='one@example.test'")
	expectStatus(t, readerRequest(t, a, "GET", path, nil, one), 401)
}
func TestReaderNotesUseSharedReaderLogin(t *testing.T) {
	a, post := interactionFixture(t)
	path := "/api/public/posts/" + post.str("id")
	email := "shared@example.test"
	google := commentCookie(t, a, "google:notes", "google", email)
	emailLogin := commentCookie(t, a, "email:"+email, "email", email)
	other := commentCookie(t, a, "email:other@example.test", "email", "other@example.test")
	input := Row{"quote": "A little room for ideas.", "revision": post["revision"], "body": "A private thought"}
	status := responseRow(t, commentAuthRequest(a, "GET", path+"/interactions", nil, google, ""), 200)
	if !status.yes("subscriber") {
		t.Fatal("Google reader session did not grant private note access", status)
	}
	expectStatus(t, commentAuthRequest(a, "POST", path+"/notes", input, google, "http://blog.test"), 201)
	containsHTML(t, commentAuthRequest(a, "GET", path+"/notes", nil, emailLogin, "").Body.String(), "A private thought")
	excludesHTML(t, commentAuthRequest(a, "GET", path+"/notes", nil, other, "").Body.String(), "A private thought")
	note := first(a.DB.Must(context.Background(), "SELECT id FROM reader_notes WHERE email=$1", email))
	expectStatus(t, commentAuthRequest(a, "DELETE", "/api/public/notes/"+note.str("id"), nil, emailLogin, "http://blog.test"), 200)
	if first(a.DB.Must(context.Background(), "SELECT id FROM reader_notes WHERE id=$1", note["id"])) != nil {
		t.Fatal("note was not deleted by the same reader's email login")
	}
}
func TestWholeArticleReaderNoteCanBeEditedOnlyByItsOwner(t *testing.T) {
	a, post := interactionFixture(t)
	path := "/api/public/posts/" + post.str("id") + "/notes"
	owner := commentCookie(t, a, "email:owner@example.test", "email", "owner@example.test")
	other := commentCookie(t, a, "email:other@example.test", "email", "other@example.test")
	created := commentAuthRequest(a, "POST", path, Row{"revision": post["revision"], "body": "Remember this article"}, owner, "http://blog.test")
	expectStatus(t, created, 201)
	note := first(a.DB.Must(context.Background(), "SELECT id,quote FROM reader_notes WHERE email='owner@example.test'"))
	if note == nil || note.str("quote") != "" {
		t.Fatal("whole-article note was not saved without a passage", note)
	}
	containsHTML(t, commentAuthRequest(a, "GET", path, nil, owner, "").Body.String(), "Remember this article")
	excludesHTML(t, commentAuthRequest(a, "GET", path, nil, other, "").Body.String(), "Remember this article")
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"quote": "Not in this article", "revision": post["revision"], "body": "Invalid passage"}, owner, "http://blog.test"), 400)
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"quote": "", "revision": "stale", "body": "Old version"}, owner, "http://blog.test"), 409)
	edit := "/api/public/notes/" + note.str("id")
	expectStatus(t, commentAuthRequest(a, "PATCH", edit, Row{"body": "Changed"}, nil, "http://blog.test"), 401)
	expectStatus(t, commentAuthRequest(a, "PATCH", edit, Row{"body": "Changed"}, other, "http://blog.test"), 404)
	expectStatus(t, commentAuthRequest(a, "PATCH", edit, Row{"body": ""}, owner, "http://blog.test"), 400)
	expectStatus(t, commentAuthRequest(a, "PATCH", edit, Row{"body": strings.Repeat("a", 10001)}, owner, "http://blog.test"), 400)
	expectStatus(t, commentAuthRequest(a, "PATCH", edit, Row{"body": "Updated private note"}, owner, "http://blog.test"), 200)
	containsHTML(t, commentAuthRequest(a, "GET", path, nil, owner, "").Body.String(), "Updated private note")
	excludesHTML(t, request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/interactions", nil, false).Body.String(), "Updated private note")
}
func TestReaderEmailLinkIsSingleUse(t *testing.T) {
	a, _ := interactionFixture(t)
	seedReader(t, a, "one@example.test")
	token := newsletterToken()
	unsubscribe := newsletterToken()
	a.DB.Must(context.Background(), "INSERT INTO reader_email_links(token_hash,email,unsubscribe_hash,expires_at) VALUES($1,$2,$3,$4)", hash(token), "one@example.test", hash(unsubscribe), time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
	result := readerRequest(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": token}, "")
	expectStatus(t, result, 200)
	cookies := result.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "margin_reader" || !cookies[0].HttpOnly {
		t.Fatal("missing reader session", cookies)
	}
	expectStatus(t, readerRequest(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": token}, ""), 400)
	expectStatus(t, readerRequest(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": unsubscribe}, ""), 200)
	if a.readerEmail(withReaderCookie(cookies[0])) != "" {
		t.Fatal("unsubscribed session retained access")
	}
}
func withReaderCookie(cookie *http.Cookie) *http.Request {
	r := httptest.NewRequest("GET", "http://blog.test", nil)
	r.AddCookie(cookie)
	return r
}
func TestReaderLoginDelivery(t *testing.T) {
	a, _ := interactionFixture(t)
	seedReader(t, a, "one@example.test")
	t.Setenv("PUBLIC_URL", "https://blog.test")
	var mail Row
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true, "effectiveSenderEmail": "blog@example.test"}), nil
		default:
			must(json.NewDecoder(r.Body).Decode(&mail))
			return fixtureResponse(Row{"accepted": true}), nil
		}
	})
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", Row{"enabled": true, "delivery": "managed", "senderEmail": ""}, true), 200)
	// Existing subscribers can still sign in when the owner pauses new signups.
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", Row{"newsletter": false, "comments": "open", "questions": "open", "notes": true, "editPolicy": "keep"}, true), 200)
	expectStatus(t, readerRequest(t, a, "POST", "/api/public/newsletter/subscribe", Row{"email": "new@example.test"}, ""), 503)
	expectStatus(t, readerRequest(t, a, "POST", "/api/public/reader/login", Row{"email": "one@example.test"}, ""), 202)
	if mail.str("to") != "one@example.test" || mail.str("confirmationToken") == "" {
		t.Fatal(mail)
	}
	expectStatus(t, readerRequest(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": mail["confirmationToken"]}, ""), 200)
}

func TestCommentsWithoutCaptchaPreserveQuestionsAndNotes(t *testing.T) {
	a, post := interactionFixture(t)
	askPassage(t, a, post)
	ctx := context.Background()
	a.DB.Must(ctx, "UPDATE comments SET approved=TRUE")
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('regular',$1,'Reader','reader@example.test','Saved comment',TRUE)", post["id"])
	a.DB.Must(ctx, "DELETE FROM turnstile_settings")
	path := "/api/public/posts/" + post.str("id")
	data := responseRow(t, request(t, a, "GET", path+"/interactions", nil, false), 200)
	if data.str("questionMode") != "open" || !data.yes("notesEnabled") || !data.yes("enabled") || !strings.Contains(encode(data), "How much room?") {
		t.Fatal(data)
	}
	expectStatus(t, request(t, a, "POST", path+"/questions", commentDraft(post, true), false), 401)
	if got := request(t, a, "GET", path+"/comments", nil, false).Body.String(); !strings.Contains(got, "Saved comment") {
		t.Fatal(got)
	}
	page := request(t, a, "GET", "/post/room", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), `id="comments"`, "Saved comment")
	containsHTML(t, request(t, a, "GET", "/api/comments", nil, true).Body.String(), "Saved comment", "How much room?")
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", Row{"newsletter": false, "comments": "closed", "notes": false, "editPolicy": "keep"}, true), 200)
	data = responseRow(t, request(t, a, "GET", path+"/interactions", nil, false), 200)
	if data.yes("enabled") || data.yes("notesEnabled") || data.str("questionMode") != "hidden" {
		t.Fatal(data)
	}
}
