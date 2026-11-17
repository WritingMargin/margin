package blog

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (a *App) teamAccept(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-accept", 15, 15*time.Minute, false)
	input := body(w, r)
	strict(input, "token", "email", "password", "name")
	value := stringField(input, "token", 64, 64, false)
	if !newsletterTokenRE.MatchString(value) {
		fail(400, "This invitation is invalid or has expired.")
	}
	email := emailField(input, "email", true)
	password := stringField(input, "password", 1, 128, false)
	if len([]byte(password)) > 72 {
		fail(400, "password: Password must be at most 72 UTF-8 bytes")
	}
	user := a.acceptLocalInvitation(r.Context(), value, email, password, input)
	principal := a.localMemberPrincipal(r.Context(), user.str("id"))
	if principal == nil {
		fail(401, "Your publication membership could not be verified.")
	}
	// A concurrent password reset must never upgrade an authentication performed
	// with an earlier password to the new credential version.
	principal["authVersion"] = user["auth_version"]
	a.startMemberSession(w, r, principal)
	send(w, 200, Row{"authenticated": true})
}
func (a *App) acceptLocalInvitation(ctx context.Context, value, email, password string, input Row) Row {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	invitation := a.queryPostTransaction(ctx, tx, `UPDATE engine_invitations SET status='accepted' WHERE token_hash=$1 AND email=$2 AND status='pending' AND expires_at>NOW() RETURNING *`, hash(value), email)
	if invitation == nil {
		fail(400, "This invitation is invalid or has expired.")
	}
	if a.queryPostTransaction(ctx, tx, "SELECT id FROM admins WHERE LOWER(email)=$1", email) != nil {
		fail(400, "This email already belongs to the publication owner.")
	}
	user := a.localInvitationUser(ctx, tx, email, password, input)
	a.grantLocalInvitation(ctx, tx, user.str("id"), invitation)
	must(tx.Commit())
	return user
}
func (a *App) localInvitationUser(ctx context.Context, tx *sql.Tx, email, password string, input Row) Row {
	user := a.queryPostTransaction(ctx, tx, "UPDATE engine_users SET id=id WHERE email=$1 RETURNING *", email)
	if user == nil {
		stringField(input, "password", 12, 128, false)
		name := email
		if _, ok := input["name"]; ok {
			if provided := stringField(input, "name", 0, 100, true); provided != "" {
				name = provided
			}
		}
		digest, err := bcrypt.GenerateFromPassword([]byte(password), 12)
		must(err)
		a.cloudTxExec(ctx, tx, `INSERT INTO engine_users(id,email,name,password_hash,auth_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING`, uuid(), email, name, string(digest), uuid())
		user = a.queryPostTransaction(ctx, tx, "UPDATE engine_users SET id=id WHERE email=$1 RETURNING *", email)
	}
	if !user.yes("enabled") || bcrypt.CompareHashAndPassword([]byte(user.str("password_hash")), []byte(password)) != nil {
		fail(401, "Email or password is incorrect.")
	}
	return user
}
func (a *App) grantLocalInvitation(ctx context.Context, tx *sql.Tx, subject string, invitation Row) {
	role := invitation.str("role")
	if role == "peer_reviewer" {
		a.cloudTxExec(ctx, tx, `INSERT INTO engine_memberships(user_id,role,version) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING`, subject, role, uuid())
		a.cloudTxExec(ctx, tx, `INSERT INTO engine_article_grants(user_id,post_id,version) VALUES($1,$2,$3) ON CONFLICT(user_id,post_id) DO NOTHING`, subject, invitation["article_id"], uuid())
		return
	}
	a.cloudTxExec(ctx, tx, `INSERT INTO engine_memberships(user_id,role,version) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role`, subject, role, uuid())
}
