package blog

import "context"

func setupPublicationType(input Row) string {
	if _, selected := input["publicationType"]; !selected {
		return "blog"
	}
	return enumField(input, "publicationType", "blog", "article", "research")
}

func (a *App) createOwner(ctx context.Context, email, digest, kind string) {
	theme := a.settings(ctx)
	theme["publicationType"] = kind
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	query, args := a.DB.adapt("INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING", []any{email, digest})
	result, err := tx.ExecContext(ctx, query, args...)
	must(err)
	count, err := result.RowsAffected()
	must(err)
	if count == 0 {
		coded(409, "This workspace is already set up. Please sign in.", "SETUP_COMPLETE")
	}
	query, args = a.DB.adapt("INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", []any{encode(theme)})
	_, err = tx.ExecContext(ctx, query, args...)
	must(err)
	must(tx.Commit())
}
