package blog

import (
	"context"
	"html"
	"log"
	"net/url"
	"time"
)

func (a *App) readerAlertTick(ctx context.Context) {
	defer func() {
		if recover() != nil {
			log.Print("Reader alert queue paused after an error; pending alerts remain saved.")
		}
	}()
	a.DB.Must(ctx, "UPDATE reader_alert_deliveries SET status='uncertain',message='Sending was interrupted. Verify provider acceptance before resending.' WHERE status='sending' AND started_at<$1", time.Now().Add(-15*time.Minute).Unix())
	next := first(a.DB.Must(ctx, `SELECT d.*,a.kind,a.body,a.target_id,p.slug,p.status AS post_status
		FROM reader_alert_deliveries d JOIN reader_alerts a ON a.id=d.alert_id LEFT JOIN posts p ON p.id=a.post_id
		WHERE d.status='pending' ORDER BY a.created_at,a.id LIMIT 1`))
	if next == nil {
		return
	}
	config := a.ownerEmailDelivery(ctx)
	claimed := first(a.DB.Must(ctx, "UPDATE reader_alert_deliveries SET status='sending',started_at=$2 WHERE alert_id=$1 AND status='pending' RETURNING alert_id", next["alert_id"], time.Now().Unix()))
	if claimed != nil {
		a.sendReaderAlertDelivery(ctx, next, config)
	}
}

func (a *App) sendReaderAlertDelivery(ctx context.Context, delivery, config Row) {
	state, message := "uncertain", "Email acceptance could not be confirmed. Check the provider before resending."
	defer func() {
		_ = recover()
		a.DB.Must(context.WithoutCancel(ctx), "UPDATE reader_alert_deliveries SET status=$2,message=$3 WHERE alert_id=$1 AND status='sending'", delivery["alert_id"], state, message)
	}()
	if first(a.DB.Must(ctx, "SELECT comment_id FROM public_notes WHERE comment_id=$1", delivery["target_id"])) != nil {
		state, message = "skipped", "Public notes are no longer available."
		return
	}
	setting := first(a.DB.Must(ctx, "SELECT email_enabled FROM reader_alert_settings WHERE reader_id=$1", delivery["reader_id"]))
	if setting == nil || !setting.yes("email_enabled") {
		state, message = "skipped", "Reader disabled alert emails before sending."
		return
	}
	if delivery.str("post_status") != "published" {
		state, message = "skipped", "Article is no longer public."
		return
	}
	origin := a.newsletterOrigin(ctx)
	article := origin + "/post/" + url.PathEscape(delivery.str("slug"))
	if delivery.str("kind") == "section_updated" {
		article += "#contribution-" + url.PathEscape(delivery.str("target_id"))
	} else {
		article += "?thread=" + url.QueryEscape(delivery.str("target_id"))
	}
	settings := origin + "/reader/alerts"
	subject := readerAlertEmailSubject(delivery.str("kind"))
	key := hash("reader-alert:" + delivery.str("alert_id"))
	sendCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	if config.str("delivery") == "managed" {
		payload := a.managedNewsletterInput(sendCtx, config)
		payload["publicUrl"], payload["to"], payload["kind"] = origin, delivery["email"], delivery["kind"]
		payload["articleUrl"], payload["settingsUrl"], payload["messageKey"] = article, settings, key
		if !a.serviceRequest(sendCtx, "/v1/newsletter/reader-alert", payload, "").yes("accepted") {
			fail(502, "Reader alert email was not accepted.")
		}
	} else {
		content := `<h1>` + html.EscapeString(subject) + `</h1><p>There is an update to a conversation on ` + html.EscapeString(a.settings(sendCtx).str("name")) + `.</p><p><a href="` + html.EscapeString(article) + `">Open the article</a></p><p><a href="` + html.EscapeString(settings) + `">View alerts and email settings</a></p><p>You received this because you turned on reader alert emails. This does not subscribe you to a newsletter.</p>`
		a.sendSMTPMessage(sendCtx, config.str("senderEmail"), delivery.str("email"), a.settings(sendCtx).str("name"), subject, content)
	}
	state, message = "accepted", "Accepted by the email provider."
}

func readerAlertEmailSubject(kind string) string {
	switch kind {
	case "author_answered":
		return "The author answered you"
	case "section_updated":
		return "The section you noted was updated"
	default:
		return "Someone replied"
	}
}
