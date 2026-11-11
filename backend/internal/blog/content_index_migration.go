package blog

import (
	"context"
	"database/sql"
	"fmt"
)

// MigrateContentIndexes catches up posts saved before the search and media
// indexes existed. Run it before accepting requests; normal post saves keep
// both indexes current afterward.
func (a *App) MigrateContentIndexes(ctx context.Context) error {
	lastID := ""
	for {
		rows, err := a.DB.Query(ctx, `SELECT p.* FROM posts p
			LEFT JOIN post_search_documents s ON s.post_id=p.id AND s.revision=p.revision
			LEFT JOIN post_media_indexed m ON m.post_id=p.id AND m.revision=p.revision
			WHERE p.id>$1 AND (s.post_id IS NULL OR m.post_id IS NULL)
			ORDER BY p.id LIMIT 50`, lastID)
		if err != nil {
			return fmt.Errorf("find posts needing content indexes: %w", err)
		}
		if len(rows) == 0 {
			return nil
		}
		for _, row := range rows {
			if err := ctx.Err(); err != nil {
				return err
			}
			content, err := a.Storage.Get(ctx, row.str("content_key"))
			if err != nil {
				return fmt.Errorf("read post %s for content indexes: %w", row.str("id"), err)
			}
			if err := a.migrateContentIndexRevision(ctx, row, string(content)); err != nil {
				return fmt.Errorf("index post %s: %w", row.str("id"), err)
			}
			lastID = row.str("id")
		}
	}
}

func (a *App) migrateContentIndexRevision(ctx context.Context, row Row, content string) error {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	query, args := a.DB.adapt("UPDATE post_write_lock SET id=id WHERE id=1 RETURNING id", nil)
	var lockID int
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&lockID); err != nil {
		return err
	}
	current, err := a.postIndexRow(ctx, tx, row.str("id"))
	if err != nil {
		return err
	}
	if current == nil || current.str("revision") != row.str("revision") {
		return nil
	}
	if err := a.indexPostMediaRefs(ctx, tx, current, content); err != nil {
		return err
	}
	if err := a.indexPostSearch(ctx, tx, current, content); err != nil {
		return err
	}
	return tx.Commit()
}

func (a *App) postIndexRow(ctx context.Context, tx *sql.Tx, id string) (Row, error) {
	query, args := a.DB.adapt("SELECT * FROM posts WHERE id=$1", []any{id})
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	if !rows.Next() {
		return nil, rows.Err()
	}
	row, err := scanRow(rows, columns)
	if err != nil {
		return nil, err
	}
	return row, rows.Err()
}

func (a *App) execPostIndex(ctx context.Context, tx *sql.Tx, query string, args ...any) error {
	query, args = a.DB.adapt(query, args)
	_, err := tx.ExecContext(ctx, query, args...)
	return err
}
