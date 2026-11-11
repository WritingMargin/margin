package blog

import "context"

// Older email readers may already have contributions but no saved profile name.
// Recover their first name rather than inviting another choice.
func (a *App) commentReaderProfile(ctx context.Context, reader Row) Row {
	if reader.str("name") != "" {
		return reader
	}
	return first(a.DB.Must(ctx, `UPDATE comment_readers SET name=CASE WHEN name='' THEN COALESCE(
		(SELECT c.name FROM comment_authors ca JOIN comments c ON c.id=ca.comment_id
		 WHERE ca.reader_id=comment_readers.id ORDER BY c.created_at,c.id LIMIT 1), name) ELSE name END
		WHERE id=$1 RETURNING *`, reader["id"]))
}
