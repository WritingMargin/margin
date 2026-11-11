package blog

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type commentMailbox struct {
	messages []Row
	fail     bool
}

func commentMailFixture(t *testing.T) (*App, Row, *commentMailbox) {
	t.Helper()
	a, post := interactionFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	mailbox := &commentMailbox{}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/turnstile/v0/siteverify":
			return fixtureResponse(Row{"success": true, "hostname": "blog.test"}), nil
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true, "effectiveSenderEmail": "notes@margin.dev"}), nil
		case "/v1/reader-auth/providers":
			return fixtureResponse(Row{"providers": []string{"google"}}), nil
		case "/v1/newsletter/comment-verification", "/v1/newsletter/reader-sign-in":
			var input Row
			must(json.NewDecoder(r.Body).Decode(&input))
			mailbox.messages = append(mailbox.messages, input)
			return fixtureResponse(Row{"accepted": !mailbox.fail}), nil
		default:
			t.Fatalf("unexpected request %s", r.URL)
			return nil, nil
		}
	})
	return a, post, mailbox
}
func commentDraft(post Row, question bool) Row {
	input := Row{"submissionId": uuid(), "name": "Reader", "email": "reader@example.test", "body": "A thought", "captchaToken": "valid"}
	if question {
		input["quote"], input["revision"] = "A little room for ideas.", post["revision"]
	}
	return input
}
func submitCommentDraft(t *testing.T, a *App, post, input Row, question bool, status int) Row {
	t.Helper()
	kind := "comments"
	if question {
		kind = "questions"
	}
	return responseRow(t, conversationRequest(t, a, "POST", "/api/public/posts/"+post.str("id")+"/"+kind, input, false), status)
}
func setCommentPolicy(t *testing.T, a *App, verify, approval bool) {
	t.Helper()
	input := responseRow(t, request(t, a, "GET", "/api/settings/readers", nil, true), 200)
	input["requireEmailVerification"], input["requireApproval"] = verify, approval
	responseRow(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
}
func assertCommentPublic(t *testing.T, a *App, post Row, question, visible bool) {
	t.Helper()
	path := "comments"
	if question {
		path = "interactions"
	}
	w := request(t, a, "GET", "/api/public/posts/"+post.str("id")+"/"+path, nil, false)
	expectStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "A thought") != visible {
		t.Fatalf("unexpected public visibility: %s", w.Body.String())
	}
	excludesHTML(t, w.Body.String(), "reader@example.test", "verificationToken", "token_hash")
}
func TestConversationVerificationAndModerationCombinations(t *testing.T) {
	for _, verify := range []bool{false, true} {
		for _, approval := range []bool{false, true} {
			for _, question := range []bool{false, true} {
				t.Run(fmt.Sprintf("verify=%t/approval=%t/question=%t", verify, approval, question), func(t *testing.T) {
					testConversationPolicy(t, verify, approval, question)
				})
			}
		}
	}
}
func testConversationPolicy(t *testing.T, verify, approval, question bool) {
	t.Helper()
	a, post, mail := commentMailFixture(t)
	setCommentPolicy(t, a, verify, approval)
	input := commentDraft(post, question)
	result := submitCommentDraft(t, a, post, input, question, 201)
	if result.yes("verificationRequired") {
		t.Fatal(result)
	}
	if len(mail.messages) != 0 {
		t.Fatal("signed-in comment triggered email")
	}
	assertCommentPublic(t, a, post, question, !approval)
	expectStatus(t, request(t, a, "PATCH", "/api/comments/"+input.str("submissionId"), Row{"approved": true}, true), 200)
	assertCommentPublic(t, a, post, question, true)
	if len(a.DB.Must(context.Background(), "SELECT * FROM newsletter_subscribers")) != 0 {
		t.Fatal("verification subscribed the reader")
	}
}
func confirmTestComment(t *testing.T, a *App, input Row, mail *commentMailbox) {
	t.Helper()
	if len(mail.messages) != 1 {
		t.Fatal(mail.messages)
	}
	id := input.str("submissionId")
	token := mail.messages[0].str("verificationToken")
	state := a.commentSubmission(context.Background(), id)
	if state.str("token_hash") == token || state.str("token_hash") != hash(token) {
		t.Fatal("unsafe verification token storage")
	}
	expectStatus(t, request(t, a, "PATCH", "/api/comments/"+id, Row{"approved": true}, true), 409)
	excludesHTML(t, request(t, a, "GET", "/api/comments", nil, true).Body.String(), "A thought")
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": token}, false), 200)
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": token}, false), 400)
}
func seedLegacyComment(t *testing.T, a *App, post, input Row, approval bool) {
	t.Helper()
	ctx := context.Background()
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,$3,$4,$5,FALSE)", input["submissionId"], post["id"], input["name"], input["email"], input["body"])
	a.DB.Must(ctx, "INSERT INTO comment_submissions(comment_id,payload_hash,email_required,approval_required) VALUES($1,'legacy',TRUE,$2)", input["submissionId"], approval)
}
func resendLegacyComment(t *testing.T, a *App, input Row, status int) {
	t.Helper()
	expectStatus(t, request(t, a, "POST", "/api/public/comments/resend", Row{"submissionId": input["submissionId"], "captchaToken": "valid"}, false), status)
}
func TestCommentVerificationFailureRetryAndResend(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	input := commentDraft(post, false)
	seedLegacyComment(t, a, post, input, false)
	mail.fail = true
	resendLegacyComment(t, a, input, 502)
	if a.commentSubmission(context.Background(), input.str("submissionId"))["token_hash"] != nil {
		t.Fatal("failed send retained token")
	}
	mail.fail = false
	resendLegacyComment(t, a, input, 200)
	resendLegacyComment(t, a, input, 200)
	if len(mail.messages) != 2 {
		t.Fatal("duplicate mail")
	}
	old := mail.messages[1].str("verificationToken")
	a.DB.Must(context.Background(), "UPDATE comment_email_throttle SET last_sent_at='2000-01-01T00:00:00.000Z'")
	resendLegacyComment(t, a, input, 200)
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": old}, false), 400)
	a.DB.Must(context.Background(), "UPDATE comment_submissions SET expires_at='2000-01-01T00:00:00.000Z'")
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": mail.messages[2]["verificationToken"]}, false), 400)
}

