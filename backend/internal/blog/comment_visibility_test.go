package blog

import (
	"context"
	"strings"
	"testing"
)

func TestHiddenCommentsArePrivate(t *testing.T) {
	a, _, post := publicFixture(t)
	a.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('hidden',$1,'Reader','reader@example.test','A saved comment',TRUE)", post["id"])
	theme := defaultTheme()
	design := theme["comments"].(map[string]any)
	design["visible"] = false
	expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
	page := request(t, a, "GET", "/post/crawlable", nil, false)
	expectStatus(t, page, 200)
	excludesHTML(t, page.Body.String(), `id="comments"`, "public-comments", "A saved comment", "IN THE MARGINS")
	path := "/api/public/posts/" + post.str("id") + "/comments"
	public := request(t, a, "GET", path, nil, false)
	expectStatus(t, public, 200)
	if public.Body.String() != "[]\n" {
		t.Fatal(public.Body.String())
	}
	expectStatus(t, request(t, a, "POST", path, Row{}, false), 403)
	excludesHTML(t, request(t, a, "GET", "/rss.xml", nil, false).Body.String(), "<comments>", "#comments")
	containsHTML(t, request(t, a, "GET", "/api/comments", nil, true).Body.String(), "A saved comment")
	// Closed conversations stay absent publicly, while moderation retains them.
	design["visible"] = true
	design["enabled"] = false
	expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
	excludesHTML(t, request(t, a, "GET", "/post/crawlable", nil, false).Body.String(), `id="comments"`, "A saved comment")
	excludesHTML(t, request(t, a, "GET", path, nil, false).Body.String(), "A saved comment")
	expectStatus(t, request(t, a, "POST", path, Row{}, false), 403)
}

func TestConversationFeedKeepsQuestionVerificationPrivate(t *testing.T) {
	a, post := interactionFixture(t)
	question := askPassage(t, a, post)
	ctx := context.Background()
	a.DB.Must(ctx, "UPDATE comments SET approved=TRUE WHERE id=$1", question["id"])
	a.DB.Must(ctx, "UPDATE comment_submissions SET email_required=TRUE,verified_at=NULL WHERE comment_id=$1", question["id"])
	feed := "/api/public/posts/" + post.str("id") + "/comments"
	excludesHTML(t, request(t, a, "GET", feed, nil, false).Body.String(), "How much room?")
	excludesHTML(t, request(t, a, "GET", "/post/room", nil, false).Body.String(), "How much room?")
	a.DB.Must(ctx, "UPDATE comment_submissions SET verified_at='2026-10-24T12:00:00.000Z' WHERE comment_id=$1", question["id"])
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved,created_at) VALUES('earlier',$1,'Reader','reader@example.test','Earlier ordinary comment',TRUE,'2000-01-01T00:00:00.000Z')", post["id"])
	response := request(t, a, "GET", feed, nil, false).Body.String()
	containsHTML(t, response, "Earlier ordinary comment", "How much room?", "A little room for ideas.")
	if strings.Index(response, "Earlier ordinary comment") > strings.Index(response, "How much room?") {
		t.Fatal("conversation is not chronological")
	}
	excludesHTML(t, response, "private@example.test", "reader@example.test")
}
