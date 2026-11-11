package blog

import (
	"context"
	"testing"
)

func TestPollVotesAreBoundToReaderAndPost(t *testing.T) {
	a, _ := coreFixture(t)
	content := "[Poll]\n{\"id\":\"direction-1\",\"title\":\"Do you agree?\",\"type\":\"agree-disagree\",\"allowReason\":true}\n[/Poll]"
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A poll", "slug": "poll", "content": content, "status": "published"}, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/polls/direction-1"
	expectStatus(t, request(t, a, "POST", path, Row{"optionId": "agree", "revision": post["revision"]}, false), 401)
	firstReader := commentCookie(t, a, "poll-reader-one", "email", "one@example.test")
	vote := Row{"optionId": "agree", "revision": post["revision"]}
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"optionId": "other", "revision": post["revision"]}, firstReader, "http://blog.test"), 400)
	result := responseRow(t, commentAuthRequest(a, "POST", path, vote, firstReader, "http://blog.test"), 200)
	if result["total"] != float64(1) || result["votedOption"] != "agree" {
		t.Fatal(result)
	}
	expectStatus(t, commentAuthRequest(a, "POST", path, vote, firstReader, "http://blog.test"), 409)
	secondReader := commentCookie(t, a, "poll-reader-two", "email", "two@example.test")
	result = responseRow(t, commentAuthRequest(a, "POST", path, Row{"optionId": "disagree", "revision": post["revision"]}, secondReader, "http://blog.test"), 200)
	if result["total"] != float64(2) || result["votedOption"] != "disagree" {
		t.Fatal(result)
	}
	anonymous := responseRow(t, request(t, a, "GET", path, nil, false), 200)
	if anonymous["votedOption"] != nil || anonymous["total"] != float64(2) {
		t.Fatal(anonymous)
	}
	anchors := a.DB.Must(context.Background(), "SELECT * FROM section_anchors WHERE kind='vote'")
	if len(anchors) != 2 {
		t.Fatal(anchors)
	}
}

func TestPollReasonStaysPrivateAndVisibleToWriter(t *testing.T) {
	a, _ := coreFixture(t)
	content := "[Poll]\n{\"id\":\"decision-1\",\"title\":\"Should we continue?\",\"type\":\"agree-disagree\",\"allowReason\":true}\n[/Poll]"
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Decision", "slug": "decision", "content": content, "status": "published"}, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/polls/decision-1"
	cookie := commentCookie(t, a, "poll-reason-reader", "email", "reason@example.test")
	input := Row{"optionId": "agree", "revision": post["revision"], "reason": "The examples make sense."}
	result := responseRow(t, commentAuthRequest(a, "POST", path, input, cookie, "http://blog.test"), 200)
	if result["total"] != float64(1) || result["reasons"] != nil || len(a.DB.Must(context.Background(), "SELECT * FROM public_notes")) != 0 {
		t.Fatal(result)
	}
	writer := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/polls/decision-1", nil, true), 200)
	reasons := writer["reasons"].([]any)
	if len(reasons) != 1 || object(reasons[0]).str("reason") != input["reason"] || object(reasons[0]).str("optionId") != "agree" {
		t.Fatal(writer)
	}
}

func TestDelayedPollHidesCountsUntilClosed(t *testing.T) {
	a, _ := coreFixture(t)
	content := `[Poll]
{"id":"timed-poll","title":"Should we continue?","type":"agree-disagree","resultsVisibility":"after-close","closesAt":"2099-01-01T00:00:00Z"}
[/Poll]`
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Timed poll", "slug": "timed-poll", "content": content, "status": "published"}, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/polls/timed-poll"
	initial := responseRow(t, request(t, a, "GET", path, nil, false), 200)
	if initial.yes("resultsVisible") || initial.yes("closed") || initial["counts"] != nil || initial["total"] != nil {
		t.Fatal(initial)
	}
	reader := commentCookie(t, a, "timed-poll-reader", "email", "timed@example.test")
	input := Row{"optionId": "agree", "revision": post["revision"]}
	voted := responseRow(t, commentAuthRequest(a, "POST", path, input, reader, "http://blog.test"), 200)
	if voted["votedOption"] != "agree" || voted["counts"] != nil || voted["total"] != nil {
		t.Fatal(voted)
	}
	checkDelayedPollResultsAndClose(t, a, post, path)
	other := commentCookie(t, a, "timed-poll-other", "email", "other@example.test")
	expectStatus(t, commentAuthRequest(a, "POST", path, input, other, "http://blog.test"), 409)
}

func checkDelayedPollResultsAndClose(t *testing.T, a *App, post Row, path string) {
	t.Helper()
	writerPath := "/api/posts/" + post.str("id") + "/polls/timed-poll"
	expectStatus(t, request(t, a, "GET", writerPath, nil, false), 401)
	writer := responseRow(t, request(t, a, "GET", writerPath, nil, true), 200)
	if writer["total"] != float64(1) || !writer.yes("resultsVisible") {
		t.Fatal(writer)
	}
	listed := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/polls", nil, true), 200)
	polls := listed["polls"].([]any)
	if len(polls) != 1 || polls[0].(map[string]any)["title"] != "Should we continue?" {
		t.Fatal(listed)
	}
	closed := responseRow(t, request(t, a, "POST", writerPath+"/close", Row{}, true), 200)
	if !closed.yes("closed") || closed["total"] != float64(1) {
		t.Fatal(closed)
	}
	public := responseRow(t, request(t, a, "GET", path, nil, false), 200)
	if !public.yes("closed") || public["total"] != float64(1) {
		t.Fatal(public)
	}

}

func TestPollWriterResultsRequireWriterPermission(t *testing.T) {
	for _, pattern := range []string{"GET /api/posts/{id}/polls", "GET /api/posts/{id}/polls/{poll}"} {
		if tokenRouteAllowed("reader", pattern) || !tokenRouteAllowed("writer", pattern) {
			t.Fatal("poll results permission", pattern)
		}
	}
	if tokenRouteAllowed("writer", "POST /api/posts/{id}/polls/{poll}/close") || !tokenRouteAllowed("publisher", "POST /api/posts/{id}/polls/{poll}/close") {
		t.Fatal("poll close permission")
	}
}

func TestPollScheduledCloseRejectsVotes(t *testing.T) {
	a, _ := coreFixture(t)
	content := `[Poll]
{"id":"ended","title":"Was this useful?","type":"agree-disagree","resultsVisibility":"after-close","closesAt":"2000-01-01T00:00:00Z"}
[/Poll]`
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Ended poll", "slug": "ended-poll", "content": content, "status": "published"}, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/polls/ended"
	result := responseRow(t, request(t, a, "GET", path, nil, false), 200)
	if !result.yes("closed") || !result.yes("resultsVisible") || result["total"] != float64(0) {
		t.Fatal(result)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM poll_closures WHERE post_id=$1 AND poll_id='ended'", post["id"])) != 1 {
		t.Fatal("scheduled close was not persisted")
	}
	reader := commentCookie(t, a, "ended-poll-reader", "email", "ended@example.test")
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"optionId": "agree", "revision": post["revision"]}, reader, "http://blog.test"), 409)
}
