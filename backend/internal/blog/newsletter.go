package blog

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

var newsletterTokenRE = regexp.MustCompile(`^[a-f0-9]{64}$`)
var newsletterAccepted = Row{"message": "If this address needs confirmation, check your inbox for a link. It may take a few minutes."}

func (a *App) newsletterOrigin(ctx context.Context) string {
	raw := a.domainSettings(ctx).str("url")
	if raw == "" {
		raw = os.Getenv("PUBLIC_URL")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		return ""
	}
	if u.Scheme != "https" && !(os.Getenv("MARGIN_ENV") != "production" && u.Scheme == "http") {
		return ""
	}
	return u.Scheme + "://" + u.Host + BasePath()
}
func newsletterSettings(input Row) Row {
	strict(input, "enabled", "delivery", "senderEmail")
	booleanField(input, "enabled")
	enumField(input, "delivery", "managed", "smtp")
	sender := stringField(input, "senderEmail", 0, 254, true)
	if sender != "" {
		sender = emailField(input, "senderEmail", true)
	}
	if input.str("delivery") == "smtp" {
		sender = validSMTPSender(input)
	}
	return Row{"enabled": input["enabled"], "delivery": input["delivery"], "senderEmail": sender}
}
func (a *App) newsletterSettings(ctx context.Context) Row {
	row := first(a.DB.Must(ctx, "SELECT configuration FROM newsletter_settings WHERE id=1"))
	if row == nil {
		return Row{"enabled": false, "delivery": "managed", "senderEmail": ""}
	}
	return newsletterSettings(object(row["configuration"]))
}

