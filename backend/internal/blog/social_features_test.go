package blog

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestSectionFlagAppliesToDraftAndCreditsPublishedFix(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A note", "slug": "a-note", "content": "The old statement.\n\nMore context.", "status": "published"}, true), 201)
	reader := commentCookie(t, a, "flag-reader", "email", "flag@example.test")
	base := "/api/public/posts/" + post.str("id")
	input := Row{"revision": post["revision"], "quote": "The old statement.", "occurrence": 0, "kind": "outdated", "body": "The evidence changed.", "proposedText": "The current statement."}
	created := responseRow(t, commentAuthRequest(a, "POST", base+"/flags", input, reader, "http://blog.test"), 201)
	expectStatus(t, request(t, a, "GET", "/api/readers/flags?status=pending&offset=0", nil, false), 401)
	page := responseRow(t, request(t, a, "GET", "/api/readers/flags?status=pending&offset=0", nil, true), 200)
	if len(page["flags"].([]any)) != 1 || page.yes("hasMore") {
		t.Fatal(page)
	}
	accepted := responseRow(t, request(t, a, "PATCH", "/api/readers/flags/"+created.str("id"), Row{"action": "accept"}, true), 200)
	if accepted.str("status") != "accepted" {
		t.Fatal(accepted)
	}
	draft := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/draft", nil, true), 200)
	if !strings.Contains(draft.str("content"), "The current statement.") {
		t.Fatal(draft)
	}
	if len(a.DB.Must(context.Background(), "SELECT id FROM reader_alerts")) != 0 {
		t.Fatal("alert before publication")
	}
	refined := responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id")+"/draft", Row{"revision": accepted["draftRevision"], "content": "The current statement, clarified by the writer.\n\nMore context."}, true), 200)
	tracked := first(a.DB.Must(context.Background(), "SELECT accepted_draft_revision FROM section_flags WHERE id=$1", created["id"]))
	if tracked.str("accepted_draft_revision") != refined.str("revision") {
		t.Fatal("reader credit did not follow the reviewed draft", tracked, refined)
	}
	responseRow(t, request(t, a, "POST", "/api/posts/"+post.str("id")+"/draft/publish", Row{"revision": refined["revision"]}, true), 200)
	applied := first(a.DB.Must(context.Background(), "SELECT status,applied_revision FROM section_flags WHERE id=$1", created["id"]))
	if applied.str("status") != "applied" || applied.str("applied_revision") == "" {
		t.Fatal(applied)
	}
	checkFlagContributorCredit(t, a, reader, created)
}

func checkFlagContributorCredit(t *testing.T, a *App, reader *http.Cookie, created Row) {
	t.Helper()
	alerts := responseRow(t, commentAuthRequest(a, "GET", "/api/public/reader-alerts?offset=0", nil, reader, ""), 200)
	if len(alerts["alerts"].([]any)) != 1 {
		t.Fatal(alerts)
	}
	if got := object(alerts["alerts"].([]any)[0]).str("url"); got != "/post/a-note#contribution-"+created.str("id") {
		t.Fatal("alert did not target contributor credit", got)
	}
	article := request(t, a, "GET", "/post/a-note", nil, false)
	containsHTML(t, article.Body.String(), "READER CONTRIBUTIONS", "contribution-"+created.str("id"), "Reader", "helping improve this article")
}

func TestSectionFlagRejectsPartialOrStructuredReplacement(t *testing.T) {
	content := "A clear passage about the first example.\n\nMore context."
	if result, ok := replaceFlagQuote(content, "A clear passage about the first exam", 0, "A clearer example matters."); ok {
		t.Fatal("partial selection corrupted draft", result)
	}
	if result, ok := replaceFlagQuote(content, "A clear passage about the first example.", 0, "A clearer example matters."); !ok || result != "A clearer example matters.\n\nMore context." {
		t.Fatal("complete paragraph replacement failed", result, ok)
	}
	if _, ok := replaceFlagQuote("Same text.\n\nSame text.", "Same text.", 0, "New text."); ok {
		t.Fatal("ambiguous duplicate passage was replaced")
	}
	if _, ok := replaceFlagQuote("# Heading\n\nBody.", "# Heading", 0, "Another heading"); ok {
		t.Fatal("structured Markdown was replaced")
	}
}

func TestSectionFlagManualReviewedDraftFromPartialSelection(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Review", "slug": "review", "content": "A clear passage about the first example.\n\nMore context.", "status": "published"}, true), 201)
	reader := commentCookie(t, a, "manual-reader", "email", "manual@example.test")
	created := responseRow(t, commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/flags", Row{
		"revision": post["revision"], "quote": "A clear passage about the first exam", "occurrence": 0,
		"kind": "unclear", "body": "The example is confusing.", "proposedText": "A clearer example matters.",
	}, reader, "http://blog.test"), 201)
	path := "/api/readers/flags/" + created.str("id")
	expectStatus(t, request(t, a, "PATCH", path, Row{"action": "accept"}, true), 409)
	if a.savedPostDraft(context.Background(), post.str("id")) != nil {
		t.Fatal("partial selection changed working draft")
	}
	accepted := responseRow(t, request(t, a, "PATCH", path, Row{
		"action": "accept", "reviewedContent": "A clearer example of the first exam.\n\nMore context.", "revision": post["revision"],
	}, true), 200)
	responseRow(t, request(t, a, "POST", "/api/posts/"+post.str("id")+"/draft/publish", Row{"revision": accepted["draftRevision"]}, true), 200)
	if row := first(a.DB.Must(context.Background(), "SELECT status FROM section_flags WHERE id=$1", created["id"])); row.str("status") != "applied" {
		t.Fatal("manual reviewed fix lost attribution", row)
	}
}