func TestCommentPolicyChangesDoNotReleasePendingContributions(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	setCommentPolicy(t, a, true, true)
	input := commentDraft(post, false)
	seedLegacyComment(t, a, post, input, true)
	resendLegacyComment(t, a, input, 200)
	setCommentPolicy(t, a, false, false)
	token := mail.messages[0].str("verificationToken")
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": token}, false), 200)
	assertCommentPublic(t, a, post, false, false)
	input["body"] = "Changed body"
	submitCommentDraft(t, a, post, input, false, 409)
}
func TestCommentVerificationConsumptionIsAtomic(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	setCommentPolicy(t, a, true, false)
	input := commentDraft(post, false)
	seedLegacyComment(t, a, post, input, false)
	resendLegacyComment(t, a, input, 200)
	token := mail.messages[0].str("verificationToken")
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- request(t, a, "POST", "/api/public/comments/verify", Row{"token": token}, false).Code
		}()
	}
	wg.Wait()
	close(codes)
	success := 0
	for code := range codes {
		if code == 200 {
			success++
		} else if code != 400 {
			t.Fatal(code)
		}
	}
	if success != 1 {
		t.Fatal("token was not consumed exactly once")
	}
}
func TestCommentVerificationPageDoesNotConsumeToken(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	setCommentPolicy(t, a, true, false)
	input := commentDraft(post, false)
	seedLegacyComment(t, a, post, input, true)
	resendLegacyComment(t, a, input, 200)
	w := request(t, a, "GET", "/comments/verify", nil, false)
	expectStatus(t, w, 200)
	containsHTML(t, w.Body.String(), "Verify your comment")
	if a.commentSubmission(context.Background(), input.str("submissionId"))["verified_at"] != nil {
		t.Fatal("GET consumed verification")
	}
	expectStatus(t, request(t, a, "POST", "/api/public/comments/verify", Row{"token": mail.messages[0]["verificationToken"]}, false), 200)
}

func TestCommentPolicyDefaultsAndLegacySettings(t *testing.T) {
	a, _, _ := commentMailFixture(t)
	input := responseRow(t, request(t, a, "GET", "/api/settings/readers", nil, true), 200)
	if input.yes("requireEmailVerification") || !input.yes("requireApproval") {
		t.Fatal("unsafe defaults", input)
	}
	setCommentPolicy(t, a, true, false)
	delete(input, "requireEmailVerification")
	delete(input, "requireApproval")
	result := responseRow(t, request(t, a, "PUT", "/api/settings/readers", input, true), 200)
	if !result.yes("requireEmailVerification") || result.yes("requireApproval") {
		t.Fatal("legacy settings reset conversation policy", result)
	}
}

func TestCommentPolicyRequiresEmailDelivery(t *testing.T) {
	a, _, _ := commentMailFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		return fixtureResponse(Row{"ready": false}), nil
	})
	input := responseRow(t, request(t, a, "GET", "/api/settings/readers", nil, true), 200)
	input["requireEmailVerification"] = true
	expectStatus(t, request(t, a, "PUT", "/api/settings/readers", input, true), 503)
	if a.commentPolicy(context.Background()).yes("requireEmailVerification") {
		t.Fatal("enabled verification without email delivery")
	}
}
