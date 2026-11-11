package blog

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const passwordRecoveryMessage = "If this address belongs to an eligible account, a password reset link will arrive shortly. Check your inbox and spam folder."

func (a *App) passwordRecoveryRoutes() {
	a.mux.HandleFunc("POST /api/public/password/forgot", a.forgotPassword)
	a.mux.HandleFunc("POST /api/public/password/reset", a.resetPassword)
}

func (a *App) forgotPassword(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "password-forgot", 5, time.Hour, false)
	input := body(w, r)
	strict(input, "email")
	email := emailField(input, "email", false)
	// Do account lookups and email delivery off the response path so neither
	// response content nor delivery latency reveals account eligibility.
	select {
	case a.passwordMailSlots <- struct{}{}:
		a.passwordMailTasks.Add(1)
		go a.sendPasswordRecovery(context.WithoutCancel(r.Context()), email)
	default:
	}
	send(w, http.StatusAccepted, Row{"message": passwordRecoveryMessage})
}

func (a *App) sendPasswordRecovery(parent context.Context, email string) {
	defer a.passwordMailTasks.Done()
	defer func() { <-a.passwordMailSlots }()
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	value := newsletterToken()
	defer func() {
		if recover() != nil {
			cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
			defer stop()
			_, _ = a.DB.Query(cleanup, "DELETE FROM owner_password_resets WHERE token_hash=$1", hash(value))
			log.Print("Owner password recovery email could not be delivered; check email configuration.")
		}
	}()
	if a.cloudOwner(ctx).str("subject") != "" {
		return
	}
	owner := a.ownerEmail(ctx)
	if owner.str("email") != email || !owner.yes("verified") {
		return
	}
	config := a.ownerEmailDelivery(ctx)
	if !a.reservePasswordRecovery(ctx, email, value) {
		return
	}
	a.deliverPasswordRecovery(ctx, config, email, value)
}

func (a *App) reservePasswordRecovery(ctx context.Context, email, value string) bool {
	now := time.Now().UTC()
	stamp := func(t time.Time) string { return t.Format("2006-01-02T15:04:05.000Z") }
	rows := a.DB.Must(ctx, `INSERT INTO owner_password_resets(id,email,password_hash,token_hash,expires_at,sent_at)
 SELECT id,email,password_hash,$1,$2,$3 FROM admins WHERE id=1 AND email=$4
 ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,
 token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,sent_at=EXCLUDED.sent_at
 WHERE owner_password_resets.sent_at<$5 RETURNING id`, hash(value), stamp(now.Add(30*time.Minute)), stamp(now), email, stamp(now.Add(-time.Minute)))
	return len(rows) == 1
}

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "password-reset", 15, 15*time.Minute, false)
	input := body(w, r)
	strict(input, "token", "password")
	value := stringField(input, "token", 64, 64, false)
	password := stringField(input, "password", 12, 128, false)
	if !newsletterTokenRE.MatchString(value) {
		fail(400, "This password reset link is invalid or expired.")
	}
	if len([]byte(password)) > 72 {
		fail(400, "Password must be at most 72 UTF-8 bytes.")
	}
	if a.cloudOwner(r.Context()).str("subject") != "" {
		fail(400, "Reset your password through your Margin Central account.")
	}
	digest, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	must(err)
	a.consumePasswordRecovery(r.Context(), value, string(digest))
	send(w, 200, Row{"message": "Password updated. Sign in with your new password."})
}

func (a *App) consumePasswordRecovery(ctx context.Context, value, digest string) {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	query, args := a.DB.adapt(`DELETE FROM owner_password_resets WHERE token_hash=$1 AND expires_at>NOW()
 AND email=(SELECT email FROM admins WHERE id=1) AND password_hash=(SELECT password_hash FROM admins WHERE id=1)
 AND EXISTS(SELECT 1 FROM owner_email_verification v WHERE v.id=1 AND v.email=owner_password_resets.email AND v.verified_at IS NOT NULL)
 RETURNING id`, []any{hash(value)})
	var id int
	err = tx.QueryRowContext(ctx, query, args...).Scan(&id)
	if err == sql.ErrNoRows {
		fail(400, "This password reset link is invalid, expired, or already used. Request a new one.")
	}
	must(err)
	query, args = a.DB.adapt("UPDATE admins SET password_hash=$1 WHERE id=$2", []any{digest, id})
	_, err = tx.ExecContext(ctx, query, args...)
	must(err)
	_, err = tx.ExecContext(ctx, "DELETE FROM sessions")
	must(err)
	must(tx.Commit())
}
