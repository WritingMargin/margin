package blog

import (
	"context"
	"database/sql"
	"net/http"
)

func (a *App) localMemberPrincipal(ctx context.Context, subject string) Row {
	member := first(a.DB.Must(ctx, `SELECT u.id,u.email,u.name,u.auth_version,m.role,m.version FROM engine_users u JOIN engine_memberships m ON m.user_id=u.id WHERE u.id=$1 AND u.enabled=TRUE`, subject))
	if member == nil {
		return nil
	}
	articles := []string{}
	versions := map[string]string{}
	for _, grant := range a.DB.Must(ctx, "SELECT post_id,version FROM engine_article_grants WHERE user_id=$1 ORDER BY post_id", subject) {
		articles = append(articles, grant.str("post_id"))
		versions[grant.str("post_id")] = grant.str("version")
	}
	return Row{"authenticated": true, "subject": subject, "email": member["email"], "name": member["name"], "role": member["role"], "authVersion": member["auth_version"], "membershipVersion": member["version"], "articleIds": articles, "articleGrantVersions": versions, "primaryOwner": false}
}
func (a *App) localTeamRequest(r *http.Request, action string, fields Row) Row {
	if !a.localTeamActionAllowed(r, action, fields) {
		fail(403, "Only an owner can manage the publication team.")
	}
	switch action {
	case "list":
		return a.localTeamList(r.Context())
	case "list_members":
		return a.localTeamMembersPage(r.Context(), fields)
	case "list_invitations":
		return a.localTeamInvitationsPage(r.Context(), fields)
	case "invite":
		return a.createLocalInvitation(r, fields)
	case "resend":
		return a.resendLocalInvitation(r, fields.str("invitationId"))
	case "revoke":
		a.DB.Must(r.Context(), "UPDATE engine_invitations SET status='revoked' WHERE id=$1 AND status='pending'", fields["invitationId"])
	default:
		return a.mutateLocalMember(r, action, fields)
	}
	return Row{"ok": true}
}
func (a *App) mutateLocalMember(r *http.Request, action string, fields Row) Row {
	subject := fields.str("memberSubject")
	if subject == "local-owner" {
		fail(403, "The publication owner cannot be removed or have their role changed.")
	}
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	// Serialize changes with invitation acceptance and credential resets. Keep
	// the lock order consistent before changing memberships or article grants.
	a.queryPostTransaction(r.Context(), tx, "UPDATE engine_users SET id=id WHERE id=$1 RETURNING id", subject)
	if a.queryPostTransaction(r.Context(), tx, "SELECT user_id FROM engine_memberships WHERE user_id=$1", subject) == nil {
		fail(404, "This teammate is no longer a member of the publication.")
	}
	switch action {
	case "update":
		a.updateLocalMember(r.Context(), tx, subject, fields.str("role"))
	case "remove":
		a.cloudTxExec(r.Context(), tx, "DELETE FROM engine_article_grants WHERE user_id=$1", subject)
		a.cloudTxExec(r.Context(), tx, "DELETE FROM engine_memberships WHERE user_id=$1", subject)
		a.revokeLocalMemberSessions(r.Context(), tx, subject)
	case "revoke_article":
		a.revokeLocalArticle(r.Context(), tx, subject, fields.str("articleId"))
	default:
		fail(400, "Unknown team action.")
	}
	must(tx.Commit())
	return Row{"ok": true}
}
func (a *App) updateLocalMember(ctx context.Context, tx *sql.Tx, subject, role string) {
	if !validMemberRole(role) {
		fail(400, "Choose a valid team role.")
	}
	if role == "peer_reviewer" && a.queryPostTransaction(ctx, tx, "SELECT post_id FROM engine_article_grants WHERE user_id=$1 LIMIT 1", subject) == nil {
		fail(400, "Invite this person to an article before changing them to Peer reviewer.")
	}
	a.cloudTxExec(ctx, tx, "UPDATE engine_memberships SET role=$1 WHERE user_id=$2", role, subject)
}
func (a *App) revokeLocalArticle(ctx context.Context, tx *sql.Tx, subject, article string) {
	a.cloudTxExec(ctx, tx, "DELETE FROM engine_article_grants WHERE user_id=$1 AND post_id=$2", subject, article)
	if a.queryPostTransaction(ctx, tx, "SELECT post_id FROM engine_article_grants WHERE user_id=$1 LIMIT 1", subject) != nil {
		return
	}
	removed := a.queryPostTransaction(ctx, tx, "DELETE FROM engine_memberships WHERE user_id=$1 AND role='peer_reviewer' RETURNING user_id", subject)
	if removed != nil {
		a.revokeLocalMemberSessions(ctx, tx, subject)
	}
}
func (a *App) revokeLocalMemberSessions(ctx context.Context, tx *sql.Tx, subject string) {
	a.cloudTxExec(ctx, tx, "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM session_principals WHERE subject=$1)", subject)
}

func (a *App) localTeamActionAllowed(r *http.Request, action string, fields Row) bool {
	role := a.requestRole(r)
	return role == "owner" || (action == "invite" && fields.str("role") == "peer_reviewer" && (role == "writer" || role == "publisher"))
}
