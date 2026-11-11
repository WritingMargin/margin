package blog

import (
	"context"
	"html"
	"net/http"
	"time"
)

func (a *App) commentEmailLogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comment-email-login", 10, time.Hour, false)
	input := body(w, r)
	strict(input, "email", "returnTo")
	email := emailField(input, "email", true)
	target := commentReturnPath(input)
	config := a.ownerEmailDelivery(r.Context())
	value, browser := newsletterToken(), newsletterToken()
	now := commentAuthExpiry(0)
	cutoff := commentAuthExpiry(-15 * time.Minute)
	reserved := a.DB.Must(r.Context(), "INSERT INTO comment_login_throttle(email,last_sent_at) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET last_sent_at=EXCLUDED.last_sent_at WHERE comment_login_throttle.last_sent_at<$3 RETURNING email", email, now, cutoff)
	if len(reserved) > 0 {
		a.sendCommentLogin(r.Context(), config, Row{"email": email, "value": value, "browser": browser, "target": target, "sentAt": now})
		commentFlowCookie(w, "margin_comment_email", browser, 900)
	}
	send(w, 202, Row{"message": "Check your email for a sign-in link and open it in this browser. You can request another after 15 minutes."})
}
func (a *App) sendCommentLogin(ctx context.Context, config, input Row) {
	token := input.str("value")
	defer func() {
		if recover() != nil {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			a.DB.Must(cleanup, "DELETE FROM comment_login_links WHERE token_hash=$1", hash(token))
			a.DB.Must(cleanup, "DELETE FROM comment_login_throttle WHERE email=$1 AND last_sent_at=$2", input["email"], input["sentAt"])
			fail(502, "The sign-in email could not be sent. Please try again.")
		}
	}()
	a.DB.Must(ctx, "DELETE FROM comment_login_links WHERE expires_at<NOW()")
	a.DB.Must(ctx, "INSERT INTO comment_login_links(token_hash,email,browser_hash,return_path,expires_at) VALUES($1,$2,$3,$4,$5)", hash(token), input["email"], hash(input.str("browser")), input["target"], commentAuthExpiry(15*time.Minute))
	if config.str("delivery") == "managed" {
		payload := a.managedNewsletterInput(ctx, config)
		payload["publicUrl"], payload["to"], payload["verificationToken"] = a.newsletterOrigin(ctx), input["email"], token
		if !a.serviceRequest(ctx, "/v1/newsletter/reader-sign-in", payload, "").yes("accepted") {
			fail(502, "Sign-in email was not accepted.")
		}
		return
	}
	content := `<h1>Sign in to Margin</h1><p><a href="` + html.EscapeString(a.newsletterOrigin(ctx)+"/reader/sign-in#"+token) + `">Sign in</a></p><p>Open this link in the browser where you requested it. It expires in 15 minutes and can be used once. Signing in does not subscribe you to a newsletter. If you did not request this, ignore this email.</p>`
	a.sendSMTPMessage(ctx, config.str("senderEmail"), input.str("email"), a.settings(ctx).str("name"), "Sign in to Margin", content)
}
func (a *App) confirmCommentLogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comment-email-confirm", 30, 15*time.Minute, false)
	input := body(w, r)
	strict(input, "token")
	token := stringField(input, "token", 64, 64, false)
	cookie, err := r.Cookie(sessionCookieName("margin_comment_email"))
	if err != nil {
		fail(400, "Open the sign-in link in the browser where you requested it.")
	}
	row := first(a.DB.Must(r.Context(), "DELETE FROM comment_login_links WHERE token_hash=$1 AND browser_hash=$2 AND expires_at>NOW() RETURNING email,return_path", hash(token), hash(cookie.Value)))
	if row == nil {
		fail(400, "This link expired, was already used, or belongs to another browser. Request a new sign-in link.")
	}
	reader := a.commentIdentity(r.Context(), "email:"+row.str("email"), "email", row.str("email"), "")
	a.startCommentSession(w, r, reader)
	send(w, 200, Row{"returnTo": row["return_path"]})
}