func TestSectionFlagAcceptsAlreadyEditedWorkingDraft(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Review", "slug": "review-edited", "content": "A clear passage about the first example.\n\nMore context.", "status": "published"}, true), 201)
	reader := commentCookie(t, a, "edited-reader", "email", "edited@example.test")
	created := responseRow(t, commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/flags", Row{
		"revision": post["revision"], "quote": "A clear passage about the first exam", "occurrence": 0,
		"kind": "unclear", "body": "The example is confusing.", "proposedText": "",
	}, reader, "http://blog.test"), 201)
	content := "A clearer example of the first exam.\n\nMore context."
	draft := responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id")+"/draft", Row{"revision": post["revision"], "content": content}, true), 200)
	accepted := responseRow(t, request(t, a, "PATCH", "/api/readers/flags/"+created.str("id"), Row{
		"action": "accept", "reviewedContent": content, "revision": draft["revision"],
	}, true), 200)
	if accepted.str("draftRevision") != draft.str("revision") {
		t.Fatal("accepted review created an unnecessary draft revision", accepted)
	}
	responseRow(t, request(t, a, "POST", "/api/posts/"+post.str("id")+"/draft/publish", Row{"revision": draft["revision"]}, true), 200)
	if row := first(a.DB.Must(context.Background(), "SELECT status FROM section_flags WHERE id=$1", created["id"])); row.str("status") != "applied" {
		t.Fatal("already reviewed draft lost attribution", row)
	}
}

func TestCommentsPageFiltersOnServer(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Comments", "slug": "comments", "content": "Body", "status": "published"}, true), 201)
	a.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('pending-comment',$1,'Reader','reader@example.test','Pending',FALSE)", post["id"])
	a.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('approved-comment',$1,'Reader','reader@example.test','Approved',TRUE)", post["id"])
	page := responseRow(t, request(t, a, "GET", "/api/comments?status=pending&kind=comments&offset=0", nil, true), 200)
	if len(page["comments"].([]any)) != 1 || object(page["counts"])["pending"] != float64(1) {
		t.Fatal(page)
	}
}

func TestPinnedAuthorUpdateQueuesConfirmedSubscribersOnce(t *testing.T) {
	a, config := smtpFixture(t)
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", config, true), 200)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Older post", "slug": "older-post", "content": "Body", "status": "published"}, true), 201)
	a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES('subscriber@example.test','subscribed','subscriber-hash')")
	a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES('pending@example.test','pending','pending-hash')")
	path := "/api/posts/" + post.str("id") + "/author-update"
	expectStatus(t, request(t, a, "PUT", path, Row{"body": "The guidance changed."}, false), 401)
	saved := responseRow(t, request(t, a, "PUT", path, Row{"body": "The guidance changed."}, true), 200)
	update := object(saved["authorUpdate"])
	if update.str("body") != "The guidance changed." || object(update["deliveryStatus"])["pending"] != float64(1) {
		t.Fatal(saved)
	}
	visible := responseRow(t, request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/interactions", nil, false), 200)
	if object(visible["authorUpdate"]).str("body") != "The guidance changed." {
		t.Fatal(visible)
	}
	article := request(t, a, "GET", "/post/older-post", nil, false)
	containsHTML(t, article.Body.String(), "AUTHOR UPDATE", "The guidance changed.")
	if len(a.DB.Must(context.Background(), "SELECT email FROM author_update_deliveries")) != 1 {
		t.Fatal("wrong update audience")
	}
	responseRow(t, request(t, a, "PUT", path, Row{"body": ""}, true), 200)
	removed := responseRow(t, request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/interactions", nil, false), 200)
	if removed["authorUpdate"] != nil {
		t.Fatal(removed)
	}
}

func TestReaderAlertEmailOptInQueuesOnlyNewAlerts(t *testing.T) {
	a, config := smtpFixture(t)
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", config, true), 200)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A note", "slug": "alert-note", "content": "Body", "status": "published"}, true), 201)
	reader := commentCookie(t, a, "alert-reader", "email", "alert@example.test")
	path := "/api/public/reader-alerts/settings"
	responseRow(t, commentAuthRequest(a, "PUT", path, Row{"emailEnabled": true}, reader, "http://blog.test"), 200)
	identity := a.commentReader(withReaderCookie(reader))
	a.insertReaderAlert(context.Background(), identity.str("id"), "author_answered", post.str("id"), "question-1", "alert-one", "The author answered you")
	a.insertReaderAlert(context.Background(), identity.str("id"), "author_answered", post.str("id"), "question-1", "alert-one", "The author answered you")
	if len(a.DB.Must(context.Background(), "SELECT alert_id FROM reader_alert_deliveries")) != 1 {
		t.Fatal("duplicate alert email queued")
	}
	responseRow(t, commentAuthRequest(a, "PUT", path, Row{"emailEnabled": false}, reader, "http://blog.test"), 200)
	a.insertReaderAlert(context.Background(), identity.str("id"), "someone_replied", post.str("id"), "note-1", "alert-two", "Someone replied")
	if len(a.DB.Must(context.Background(), "SELECT alert_id FROM reader_alert_deliveries")) != 1 {
		t.Fatal("email queued after opt out")
	}
}
