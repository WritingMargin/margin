package blog

import (
	"context"
	"database/sql"
	"net/http"
)

func submissionID(input Row) string {
	if _, ok := input["submissionId"]; !ok {
		return uuid()
	}
	id := stringField(input, "submissionId", 1, 64, false)
	if !uuidRE.MatchString(id) {
		fail(400, "Invalid comment submission ID.")
	}
	return id
}
func (a *App) submitConversation(r *http.Request, post, input Row, name, email, message, quote string) Row {
	reader := a.requireCommentReader(r)
	policy := a.commentPolicy(r.Context())
	policy["requireEmailVerification"] = false
	id := submissionID(input)
	a.storeConversation(r, post, Row{"reader": reader["id"], "id": id, "name": name, "email": email, "body": message, "quote": quote, "occurrence": anchorOccurrence(input)}, policy)
	return a.commentSubmissionResult(r.Context(), id)
}
func (a *App) storeConversation(r *http.Request, post, draft, policy Row) {
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	a.storeConversationTx(r, tx, post, draft, policy)
	must(tx.Commit())
}
func (a *App) storeConversationTx(r *http.Request, tx *sql.Tx, post, draft, policy Row) {
	a.bindConversationName(r.Context(), tx, post, draft)
	approved := !policy.yes("requireEmailVerification") && !policy.yes("requireApproval")
	inserted := a.queryPostTransaction(r.Context(), tx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id", draft["id"], post["id"], draft["name"], draft["email"], draft["body"], approved)
	if inserted == nil {
		a.checkSubmissionReplay(r.Context(), tx, draft)
		return
	}
	a.execInteraction(r.Context(), tx, "INSERT INTO comment_submissions(comment_id,payload_hash,email_required,approval_required) VALUES($1,$2,$3,$4)", draft["id"], draft["hash"], policy["requireEmailVerification"], policy["requireApproval"])
	a.execInteraction(r.Context(), tx, "INSERT INTO comment_authors(comment_id,reader_id) VALUES($1,$2)", draft["id"], draft["reader"])
	if draft.str("quote") != "" {
		a.execInteraction(r.Context(), tx, "INSERT INTO passage_questions(comment_id,quote,revision) VALUES($1,$2,$3)", draft["id"], draft["quote"], post["revision"])
		a.insertAnchor(r.Context(), tx, draft.str("id"), post, "question", draft.str("quote"), draft["occurrence"].(int))
	}
}
func (a *App) checkSubmissionReplay(ctx context.Context, tx *sql.Tx, draft Row) {
	row := a.queryPostTransaction(ctx, tx, "SELECT payload_hash FROM comment_submissions WHERE comment_id=$1", draft["id"])
	if row.str("payload_hash") != draft.str("hash") {
		fail(409, "This submission ID belongs to a different comment. Start a new submission.")
	}
}
func (a *App) commentSubmission(ctx context.Context, id string) Row {
	return first(a.DB.Must(ctx, "SELECT s.*,c.email,c.approved FROM comment_submissions s JOIN comments c ON c.id=s.comment_id WHERE s.comment_id=$1", id))
}
func (a *App) commentSubmissionResult(ctx context.Context, id string) Row {
	state := a.commentSubmission(ctx, id)
	verification := state.yes("email_required") && state["verified_at"] == nil
	message := "Your contribution has been accepted and will appear while conversations are open."
	if !state.yes("approved") {
		message = "Your contribution is awaiting approval."
	}
	if verification {
		message = "Check your email to verify this contribution. It stays private until verified. You can resend the link after 15 minutes."
	}
	if verification && state["token_hash"] == nil {
		message = "Email verification is required. Please wait 15 minutes after your last verification email, then use Resend verification email."
	}
	return Row{"ok": true, "submissionId": id, "pending": !state.yes("approved"), "verificationRequired": verification, "message": message}
}

// Lock the reader row so concurrent first comments cannot choose different names.
// Save the name in the same transaction as the contribution; failed submissions
// must not consume the reader's one-time choice.
func (a *App) bindConversationName(ctx context.Context, tx *sql.Tx, post, draft Row) {
	reader := a.queryPostTransaction(ctx, tx, `UPDATE comment_readers
		SET name=CASE WHEN name='' THEN COALESCE(
			(SELECT c.name FROM comment_authors ca JOIN comments c ON c.id=ca.comment_id
			 WHERE ca.reader_id=comment_readers.id ORDER BY c.created_at,c.id LIMIT 1), $2)
			ELSE name END WHERE id=$1 RETURNING name`, draft["reader"], draft["name"])
	draft["name"] = reader["name"]
	draft["hash"] = hash(encode(Row{"reader": draft["reader"], "post": post["id"], "name": draft["name"], "email": draft["email"], "body": draft["body"], "quote": draft["quote"], "kind": draft.str("kind")}))
}
