package blog

import (
	"context"
	"html"
	"net/http"
	"time"
)

func (a *App) invitePeer(w http.ResponseWriter, r *http.Request) {
	if a.cloudOwner(r.Context()).str("subject") != "" {
		input := body(w, r)
		input["articleId"] = r.PathValue("id")
		input["role"] = "peer_reviewer"
		a.inviteCentralPeer(w, r, input)
		return
	}
	a.limit(r, "peer-invite", 30, time.Hour, true)
	ctx := r.Context()
	email := emailField(body(w, r), "email", true)
	draft := a.reviewDraft(r, r.PathValue("id"))
	origin := a.newsletterOrigin(ctx)
	if origin == "" {
		fail(503, "Set the publication URL before sending review invitations.")
	}
	config := a.newsletterSettings(ctx)
	id := token()
	tx := a.peerTransaction(ctx, draft.str("id"), draft.str("revision"))
	defer tx.Rollback()
	inserted := a.queryPostTransaction(ctx, tx, `INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, id, draft["id"], email)
	if inserted == nil {
		fail(409, "This reviewer already has an invitation to the draft.")
	}
	must(tx.Commit())
	delivered := false
	defer func() {
		if !delivered {
			a.DB.Must(context.WithoutCancel(ctx), "DELETE FROM peer_reviews WHERE id=$1 AND status='Requested'", id)
		}
	}()
	a.deliverReviewInvitation(ctx, config, origin, id, email)
	delivered = true
	send(w, 201, Row{"id": id, "status": "Requested"})
}
func (a *App) deliverReviewInvitation(ctx context.Context, config Row, origin, id, email string) {
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["invite"] = origin, email, id
		if !a.serviceRequest(ctx, "/v1/newsletter/peer-review", input, "").yes("accepted") {
			fail(502, "Margin email did not accept the invitation.")
		}
		return
	}
	if a.smtpSettings(ctx).str("host") == "" {
		fail(503, "Configure email delivery in Readers settings before inviting a reviewer.")
	}
	content := `<p>You have been invited to review a draft. Sign in with Google or an email link using this email address.</p><p><a href="` + html.EscapeString(origin+"/review/"+id) + `">Review the draft</a></p>`
	a.sendSMTPMessage(ctx, config.str("senderEmail"), email, a.settings(ctx).str("name"), "Invitation to review a draft", content)
}
