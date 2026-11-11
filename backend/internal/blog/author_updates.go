package blog

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (a *App) authorUpdate(ctx context.Context, postID string, includeDelivery bool) Row {
	row := first(a.DB.Must(ctx, "SELECT * FROM author_updates WHERE post_id=$1", postID))
	if row == nil {
		return nil
	}
	result := Row{"id": row["id"], "body": row["body"], "revision": row["revision"],
		"createdAt": row["created_at"], "updatedAt": row["updated_at"]}
	if includeDelivery {
		counts := Row{"pending": int64(0), "sending": int64(0), "accepted": int64(0), "uncertain": int64(0), "skipped": int64(0)}
		for _, item := range a.DB.Must(ctx, "SELECT status,COUNT(*) AS count FROM author_update_deliveries WHERE update_id=$1 GROUP BY status", row["id"]) {
			counts[item.str("status")] = item["count"]
		}
		result["deliveryStatus"] = counts
	}
	return result
}

func (a *App) readAuthorUpdate(w http.ResponseWriter, r *http.Request) {
	a.getPost(r.Context(), r.PathValue("id"))
	send(w, 200, Row{"authorUpdate": a.authorUpdate(r.Context(), r.PathValue("id"), true)})
}

func (a *App) saveAuthorUpdate(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "author-updates", 10, time.Hour, true)
	input := body(w, r)
	strict(input, "body")
	message := stringField(input, "body", 0, 500, true)
	post := a.getPost(r.Context(), r.PathValue("id"))
	if post.str("status") != "published" {
		fail(409, "Publish this article before pinning an update.")
	}
	if message == "" {
		a.DB.Must(r.Context(), `UPDATE author_update_deliveries SET status='skipped',message='The writer removed this update.'
			WHERE update_id=(SELECT id FROM author_updates WHERE post_id=$1) AND status='pending'`, post["id"])
		a.DB.Must(r.Context(), "DELETE FROM author_updates WHERE post_id=$1", post["id"])
		send(w, 200, Row{"authorUpdate": nil})
		return
	}
	// A public update always has a confirmed delivery route before publication.
	a.campaignReady(r.Context())
	id, revision := uuid(), uuid()
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockPostWrites(r.Context(), tx)
	current := a.queryPostTransaction(r.Context(), tx, "SELECT id FROM posts WHERE id=$1 AND status='published'", post["id"])
	if current == nil {
		fail(409, "The article is no longer published.")
	}
	a.execInteraction(r.Context(), tx, `UPDATE author_update_deliveries SET status='skipped',message='The writer replaced this update.'
		WHERE update_id=(SELECT id FROM author_updates WHERE post_id=$1) AND status='pending'`, post["id"])
	a.execInteraction(r.Context(), tx, `INSERT INTO author_updates(post_id,id,body,revision) VALUES($1,$2,$3,$4)
		ON CONFLICT(post_id) DO UPDATE SET id=EXCLUDED.id,body=EXCLUDED.body,revision=EXCLUDED.revision,updated_at=NOW()`, post["id"], id, message, revision)
	a.execInteraction(r.Context(), tx, "INSERT INTO author_update_history(id,post_id,body,revision) VALUES($1,$2,$3,$4)", id, post["id"], message, revision)
	query, args := a.DB.adapt("SELECT email FROM newsletter_subscribers WHERE status='subscribed' ORDER BY email", nil)
	rows, err := tx.QueryContext(r.Context(), query, args...)
	must(err)
	emails := []string{}
	for rows.Next() {
		var email string
		must(rows.Scan(&email))
		emails = append(emails, email)
	}
	must(rows.Err())
	must(rows.Close())
	for _, email := range emails {
		a.execInteraction(r.Context(), tx, "INSERT INTO author_update_deliveries(update_id,email,unsubscribe_hash) VALUES($1,$2,$3)", id, email, hash(newsletterToken()))
	}
	must(tx.Commit())
	send(w, 200, Row{"authorUpdate": a.authorUpdate(r.Context(), post.str("id"), true)})
}

// The campaign worker also processes author updates, preserving the same
// one-recipient-per-tick pacing and ambiguous-delivery safeguards.
func (a *App) authorUpdateTick(ctx context.Context) {
	defer func() {
		if recover() != nil {
			log.Print("Author update queue paused after an error; pending recipients remain saved.")
		}
	}()
	a.DB.Must(ctx, "UPDATE author_update_deliveries SET status='uncertain',message='Sending was interrupted. Verify provider acceptance before resending.' WHERE status='sending' AND started_at<$1", time.Now().Add(-15*time.Minute).Unix())
	next := first(a.DB.Must(ctx, `SELECT d.* FROM author_update_deliveries d JOIN author_updates u ON u.id=d.update_id
		WHERE d.status='pending' ORDER BY u.created_at,d.email LIMIT 1`))
	if next == nil {
		return
	}
	config := a.newsletterStatus(ctx, nil)
	if !config.yes("enabled") || !config.yes("ready") {
		return
	}
	claimed := first(a.DB.Must(ctx, "UPDATE author_update_deliveries SET status='sending',started_at=$3 WHERE update_id=$1 AND email=$2 AND status='pending' RETURNING *", next["update_id"], next["email"], time.Now().Unix()))
	if claimed != nil {
		a.sendAuthorUpdateDelivery(ctx, claimed, config)
	}
}

func (a *App) sendAuthorUpdateDelivery(ctx context.Context, delivery, config Row) {
	state, message := "uncertain", "Email acceptance could not be confirmed. Check the provider before resending."
	defer func() {
		_ = recover()
		a.DB.Must(context.WithoutCancel(ctx), "UPDATE author_update_deliveries SET status=$3,message=$4 WHERE update_id=$1 AND email=$2 AND status='sending'", delivery["update_id"], delivery["email"], state, message)
	}()
	subscriber := first(a.DB.Must(ctx, "SELECT email FROM newsletter_subscribers WHERE email=$1 AND status='subscribed'", delivery["email"]))
	if subscriber == nil {
		state, message = "skipped", "Reader unsubscribed before sending."
		return
	}
	update := first(a.DB.Must(ctx, "SELECT u.*,p.title,p.slug,p.status FROM author_updates u JOIN posts p ON p.id=u.post_id WHERE u.id=$1", delivery["update_id"]))
	if update == nil || update.str("status") != "published" {
		state, message = "skipped", "The article update is no longer public."
		return
	}
	origin := a.newsletterOrigin(ctx)
	token := newsletterToken()
	a.DB.Must(ctx, "UPDATE author_update_deliveries SET unsubscribe_hash=$3 WHERE update_id=$1 AND email=$2 AND status='sending'", delivery["update_id"], delivery["email"], hash(token))
	issue := newsletterIssue{Publication: a.settings(ctx).str("name"), PublicationURL: origin,
		Subject: "Update to " + update.str("title"), Intro: update.str("body"),
		Accent: campaignAccent(a.settings(ctx)), UnsubscribeURL: origin + "/newsletter/unsubscribe#" + token,
		Stories: []newsletterStory{{Title: update.str("title"), Excerpt: update.str("body"), URL: origin + "/post/" + url.PathEscape(update.str("slug"))}}}
	if strings.ContainsAny(issue.Subject, "\r\n") {
		state, message = "skipped", "Article title cannot be used in an email subject."
		return
	}
	sendCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	a.deliverCampaign(sendCtx, config, delivery.str("email"), issue, hash("author-update:"+delivery.str("update_id")+":"+delivery.str("email")))
	state, message = "accepted", "Accepted by the email provider."
}
