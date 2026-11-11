package blog

import (
	"context"
	"html"
	"net/http"
	"time"
)

func (a *App) commentVerificationRoutes() {
	a.mux.HandleFunc("POST /api/public/comments/verify", a.verifyCommentEmail)
	a.mux.HandleFunc("POST /api/public/comments/resend", a.resendCommentVerification)
	a.mux.HandleFunc("GET /comments/verify", a.publicPageHandler(a.commentVerificationHTML))
}
func (a *App) commentVerificationHTML(w http.ResponseWriter, r *http.Request) {
	theme := a.publicTheme(r)
	page := publicPage{Theme: theme, Title: "Verify your comment — " + theme.str("name"), Action: "comment", Status: 200}
	page.Data = publicJSON(Row{"theme": theme, "commentVerification": true})
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	a.renderPublic(w, r, page)
}
func (a *App) verifyCommentEmail(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comment-email-verify", 30, 15*time.Minute, false)
	value := stringField(body(w, r), "token", 64, 64, false)
	if !newsletterTokenRE.MatchString(value) {
		fail(400, "Invalid verification link.")
	}
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	state := a.queryPostTransaction(r.Context(), tx, "UPDATE comment_submissions SET verified_at=NOW(),token_hash=NULL,expires_at=NULL WHERE token_hash=$1 AND email_required=TRUE AND verified_at IS NULL AND expires_at>NOW() RETURNING comment_id,approval_required", hash(value))
	if state == nil {
		fail(400, "This verification link has expired or was already used. Request a new link from the comment form.")
	}
	a.execInteraction(r.Context(), tx, "UPDATE comments SET approved=$1 WHERE id=$2", !state.yes("approval_required"), state["comment_id"])
	must(tx.Commit())
	send(w, 200, a.commentSubmissionResult(r.Context(), state.str("comment_id")))
}
func (a *App) resendCommentVerification(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comment-email-resend", 5, 15*time.Minute, false)
	input := body(w, r)
	id := stringField(input, "submissionId", 1, 64, false)
	a.verifyCaptcha(r, stringField(input, "captchaToken", 1, 4096, false))
	state := a.commentSubmission(r.Context(), id)
	if state == nil {
		fail(404, "This pending comment no longer exists.")
	}
	if state.yes("email_required") && state["verified_at"] == nil {
		a.sendCommentVerification(r.Context(), state, a.ownerEmailDelivery(r.Context()))
	}
	send(w, 200, a.commentSubmissionResult(r.Context(), id))
}
func (a *App) sendCommentVerification(ctx context.Context, state, config Row) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	cutoff := time.Now().Add(-15 * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	reserved := a.DB.Must(ctx, "INSERT INTO comment_email_throttle(email,last_sent_at) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET last_sent_at=EXCLUDED.last_sent_at WHERE comment_email_throttle.last_sent_at<$3 RETURNING email", state["email"], now, cutoff)
	if len(reserved) == 0 {
		return
	}
	value := newsletterToken()
	defer a.cleanupFailedCommentMail(ctx, state, now, value)
	expires := time.Now().Add(24 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
	updated := a.DB.Must(ctx, "UPDATE comment_submissions SET token_hash=$1,expires_at=$2 WHERE comment_id=$3 AND verified_at IS NULL RETURNING comment_id", hash(value), expires, state["comment_id"])
	if len(updated) == 0 {
		return
	}
	a.deliverCommentVerification(ctx, config, state.str("email"), value)
}
func (a *App) cleanupFailedCommentMail(ctx context.Context, state Row, sentAt, value string) {
	if failure := recover(); failure != nil {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		a.DB.Must(cleanup, "UPDATE comment_submissions SET token_hash=NULL,expires_at=NULL WHERE comment_id=$1 AND token_hash=$2", state["comment_id"], hash(value))
		a.DB.Must(cleanup, "DELETE FROM comment_email_throttle WHERE email=$1 AND last_sent_at=$2", state["email"], sentAt)
		fail(502, "We couldn’t send the verification email. Retry the same submission; your comment will not be duplicated.")
	}
}
func (a *App) deliverCommentVerification(ctx context.Context, config Row, email, value string) {
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["verificationToken"] = a.newsletterOrigin(ctx), email, value
		if !a.serviceRequest(ctx, "/v1/newsletter/comment-verification", input, "").yes("accepted") {
			fail(502, "Margin email did not accept the verification message.")
		}
		return
	}
	content := commentVerificationEmail(a.newsletterOrigin(ctx), a.settings(ctx).str("name"), value)
	a.sendSMTPMessage(ctx, config.str("senderEmail"), email, a.settings(ctx).str("name"), "Verify your comment", content)
}
func commentVerificationEmail(origin, name, value string) string {
	return `<h1>Verify your comment</h1><p>Confirm your email for the comment or question you submitted to ` + html.EscapeString(name) + `.</p><p><a href="` + html.EscapeString(origin+"/comments/verify#"+value) + `">Verify my comment</a></p><p>This link expires in 24 hours and can be used once. The author may still need to approve your contribution. This does not sign you in or subscribe you to a newsletter.</p><p>If you didn’t submit a comment, ignore this email.</p>`
}
