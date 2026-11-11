package blog

import (
	"context"
	"net/http"
	"time"
)

func (a *App) ownerEmailRoutes() {
	a.mux.HandleFunc("GET /api/account/email-verification", a.ownerEmailStatus)
	a.mux.HandleFunc("POST /api/account/email-verification", a.requestOwnerVerification)
	a.mux.HandleFunc("POST /api/public/owner-email/verify", a.verifyOwnerEmail)
}

// Match the current address on every read: a later email change must not inherit
// verification or eligibility for password recovery from the old address.
func (a *App) ownerEmail(ctx context.Context) Row {
	row := first(a.DB.Must(ctx, `SELECT admins.email,v.verified_at,v.last_requested_at
 FROM admins LEFT JOIN owner_email_verification v ON v.id=admins.id AND v.email=admins.email WHERE admins.id=1`))
	if row == nil {
		return nil
	}
	return Row{"email": row["email"], "verified": row["verified_at"] != nil, "verifiedAt": row["verified_at"], "lastSentAt": row["last_requested_at"]}
}

func (a *App) ownerEmailStatus(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.ownerEmail(r.Context()))
}

func (a *App) requestOwnerVerification(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "owner-email-send", 10, time.Hour, true)
	strict(body(w, r))
	result := a.tryOwnerVerification(r.Context())
	status := http.StatusAccepted
	if result.str("status") == "unavailable" {
		status = http.StatusServiceUnavailable
	}
	send(w, status, result)
}

func (a *App) tryOwnerVerification(ctx context.Context) (result Row) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	// Delivery failure must never undo signup or prevent workspace access.
	defer func() {
		if failure := recover(); failure != nil {
			result = Row{"status": "unavailable", "error": "We couldn’t send your verification email. Check Email delivery in Readers → Settings, then try again."}
			if problem, ok := failure.(*HTTPError); ok && problem.Code == "OWNER_EMAIL_CONFIGURATION" {
				result["error"] = problem.Message
			}
		}
	}()
	owner := a.ownerEmail(ctx)
	if owner == nil {
		return Row{"status": "unavailable", "error": "Create your owner account first."}
	}
	if owner.yes("verified") {
		return Row{"status": "verified", "message": "Your email is already verified."}
	}
	config := a.ownerEmailDelivery(ctx)
	value := newsletterToken()
	reserved := a.reserveOwnerVerification(ctx, value)
	if reserved == nil {
		return Row{"status": "pending", "message": "Check your inbox for the latest link. You can request another email after one minute."}
	}
	a.deliverOwnerVerification(ctx, config, reserved.str("email"), value)
	return Row{"status": "sent", "message": "Verification email sent. The link expires in 24 hours."}
}

func (a *App) reserveOwnerVerification(ctx context.Context, value string) Row {
	now := time.Now().UTC()
	stamp := func(value time.Time) string { return value.Format("2006-01-02T15:04:05.000Z") }
	return first(a.DB.Must(ctx, `INSERT INTO owner_email_verification(id,email,token_hash,expires_at,last_requested_at)
 SELECT id,email,$1,$2,$3 FROM admins WHERE id=1
 ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,verified_at=NULL,token_hash=EXCLUDED.token_hash,
 expires_at=EXCLUDED.expires_at,last_requested_at=EXCLUDED.last_requested_at
 WHERE owner_email_verification.email<>EXCLUDED.email OR
 (owner_email_verification.verified_at IS NULL AND (owner_email_verification.last_requested_at IS NULL OR owner_email_verification.last_requested_at<$4))
 RETURNING email`, hash(value), stamp(now.Add(24*time.Hour)), stamp(now), stamp(now.Add(-time.Minute))))
}

func (a *App) verifyOwnerEmail(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "owner-email-verify", 30, 15*time.Minute, false)
	value := newsletterInput(w, r)
	rows := a.DB.Must(r.Context(), `UPDATE owner_email_verification SET verified_at=NOW(),token_hash=NULL,expires_at=NULL
 WHERE token_hash=$1 AND expires_at>NOW() AND verified_at IS NULL
 AND email=(SELECT email FROM admins WHERE id=1) RETURNING id`, hash(value))
	if len(rows) == 0 {
		fail(400, "This verification link has expired or was already used. Sign in and request a new one.")
	}
	// Proving mailbox access does not create a login session or subscribe the owner.
	send(w, 200, Row{"verified": true, "message": "Your email is verified."})
}
