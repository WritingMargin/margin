package blog

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestReaderPreferencesModesAndPrivacy(t *testing.T) {
	a, post := interactionFixture(t)
	askPassage(t, a, post)
	a.DB.Must(context.Background(), "UPDATE comments SET approved=TRUE")
	reader := seedReader(t, a, "private@example.test")
	notePath := "/api/public/posts/" + post.str("id") + "/notes"
	note := Row{"quote": "A little room for ideas.", "revision": post["revision"], "body": "A private note"}
	expectStatus(t, readerRequest(t, a, "POST", notePath, note, reader), 201)
	input := Row{"newsletter": false, "comments": "closed", "questions": "closed", "notes": false, "editPolicy": "hide"}
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/settings/readers", nil, false), 401)
	saved := responseRow(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	input["requireEmailVerification"], input["requireApproval"], input["requireSignIn"] = false, true, true
	if encode(saved) != encode(input) {
		t.Fatal(saved)
	}
	current := responseRow(t, request(t, a, "GET", "/api/settings/readers", nil, true), 200)
	if encode(current) != encode(input) {
		t.Fatal(current)
	}
	comments := object(a.settings(context.Background())["comments"])
	if !comments.yes("visible") || comments.yes("enabled") || comments.str("heading") == "" {
		t.Fatal(comments)
	}
	questionPath := "/api/public/posts/" + post.str("id") + "/questions"
	expectStatus(t, conversationRequest(t, a, "POST", questionPath, Row{}, false), 403)
	expectStatus(t, readerRequest(t, a, "POST", notePath, note, reader), 403)
	containsHTML(t, readerRequest(t, a, "GET", notePath, nil, reader).Body.String(), "A private note")
	publicPath := "/api/public/posts/" + post.str("id") + "/interactions"
	excludesHTML(t, request(t, a, "GET", publicPath, nil, false).Body.String(), "How much room?")
	input["questions"], input["comments"] = "hidden", "hidden"
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	excludesHTML(t, request(t, a, "GET", publicPath, nil, false).Body.String(), "How much room?", "A private note")
	input["questions"], input["notes"] = "open", true
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	expectStatus(t, readerRequest(t, a, "POST", notePath, note, reader), 201)
	// A stale independent questions value cannot reopen hidden conversations.
	excludesHTML(t, request(t, a, "GET", publicPath, nil, false).Body.String(), "How much room?")
	expectStatus(t, conversationRequest(t, a, "POST", questionPath, Row{}, false), 403)
	delete(input, "questions")
	input["comments"] = "open"
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	containsHTML(t, request(t, a, "GET", publicPath, nil, false).Body.String(), "How much room?")
	askPassage(t, a, post)
}

func TestReaderSubscribersPaginationAndAuth(t *testing.T) {
	a, _ := coreFixture(t)
	expectStatus(t, request(t, a, "GET", "/api/readers/subscribers", nil, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/readers/subscribers?offset=-1", nil, true), 400)
	for i := 0; i < 101; i++ {
		a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash,confirmation_hash) VALUES($1,'pending',$2,$3)", fmt.Sprintf("reader%03d@example.test", i), fmt.Sprintf("unsubscribe-secret-%d", i), fmt.Sprintf("confirmation-secret-%d", i))
	}
	first := assertSubscribersPage(t, a, "", 100, true)
	assertSubscribersPage(t, a, "?offset=100", 1, false)
	assertSubscribersPage(t, a, "?offset=1", 100, false)
	assertSubscribersPage(t, a, "?offset=101", 0, false)
	for _, secret := range []string{"confirmation_hash", "unsubscribe_hash", "secret", "reader_notes", "token_hash"} {
		if strings.Contains(encode(first), secret) {
			t.Fatal("subscriber response leaked", secret)
		}
	}
}

func assertSubscribersPage(t *testing.T, a *App, query string, want int, hasMore bool) Row {
	t.Helper()
	result := responseRow(t, request(t, a, "GET", "/api/readers/subscribers"+query, nil, true), 200)
	if result.yes("hasMore") != hasMore || len(result["subscribers"].([]any)) != want {
		t.Fatal(result)
	}
	return result
}

func TestReaderPreferencesValidationAndEmailSave(t *testing.T) {
	a, smtp := smtpFixture(t)
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", smtp, true), 200)
	input := Row{"newsletter": false, "comments": "open", "questions": "hidden", "notes": false, "editPolicy": "keep"}
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	delete(smtp, "enabled")
	saved := responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", smtp, true), 200)
	if saved.yes("enabled") {
		t.Fatal("email save reopened subscriptions")
	}
	input["newsletter"] = true
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	if !a.newsletterSettings(context.Background()).yes("enabled") {
		t.Fatal("signups did not reopen")
	}
	input["questions"] = "invalid"
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 400)
	if a.interactionSettings(context.Background()).str("questions") != "open" {
		t.Fatal("invalid input changed saved settings")
	}
}

// Both settings APIs must enforce the shared mode, even with legacy question
// settings saved before or after the comment mode changes.
func TestQuestionsFollowCommentMode(t *testing.T) {
	for _, mode := range []string{"open", "closed", "hidden"} {
		t.Run(mode, func(t *testing.T) {
			a, post := interactionFixture(t)
			askPassage(t, a, post)
			a.DB.Must(context.Background(), "UPDATE comments SET approved=TRUE")
			a.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('article',$1,'Reader','reader@example.test','Article comment',TRUE)", post["id"])
			theme := a.settings(context.Background())
			comments := object(theme["comments"])
			comments["visible"], comments["enabled"] = mode != "hidden", mode == "open"
			expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
			// Saving an old interaction config never overrides comments.
			legacyMode := "open"
			if mode == "open" {
				legacyMode = "hidden"
			}
			legacy := Row{"enabled": true, "questions": legacyMode, "notes": true, "editPolicy": "keep"}
			saved := responseRow(t, request(t, a, "PUT", "/api/settings/interactions", legacy, true), 200)
			if saved.str("questions") != mode {
				t.Fatal(saved)
			}
			preferences := responseRow(t, request(t, a, "GET", "/api/settings/readers", nil, true), 200)
			if preferences.str("comments") != mode || preferences.str("questions") != mode {
				t.Fatal(preferences)
			}
			path := "/api/public/posts/" + post.str("id")
			assertConversationVisibility(t, a, path, mode)
			input := Row{"name": "Reader", "email": "reader@example.test", "body": "Another thought", "quote": "A little room for ideas.", "revision": post["revision"], "captchaToken": "valid"}
			status := 403
			if mode == "open" {
				status = 201
			}
			expectStatus(t, conversationRequest(t, a, "POST", path+"/questions", input, false), status)
			expectStatus(t, conversationRequest(t, a, "POST", path+"/comments", input, false), status)
		})
	}
}

func assertConversationVisibility(t *testing.T, a *App, path, mode string) {
	t.Helper()
	data := responseRow(t, request(t, a, "GET", path+"/interactions", nil, false), 200)
	publicMode := "hidden"
	if mode == "open" {
		publicMode = "open"
	}
	if data.str("questionMode") != publicMode || !data.yes("notesEnabled") {
		t.Fatal(data)
	}
	publicComments := request(t, a, "GET", path+"/comments", nil, false).Body.String()
	if strings.Contains(encode(data), "How much room?") != (mode == "open") || strings.Contains(publicComments, "Article comment") != (mode == "open") {
		t.Fatal("conversation visibility diverged", data, publicComments)
	}
}
