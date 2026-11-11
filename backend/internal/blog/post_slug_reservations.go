package blog

import (
	"context"
	"database/sql"
)

// A draft's intended URL reserves its slug just like a live post. Serialize the
// short metadata transactions so cross-table slug checks also hold on PostgreSQL.
// All writers acquire this lock before locking individual posts or drafts.
func (a *App) lockPostWrites(ctx context.Context, tx *sql.Tx) {
	a.queryPostTransaction(ctx, tx, "UPDATE post_write_lock SET id=id WHERE id=1 RETURNING id")
}

func (a *App) checkPostDraftSlug(ctx context.Context, tx *sql.Tx, row Row) {
	other := a.queryPostTransaction(ctx, tx, "SELECT post_id FROM post_drafts WHERE slug=$1 AND post_id<>$2", row["slug"], row["id"])
	if other != nil {
		coded(409, "This slug is reserved by another post's working draft.", "SLUG_CONFLICT")
	}
	if row.str("status") == "draft" {
		staged := a.queryPostTransaction(ctx, tx, "SELECT post_id FROM post_drafts WHERE post_id=$1", row["id"])
		if staged != nil {
			coded(409, "A working draft was created concurrently. Read both versions before unpublishing again.", "REVISION_CONFLICT")
		}
	}
}
