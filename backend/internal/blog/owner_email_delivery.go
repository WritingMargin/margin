package blog

import (
	"context"
	"html"
	"time"
)

func (a *App) ownerEmailDelivery(ctx context.Context) Row {
	config := a.newsletterSettings(ctx)
	if a.newsletterOrigin(ctx) == "" {
		coded(503, "Set your public URL in Settings before sending account email.", "OWNER_EMAIL_CONFIGURATION")
	}
	if config.str("delivery") == "managed" {
		if a.accountToken(ctx) == "" {
			coded(503, "Connect Margin email or configure SMTP in Readers → Settings, then try again.", "OWNER_EMAIL_CONFIGURATION")
		}
		config = a.newsletterStatus(ctx, config)
		if !config.yes("ready") {
			coded(503, "Finish setting up Margin email in Readers → Settings, or choose your SMTP server, then try again.", "OWNER_EMAIL_CONFIGURATION")
		}
	} else if a.smtpSettings(ctx).str("host") == "" {
		coded(503, "Configure your SMTP server in Readers → Settings, then try again.", "OWNER_EMAIL_CONFIGURATION")
	}
	return config
}

func (a *App) deliverOwnerVerification(ctx context.Context, config Row, email, value string) {
	defer func() {
		if failure := recover(); failure != nil {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			a.DB.Must(cleanup, "UPDATE owner_email_verification SET token_hash=NULL,expires_at=NULL,last_requested_at=NULL WHERE token_hash=$1", hash(value))
			panic(failure)
		}
	}()
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["verificationToken"] = a.newsletterOrigin(ctx), email, value
		result := a.serviceRequest(ctx, "/v1/newsletter/owner-verification", input, "")
		if !result.yes("accepted") {
			fail(502, "Margin email did not accept the verification message.")
		}
		return
	}
	content := ownerVerificationHTML(a.newsletterOrigin(ctx), a.settings(ctx).str("name"), value)
	a.sendSMTPMessage(ctx, config.str("senderEmail"), email, a.settings(ctx).str("name"), "Verify your owner email", content)
}

func ownerVerificationHTML(origin, name, value string) string {
	return `<h1>Verify your email</h1><p>Confirm this email address for your owner account on ` + html.EscapeString(name) + `.</p><p><a href="` + html.EscapeString(origin+"/admin/verify-email#"+value) + `">Verify my email</a></p><p>This link expires in 24 hours and can be used once. Verification does not sign you in or subscribe you to a newsletter.</p><p>If you didn’t create this account, you can ignore this email.</p>`
}
