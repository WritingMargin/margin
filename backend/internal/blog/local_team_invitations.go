package blog

import (
	"context"
	"html"
	"net/http"
	"strings"
	"time"
)

func (a *App) createLocalInvitation(r *http.Request, input Row) Row {
	ctx := r.Context()
	email := strings.ToLower(strings.TrimSpace(input.str("email")))
	role := input.str("role")
	if !validMemberRole(role) {
		fail(400, "Choose a valid team role.")
	}
	if first(a.DB.Must(ctx, "SELECT id FROM admins WHERE LOWER(email)=$1", email)) != nil {
		fail(400, "This email already belongs to the publication owner.")
	}
	var article any
	if role == "peer_reviewer" {
		article = input.str("articleId")
		if first(a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1", article)) == nil {
			fail(404, "Choose an article to review.")
		}
	}
	value := newsletterToken()
	expires := time.Now().UTC().Add(7 * 24 * time.Hour).Format("2006-01-02T15:04:05.000Z")
	row := first(a.DB.Must(ctx, `INSERT INTO engine_invitations(id,email,role,article_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(email,role,COALESCE(article_id,'')) WHERE status='pending'
 DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at RETURNING *`, uuid(), email, role, article, hash(value), expires))
	a.deliverLocalInvitation(ctx, row, value)
	return localInvitationPublic(row)
}
func (a *App) resendLocalInvitation(r *http.Request, id string) Row {
	value := newsletterToken()
	row := first(a.DB.Must(r.Context(), `UPDATE engine_invitations SET token_hash=$1,expires_at=$2 WHERE id=$3 AND status='pending' RETURNING *`, hash(value), time.Now().UTC().Add(7*24*time.Hour).Format("2006-01-02T15:04:05.000Z"), id))
	if row == nil {
		fail(404, "This invitation is no longer pending.")
	}
	a.deliverLocalInvitation(r.Context(), row, value)
	return localInvitationPublic(row)
}
func (a *App) deliverLocalInvitation(ctx context.Context, invitation Row, value string) {
	config := a.ownerEmailDelivery(ctx)
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["invitationToken"], input["role"] = a.newsletterOrigin(ctx), invitation["email"], value, invitation["role"]
		result := a.serviceRequest(ctx, "/v1/newsletter/team-invitation", input, "")
		if !result.yes("accepted") {
			fail(502, "Margin email did not accept the invitation. Try resending it.")
		}
		return
	}
	name := a.settings(ctx).str("name")
	content := `<h1>Join ` + html.EscapeString(name) + `</h1><p>You have been invited to this publication. Create your account on this publication or sign in with your existing account to accept.</p><p><a href="` + html.EscapeString(a.newsletterOrigin(ctx)+"/admin/invite?token="+value) + `">Accept invitation</a></p><p>This invitation expires in seven days. Peer reviewers can access only the articles they are invited to.</p>`
	a.sendSMTPMessage(ctx, config.str("senderEmail"), invitation.str("email"), name, "You're invited to "+name, content)
}
func (a *App) teamInvitation(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-invitation", 60, 15*time.Minute, false)
	value := r.URL.Query().Get("token")
	if !newsletterTokenRE.MatchString(value) {
		fail(400, "This invitation is invalid or has expired.")
	}
	row := first(a.DB.Must(r.Context(), `SELECT * FROM engine_invitations WHERE token_hash=$1 AND status='pending' AND expires_at>NOW()`, hash(value)))
	if row == nil {
		fail(400, "This invitation is invalid or has expired.")
	}
	result := localInvitationPublic(row)
	result["accountExists"] = first(a.DB.Must(r.Context(), "SELECT id FROM engine_users WHERE email=$1", row["email"])) != nil
	send(w, 200, result)
}
