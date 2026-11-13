package blog

import (
	"net/http"
	"slices"
	"strings"
	"time"
)

// Article grants are checked independently of publication roles. Even an owner
// must be the invited reviewer to submit another person's review.
func memberReviewArticle(member Row, id string) bool {
	if values, ok := member["articleIds"].([]string); ok {
		return slices.Contains(values, id)
	}
	values, _ := member["articleIds"].([]any)
	for _, value := range values {
		if value == id {
			return true
		}
	}
	return false
}

func (a *App) memberPeerReview(r *http.Request, member Row, id string) Row {
	if member == nil {
		return nil
	}
	review := first(a.DB.Must(r.Context(), "SELECT * FROM peer_reviews WHERE id=$1 AND email=$2 AND closed=FALSE", id, strings.ToLower(member.str("email"))))
	if review == nil || !memberReviewArticle(member, review.str("post_id")) {
		return nil
	}
	return review
}

func (a *App) memberPeerReviews(w http.ResponseWriter, r *http.Request) {
	member := a.peerReviewPrincipal(r)
	if member == nil {
		fail(401, "Sign in with your Margin account.")
	}
	result := []Row{}
	rows := a.DB.Must(r.Context(), `SELECT review.id,review.post_id,review.status,p.title FROM peer_reviews review
 JOIN posts p ON p.id=review.post_id WHERE review.email=$1 AND review.closed=FALSE ORDER BY review.created_at DESC`, strings.ToLower(member.str("email")))
	for _, row := range rows {
		if memberReviewArticle(member, row.str("post_id")) {
			result = append(result, Row{"id": row["id"], "postId": row["post_id"], "title": row["title"], "status": row["status"], "url": sitePath("/review/" + row.str("id"))})
		}
	}
	send(w, 200, result)
}

// The local review contains the notes and draft lifecycle; Central owns the
// identity, invitation and revocable article grant. A resend reuses that review.
func (a *App) inviteCentralPeer(w http.ResponseWriter, r *http.Request, input Row) {
	a.limit(r, "peer-invite", 30, time.Hour, true)
	email := emailField(input, "email", true)
	article := stringField(input, "articleId", 1, 100, true)
	draft := a.reviewDraft(r, article)
	ctx := r.Context()
	id := token()
	tx := a.peerTransaction(ctx, article, draft.str("revision"))
	defer tx.Rollback()
	created := a.queryPostTransaction(ctx, tx, "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", id, article, email) != nil
	if !created {
		row := a.queryPostTransaction(ctx, tx, "SELECT id FROM peer_reviews WHERE post_id=$1 AND email=$2 AND closed=FALSE", article, email)
		if row == nil {
			fail(409, "The review changed. Try inviting again.")
		}
		id = row.str("id")
	}
	must(tx.Commit())
	// Keep the review if delivery fails: Central preserves the pending invite
	// for resend, and its eventual acceptance must still find this draft history.
	// This row alone grants no access without an accepted Central article grant.
	result := a.centralTeamRequest(r, "invite", Row{"email": email, "role": "peer_reviewer", "articleId": article})
	result["reviewId"] = id
	// Existing author-review consumers expect the local review ID and status.
	if r.PathValue("id") != "" {
		result["invitationId"], result["id"], result["status"] = result["id"], id, "Requested"
	}
	send(w, http.StatusCreated, result)
}

// Review access is an explicit delegation, independent of broad content scopes.
// Both transports resolve the current Central subject and article grants.
func (a *App) peerReviewPrincipal(r *http.Request) Row {
	if scopes, oauth := a.requestOAuthScopes(r); oauth && !hasOAuthScope(scopes, "review:assigned") {
		return nil
	}
	return a.requestMemberPrincipal(r)
}
