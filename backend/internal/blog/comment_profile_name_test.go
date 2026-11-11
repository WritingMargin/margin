package blog

import (
	"context"
	"net/http/httptest"
	"testing"
)

func TestCommentProfileNamesStayFixed(t *testing.T) {
	for _, provider := range []string{"google", "email"} {
		t.Run(provider, func(t *testing.T) { testFixedCommentName(t, provider) })
	}
}
func testFixedCommentName(t *testing.T, provider string) {
	a, post := interactionFixture(t)
	ctx := context.Background()
	cookie := commentCookie(t, a, provider+":stable", provider, "reader@example.test")
	expected := "Reader"
	if provider == "email" {
		a.DB.Must(ctx, "UPDATE comment_readers SET name='' WHERE identity=$1", provider+":stable")
		expected = "Alex"
	}
	for i, kind := range []string{"comments", "questions", "comments"} {
		if i == 2 {
			post = responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Another article", "slug": "another-article", "content": "Different content.", "status": "published"}, true), 201)
		}
		input := commentDraft(post, kind == "questions")
		input["name"] = []string{"Alex", "Different name", "Another name"}[i]
		path := "/api/public/posts/" + post.str("id") + "/" + kind
		expectStatus(t, commentAuthRequest(a, "POST", path, input, cookie, "http://blog.test"), 201)
		stored := first(a.DB.Must(ctx, "SELECT name FROM comments WHERE id=$1", input["submissionId"]))
		if stored.str("name") != expected {
			t.Fatalf("%s accepted another name: %v", kind, stored)
		}
	}
	status := commentAuthRequest(a, "GET", "/api/public/comment-auth", nil, cookie, "")
	containsHTML(t, status.Body.String(), `"name":"`+expected+`"`)
	// Reauthentication must not overwrite the fixed profile name.
	reader := a.commentIdentity(ctx, provider+":stable", provider, "reader@example.test", "Changed at provider")
	if reader.str("name") != expected {
		t.Fatal(reader)
	}
}

func TestExistingEmailReaderKeepsFirstCommentName(t *testing.T) {
	a, post := interactionFixture(t)
	ctx := context.Background()
	cookie := commentCookie(t, a, "email:existing", "email", "reader@example.test")
	input := commentDraft(post, false)
	expectStatus(t, commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/comments", input, cookie, "http://blog.test"), 201)
	a.DB.Must(ctx, "UPDATE comment_readers SET name='' WHERE identity='email:existing'")
	status := commentAuthRequest(a, "GET", "/api/public/comment-auth", nil, cookie, "")
	containsHTML(t, status.Body.String(), `"name":"Reader"`)
}

func TestRejectedFirstCommentDoesNotSetProfileName(t *testing.T) {
	a, post := interactionFixture(t)
	ctx := context.Background()
	cookie := commentCookie(t, a, "email:new", "email", "reader@example.test")
	a.DB.Must(ctx, "UPDATE comment_readers SET name='' WHERE identity='email:new'")
	input := commentDraft(post, false)
	input["body"] = ""
	expectStatus(t, commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/comments", input, cookie, "http://blog.test"), 400)
	if first(a.DB.Must(ctx, "SELECT name FROM comment_readers WHERE identity='email:new'")).str("name") != "" {
		t.Fatal("rejected submission saved a name")
	}
}

func TestConcurrentFirstCommentsUseOneProfileName(t *testing.T) {
	a, post := interactionFixture(t)
	ctx := context.Background()
	cookie := commentCookie(t, a, "email:concurrent", "email", "reader@example.test")
	a.DB.Must(ctx, "UPDATE comment_readers SET name='' WHERE identity='email:concurrent'")
	responses := make(chan *httptest.ResponseRecorder, 2)
	start := make(chan struct{})
	for _, name := range []string{"Alex", "Sam"} {
		input := commentDraft(post, false)
		input["name"] = name
		go func() {
			<-start
			responses <- commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/comments", input, cookie, "http://blog.test")
		}()
	}
	close(start)
	for range 2 {
		expectStatus(t, <-responses, 201)
	}
	reader := first(a.DB.Must(ctx, "SELECT name FROM comment_readers WHERE identity='email:concurrent'"))
	for _, row := range a.DB.Must(ctx, "SELECT name FROM comments") {
		if row.str("name") != reader.str("name") {
			t.Fatal("concurrent submissions selected different display names", row, reader)
		}
	}
}