func (a *App) newsletterEntitled(ctx context.Context) (entitled, verified bool) {
	defer func() {
		if recover() != nil {
			entitled = false
			verified = false
		}
	}()
	return a.access(ctx).yes("newsletter"), true
}
func (a *App) newsletterStatus(ctx context.Context, current Row) Row {
	if current == nil {
		current = a.newsletterSettings(ctx)
	}
	current["smtp"] = smtpPublic(a.smtpSettings(ctx))
	current["defaultSenderEmail"] = ""
	current["effectiveSenderEmail"] = current["senderEmail"]
	current["domain"] = nil
	current["accountConnected"] = false
	issues := []string{}
	current["entitled"] = true
	if current.str("delivery") == "smtp" {
		if object(current["smtp"]).str("host") == "" {
			issues = append(issues, "Configure your SMTP server before opening subscriptions.")
		}
	} else {
		issues = a.managedNewsletterStatus(ctx, current)
	}
	if a.newsletterOrigin(ctx) == "" {
		issues = append(issues, "Set your blog’s public HTTPS URL in Domain settings.")
	}
	current["ready"] = len(issues) == 0
	current["issues"] = issues
	count := first(a.DB.Must(ctx, "SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE status='subscribed'"))
	current["subscriberCount"] = count["total"]
	return current
}
func (a *App) managedNewsletterStatus(ctx context.Context, current Row) (issues []string) {
	issues = []string{}
	current["accountConnected"] = a.accountToken(ctx) != ""
	defer func() {
		if recover() != nil {
			issues = append(issues, "Margin email is unavailable. Check your account connection and try again.")
		}
	}()
	entitled, verified := a.newsletterEntitled(ctx)
	current["entitled"] = entitled
	if !verified || !entitled {
		return []string{"Margin email requires a connected account and an active Starter or Studio plan."}
	}
	status := a.serviceRequest(ctx, "/v1/newsletter/status", a.managedNewsletterInput(ctx, current), "")
	for _, key := range []string{"defaultSenderEmail", "effectiveSenderEmail", "domain"} {
		current[key] = status[key]
	}
	if !status.yes("ready") {
		issues = append(issues, status.str("issue"))
	}
	return
}
func (a *App) managedNewsletterInput(ctx context.Context, config Row) Row {
	return Row{"blogName": a.settings(ctx).str("name"), "senderEmail": config.str("senderEmail")}
}
func (a *App) newsletterDomain(w http.ResponseWriter, r *http.Request) {
	a.require(r.Context(), "newsletter")
	a.limit(r, "newsletter-domain", 10, time.Hour, true)
	input := body(w, r)
	strict(input, "senderEmail")
	email := emailField(input, "senderEmail", true)
	route := "/v1/newsletter/domain"
	if strings.HasSuffix(r.URL.Path, "/verify") {
		route += "/verify"
	}
	send(w, 200, a.serviceRequest(r.Context(), route, Row{"senderEmail": email}, ""))
}
func (a *App) newsletterRoutes() {
	a.campaignRoutes()
	a.mux.HandleFunc("POST /api/newsletter/smtp/test", a.smtpTest)
	a.mux.HandleFunc("POST /api/newsletter/domain", a.newsletterDomain)
	a.mux.HandleFunc("POST /api/newsletter/domain/verify", a.newsletterDomain)
	a.mux.HandleFunc("GET /api/newsletter/settings", func(w http.ResponseWriter, r *http.Request) { send(w, 200, a.newsletterStatus(r.Context(), nil)) })
	a.mux.HandleFunc("PUT /api/newsletter/settings", a.saveNewsletterSettings)
	a.mux.HandleFunc("GET /api/public/newsletter", a.publicNewsletter)
	a.mux.HandleFunc("POST /api/public/newsletter/subscribe", a.subscribeNewsletter)
	a.mux.HandleFunc("POST /api/public/newsletter/confirm", a.confirmNewsletter)
	a.mux.HandleFunc("POST /api/public/newsletter/unsubscribe", a.unsubscribeNewsletter)
}
func (a *App) saveNewsletterSettings(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "enabled", "delivery", "senderEmail", "smtp")
	smtpInput, hasSMTP := input["smtp"]
	delete(input, "smtp")
	if _, ok := input["enabled"]; !ok {
		input["enabled"] = a.newsletterSettings(r.Context())["enabled"]
	}
	config := newsletterSettings(input)
	if config.yes("enabled") && config.str("delivery") == "managed" {
		a.require(r.Context(), "newsletter")
	}
	if hasSMTP {
		a.saveSMTP(r.Context(), object(smtpInput))
	}
	a.DB.Must(r.Context(), "INSERT INTO newsletter_settings(id,configuration) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET configuration=EXCLUDED.configuration", encode(config))
	send(w, 200, a.newsletterStatus(r.Context(), config))
}
func (a *App) publicNewsletter(w http.ResponseWriter, r *http.Request) {
	config := a.newsletterSettings(r.Context())
	enabled := false
	if config.yes("enabled") {
		enabled = a.newsletterStatus(r.Context(), config).yes("ready")
	}
	send(w, 200, Row{"enabled": enabled})
}
func newsletterToken() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	must(err)
	return hex.EncodeToString(b)
}
func (a *App) subscribeNewsletter(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "newsletter-subscribe", 10, time.Hour, false)
	input := body(w, r)
	strict(input, "email", "website")
	email := emailField(input, "email", true)
	website := ""
	if _, ok := input["website"]; ok {
		website = stringField(input, "website", 0, 500, false)
	}
	config := a.newsletterStatus(r.Context(), nil)
	if !config.yes("enabled") || !config.yes("ready") {
		fail(503, "Subscriptions are not available right now. Please try again later.")
	}
	if website != "" {
		send(w, 202, newsletterAccepted)
		return
	}
	token, unsubscribe := newsletterToken(), newsletterToken()
	// Reserve the send atomically so concurrent subscriptions cannot duplicate email.
	reserved := a.DB.Must(r.Context(), `INSERT INTO newsletter_subscribers(email,status,confirmation_hash,confirmation_expires_at,unsubscribe_hash,last_requested_at)
 VALUES($1,'pending',$2,NOW()+INTERVAL '24 hours',$3,NOW())
 ON CONFLICT(email) DO UPDATE SET status='pending',confirmation_hash=EXCLUDED.confirmation_hash,
 confirmation_expires_at=EXCLUDED.confirmation_expires_at,unsubscribe_hash=EXCLUDED.unsubscribe_hash,last_requested_at=NOW()
 WHERE newsletter_subscribers.status <> 'subscribed' AND
 (newsletter_subscribers.last_requested_at IS NULL OR newsletter_subscribers.last_requested_at < NOW()-INTERVAL '15 minutes') RETURNING email`, email, hash(token), hash(unsubscribe))
	if len(reserved) > 0 {
		a.sendNewsletterConfirmation(r.Context(), config, email, token, unsubscribe)
	}
	send(w, 202, newsletterAccepted)
}
func (a *App) sendNewsletterConfirmation(ctx context.Context, config Row, email, token, unsubscribe string) {
	defer func() {
		if recover() != nil {
			a.DB.Must(ctx, "UPDATE newsletter_subscribers SET confirmation_hash=NULL,confirmation_expires_at=NULL,last_requested_at=NULL WHERE email=$1 AND confirmation_hash=$2", email, hash(token))
			fail(502, "We couldn’t send a confirmation email. Please try again later.")
		}
	}()
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"] = a.newsletterOrigin(ctx)
		input["to"] = email
		input["confirmationToken"] = token
		input["unsubscribeToken"] = unsubscribe
		result := a.serviceRequest(ctx, "/v1/newsletter/confirmation", input, "")
		if !result.yes("accepted") {
			fail(502, "Margin email did not accept the confirmation message.")
		}
		return
	}
	content := newsletterConfirmationForPublication(a.settings(ctx).str("name"), a.newsletterOrigin(ctx), token, unsubscribe)
	a.sendSMTP(ctx, config.str("effectiveSenderEmail"), email, a.settings(ctx).str("name"), content)

}
func newsletterConfirmationHTML(origin, token, unsubscribe string) string {
	return newsletterConfirmationForPublication("The journal", origin, token, unsubscribe)
}
func newsletterInput(w http.ResponseWriter, r *http.Request) string {
	input := body(w, r)
	strict(input, "token")
	token := input.str("token")
	if !newsletterTokenRE.MatchString(token) {
		fail(400, "token: invalid token")
	}
	return token
}
func (a *App) confirmNewsletter(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "newsletter-token", 60, 15*time.Minute, false)
	token := newsletterInput(w, r)
	if a.confirmReaderLink(w, r, token) {
		return
	}
	config := a.newsletterSettings(r.Context())
	if config.str("delivery") == "managed" {
		a.require(r.Context(), "newsletter")
	}
	if !config.yes("enabled") {
		fail(409, "Subscriptions are currently paused. Please try again later.")
	}
	rows := a.DB.Must(r.Context(), "UPDATE newsletter_subscribers SET status='subscribed',confirmed_at=NOW(),confirmation_hash=NULL,confirmation_expires_at=NULL WHERE confirmation_hash=$1 AND status='pending' AND confirmation_expires_at>NOW() RETURNING email", hash(token))
	if len(rows) == 0 {
		fail(400, "This confirmation link has expired or was already used. Request a new link from the blog if needed.")
	}
	a.startReaderSession(w, r, rows[0].str("email"))
	send(w, 200, Row{"message": "You’re subscribed and signed in. Thank you for reading!"})
}
func (a *App) unsubscribeNewsletter(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "newsletter-token", 60, 15*time.Minute, false)
	token := newsletterInput(w, r)
	rows := a.DB.Must(r.Context(), "UPDATE newsletter_subscribers SET status='unsubscribed',confirmation_hash=NULL,confirmation_expires_at=NULL WHERE unsubscribe_hash=$1 OR email IN (SELECT email FROM reader_email_links WHERE unsubscribe_hash=$1) OR email IN (SELECT email FROM newsletter_deliveries WHERE unsubscribe_hash=$1) OR email IN (SELECT email FROM author_update_deliveries WHERE unsubscribe_hash=$1) RETURNING email", hash(token))
	if len(rows) == 0 {
		fail(400, "This unsubscribe link is invalid. Please use the link from your latest email.")
	}
	send(w, 200, Row{"message": "You’re unsubscribed. You won’t receive this newsletter."})
}
