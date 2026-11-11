package blog

import (
	"context"
	"database/sql"
)

// Keep public media access in step with the current published revision. The
// content is passed to SQL for matching and remains encrypted in object storage;
// only the matching asset URLs are stored in SQLite or PostgreSQL.
func (a *App) indexPostMediaRefs(ctx context.Context, tx *sql.Tx, row Row, content string) error {
	if err := a.execPostIndex(ctx, tx, "DELETE FROM post_media_references WHERE post_id=$1", row["id"]); err != nil {
		return err
	}
	contains := "strpos"
	if a.DB.Kind == "sqlite" {
		contains = "instr"
	}
	query := `INSERT INTO post_media_references(post_id,revision,address)
		SELECT p.id,p.revision,assets.address FROM posts p CROSS JOIN (
			SELECT '/api/public/covers/' || id AS address FROM uploaded_covers
			UNION ALL SELECT '/api/public/videos/' || id FROM uploaded_videos
			UNION ALL SELECT '/api/public/audio/' || id FROM uploaded_audio
			UNION ALL SELECT '/api/public/models/' || id FROM uploaded_models
		) AS assets
		WHERE p.id=$1 AND p.revision=$2 AND p.status='published' AND ` + contains + `($3,assets.address)>0`
	if err := a.execPostIndex(ctx, tx, query, row["id"], row["revision"], content); err != nil {
		return err
	}
	return a.execPostIndex(ctx, tx, `INSERT INTO post_media_indexed(post_id,revision) VALUES($1,$2)
		ON CONFLICT(post_id) DO UPDATE SET revision=EXCLUDED.revision`, row["id"], row["revision"])
}

func (a *App) uploadInPublishedContent(ctx context.Context, address string) bool {
	return a.publishedMediaReference(ctx, address)
}

func (a *App) publishedMediaReference(ctx context.Context, address string) bool {
	return len(a.DB.Must(ctx, `SELECT 1 FROM post_media_references m JOIN posts p ON p.id=m.post_id
		WHERE m.address=$1 AND p.status='published' AND p.revision=m.revision LIMIT 1`, address)) > 0
}
