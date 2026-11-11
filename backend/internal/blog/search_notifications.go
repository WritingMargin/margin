package blog

import (
	"context"
	"database/sql"
	"net/url"
	"regexp"
	"time"
)

var indexNowKeyPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

const searchSubmissionWindow = time.Minute

const queueSearchSQL = `INSERT INTO search_notifications(url,origin,revision,status,next_attempt) VALUES($1,$2,$3,'queued',0)
 ON CONFLICT(url) DO UPDATE SET revision=EXCLUDED.revision,status='queued',attempts=0,next_attempt=0,message=''`

func (a *App) queueSearchURL(ctx context.Context, tx *sql.Tx, origin, address string) {
	query, args := a.DB.adapt(queueSearchSQL, []any{address, origin, uuid()})
	_, err := tx.ExecContext(ctx, query, args...)
	must(err)
}
func (a *App) queuePostSearch(ctx context.Context, tx *sql.Tx, origin string, previous, next Row) {
	if origin == "" {
		return
	}
	urls := map[string]bool{}
	for _, row := range []Row{previous, next} {
		if row.str("status") == "published" {
			urls[origin+"/post/"+url.PathEscape(row.str("slug"))] = true
		}
	}
	if len(urls) == 0 {
		return
	}
	urls[origin+"/"] = true
	for address := range urls {
		a.queueSearchURL(ctx, tx, origin, address)
	}
}
func (a *App) queueSearchSite(ctx context.Context, origin string) {
	// Read before opening a transaction: SQLite uses a single database connection.
	posts := a.DB.Must(ctx, "SELECT slug FROM posts WHERE status='published'")
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	a.queueSearchURL(ctx, tx, origin, origin+"/")
	for _, post := range posts {
		a.queueSearchURL(ctx, tx, origin, origin+"/post/"+url.PathEscape(post.str("slug")))
	}
	query, args := a.DB.adapt("UPDATE search_notifications SET status='queued',attempts=0,next_attempt=0 WHERE origin=$1 AND status='failed'", []any{origin})
	_, err = tx.ExecContext(ctx, query, args...)
	must(err)
	must(tx.Commit())
}
func (a *App) deletePostWithSearch(ctx context.Context, row Row) {
	origin := a.indexNowTarget(ctx)
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	deleted := a.queryPostTransaction(ctx, tx, "DELETE FROM posts WHERE id=$1 AND revision=$2 RETURNING id", row["id"], row["revision"])
	if deleted == nil {
		coded(409, "This post changed. Reload it before deleting.", "REVISION_CONFLICT")
	}
	a.queuePostSearch(ctx, tx, origin, row, nil)
	a.DB.notifyPostTransaction(ctx, tx, row.str("id"))
	must(tx.Commit())
	a.DB.postCommitted(row.str("id"))
}
