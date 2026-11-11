package blog

import (
	"context"
	"html"
)

func (a *App) deliverPasswordRecovery(ctx context.Context, config Row, email, value string) {
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["publicUrl"], input["to"], input["resetToken"] = a.newsletterOrigin(ctx), email, value
		result := a.serviceRequest(ctx, "/v1/newsletter/owner-password-reset", input, "")
		if !result.yes("accepted") {
			fail(502, "Margin email did not accept the password reset message.")
		}
		return
	}
	name := a.settings(ctx).str("name")
	content := `<h1>Reset your password</h1><p>A password reset was requested for your owner account on ` + html.EscapeString(name) + `.</p><p><a href="` + html.EscapeString(a.newsletterOrigin(ctx)+"/admin/reset-password#"+value) + `">Choose a new password</a></p><p>This link expires in 30 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.</p>`
	a.sendSMTPMessage(ctx, config.str("senderEmail"), email, name, "Reset your owner password", content)
}
