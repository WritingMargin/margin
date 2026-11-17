package blog

import (
	"context"
	"database/sql"
	"html"
	"time"
)

func (a *App) sendMemberPasswordRecovery(ctx context.Context, email, value string) bool {
	user := first(a.DB.Must(ctx, "SELECT * FROM engine_users WHERE email=$1 AND enabled=TRUE", email))
	if user == nil {
		return false
	}
	config := a.ownerEmailDelivery(ctx)
	now := time.Now().UTC()
	rows := a.DB.Must(ctx, `INSERT INTO engine_password_resets(user_id,email,password_hash,token_hash,expires_at,sent_at)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,sent_at=EXCLUDED.sent_at
 WHERE engine_password_resets.sent_at<$7 RETURNING user_id`, user["id"], email, user["password_hash"], hash(value), now.Add(30*time.Minute).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), now.Add(-time.Minute).Format(time.RFC3339Nano))
	if len(rows) > 0 {
		a.deliverMemberPasswordRecovery(ctx, config, email, value)
	}
	return true
}
func (a *App) deliverMemberPasswordRecovery(ctx context.Context, config Row, email, value string) {
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["resetToken"] = a.newsletterOrigin(ctx), email, value
		if !a.serviceRequest(ctx, "/v1/newsletter/member-password-reset", input, "").yes("accepted") {
			fail(502, "Margin email did not accept the password reset message.")
		}
		return
	}
	address := a.newsletterOrigin(ctx) + "/admin/reset-password#" + value
	content := `<h1>Reset your password</h1><p>Reset your account password for ` + html.EscapeString(a.settings(ctx).str("name")) + `.</p><p><a href="` + html.EscapeString(address) + `">Reset password</a></p><p>This link expires in 30 minutes and can be used once. Other publications are unaffected.</p><p>If you did not request this, ignore this email.</p>`
	a.sendSMTPMessage(ctx, config.str("senderEmail"), email, a.settings(ctx).str("name"), "Reset your publication password", content)
}
func (a *App) consumeMemberPasswordRecovery(ctx context.Context, value, digest string) bool {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	query, args := a.DB.adapt(`DELETE FROM engine_password_resets WHERE token_hash=$1 AND expires_at>NOW()
 AND EXISTS(SELECT 1 FROM engine_users u WHERE u.id=engine_password_resets.user_id AND u.email=engine_password_resets.email AND u.password_hash=engine_password_resets.password_hash AND u.enabled=TRUE) RETURNING user_id`, []any{hash(value)})
	var id string
	err = tx.QueryRowContext(ctx, query, args...).Scan(&id)
	if err == sql.ErrNoRows {
		return false
	}
	must(err)
	a.cloudTxExec(ctx, tx, "UPDATE engine_users SET password_hash=$1,auth_version=$2 WHERE id=$3", digest, token(), id)
	a.cloudTxExec(ctx, tx, "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM session_principals WHERE subject=$1)", id)
	must(tx.Commit())
	return true
}
