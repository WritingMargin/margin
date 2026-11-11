package blog

import (
	"context"
	"log"
	"net/http"
	"time"
)

func (a *App) queueCampaign(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "campaign-send", 20, time.Hour, true)
	input := body(w, r)
	strict(input, "revision", "audience")
	a.campaignReady(r.Context())
	row := a.campaign(r.Context(), r.PathValue("id"))
	// Repeating an accepted request never schedules another delivery.
	if row.str("status") != "draft" {
		a.campaignPublic(r.Context(), row, true)
		send(w, 200, row)
		return
	}
	a.requireCampaignCurrent(r.Context(), row, input.str("revision"))
	expected, ok := input["audience"].(float64)
	if !ok || expected < 1 {
		fail(409, "There are no confirmed subscribers to send to.")
	}
	a.reserveCampaign(r.Context(), row, expected)
	row = a.campaign(r.Context(), row.str("id"))
	a.campaignPublic(r.Context(), row, true)
	send(w, 202, row)
}
func (a *App) reserveCampaign(ctx context.Context, row Row, expected float64) {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	locked := a.queryPostTransaction(ctx, tx, "UPDATE newsletter_campaigns SET status='queued',queued_at=NOW() WHERE id=$1 AND status='draft' AND revision=$2 RETURNING id", row["id"], row["revision"])
	if locked == nil {
		fail(409, "This campaign was already queued. Reload its progress.")
	}
	// The audience snapshot and queue commit together. Pending/unsubscribed readers
	// never enter the queue, and the worker checks subscription status again.
	rows, err := tx.QueryContext(ctx, "SELECT email FROM newsletter_subscribers WHERE status='subscribed' ORDER BY email")
	must(err)
	var emails []string
	for rows.Next() {
		var email string
		must(rows.Scan(&email))
		emails = append(emails, email)
	}
	must(rows.Err())
	must(rows.Close())
	if float64(len(emails)) != expected {
		fail(409, "The audience changed. Reload the campaign and review the new recipient count.")
	}
	for _, email := range emails {
		token := newsletterToken()
		query, args := a.DB.adapt("INSERT INTO newsletter_deliveries(campaign_id,email,unsubscribe_hash) VALUES($1,$2,$3)", []any{row["id"], email, hash(token)})
		_, err = tx.ExecContext(ctx, query, args...)
		must(err)
	}
	must(tx.Commit())
}

// Durable queue, with one recipient per second. Ambiguous failures are retained
// for review and never replayed automatically, including after process restart.
func (a *App) RunNewsletterCampaigns(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.campaignTick(ctx)
			a.authorUpdateTick(ctx)
			a.readerAlertTick(ctx)
		}
	}
}
func (a *App) campaignTick(ctx context.Context) {
	defer func() {
		if recover() != nil {
			log.Print("Newsletter queue paused after an error; pending recipients remain saved.")
		}
	}()
	a.DB.Must(ctx, "UPDATE newsletter_deliveries SET status='uncertain',message='Sending was interrupted. Verify provider acceptance before any manual resend.' WHERE status='sending' AND started_at<$1", time.Now().Add(-15*time.Minute).Unix())
	a.DB.Must(ctx, `UPDATE newsletter_campaigns SET status='complete' WHERE status='queued' AND NOT EXISTS
 (SELECT 1 FROM newsletter_deliveries d WHERE d.campaign_id=newsletter_campaigns.id AND d.status IN ('pending','sending'))`)
	config := a.newsletterSettings(ctx)
	if !config.yes("enabled") {
		return
	}
	next := first(a.DB.Must(ctx, `SELECT d.* FROM newsletter_deliveries d JOIN newsletter_campaigns c ON c.id=d.campaign_id WHERE d.status='pending' AND c.status='queued' ORDER BY c.queued_at,d.email LIMIT 1`))
	if next == nil {
		return
	}
	claimed := first(a.DB.Must(ctx, "UPDATE newsletter_deliveries SET status='sending',started_at=$3 WHERE campaign_id=$1 AND email=$2 AND status='pending' RETURNING *", next["campaign_id"], next["email"], time.Now().Unix()))
	if claimed != nil {
		a.sendCampaignDelivery(ctx, claimed)
	}
}
func (a *App) sendCampaignDelivery(ctx context.Context, delivery Row) {
	state, message := "uncertain", "Email acceptance could not be confirmed. Check the provider before resending."
	defer func() {
		_ = recover() // A provider timeout may happen after acceptance: never replay it.
		a.DB.Must(context.WithoutCancel(ctx), "UPDATE newsletter_deliveries SET status=$3,message=$4 WHERE campaign_id=$1 AND email=$2 AND status='sending'", delivery["campaign_id"], delivery["email"], state, message)
	}()
	subscriber := first(a.DB.Must(ctx, "SELECT email FROM newsletter_subscribers WHERE email=$1 AND status='subscribed'", delivery["email"]))
	if subscriber == nil {
		state, message = "skipped", "Reader unsubscribed before sending."
		return
	}
	campaign := a.campaign(ctx, delivery.str("campaign_id"))
	snapshot := decodeCampaign(campaign)
	if !a.campaignPostsAvailable(ctx, snapshot) {
		state, message = "skipped", "An article changed after the campaign was queued. Create a new campaign."
		return
	}
	config := a.campaignReady(ctx)
	token := newsletterToken()
	a.DB.Must(ctx, "UPDATE newsletter_deliveries SET unsubscribe_hash=$3 WHERE campaign_id=$1 AND email=$2 AND status='sending'", delivery["campaign_id"], delivery["email"], hash(token))
	snapshot.Issue.UnsubscribeURL = snapshot.Issue.PublicationURL + "/newsletter/unsubscribe#" + string(token)
	snapshot.Issue.Preview = false
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	a.deliverCampaign(ctx, config, delivery.str("email"), snapshot.Issue, hash(delivery.str("campaign_id")+":"+delivery.str("email")))
	state, message = "accepted", "Accepted by the email provider."
}
func (a *App) campaignPostsAvailable(ctx context.Context, snapshot campaignSnapshot) bool {
	for i, id := range snapshot.PostIDs {
		post := first(a.DB.Must(ctx, "SELECT revision FROM posts WHERE id=$1 AND status='published'", id))
		if post == nil || post.str("revision") != snapshot.Revisions[i] {
			return false
		}
	}
	return true
}
