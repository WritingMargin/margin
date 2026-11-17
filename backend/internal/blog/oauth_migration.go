package blog

import (
	"context"
	"database/sql"
	"strings"
)

// Rebuild the three grant tables in one transaction. Legacy grants retain
// subject 1 and their hashes, expiry and rotation/revocation state unchanged.
func (d *Database) migrateOAuthMembers() error {
	ctx := context.Background()
	tx, err := d.SQL.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "UPDATE oauth_lock SET revision=revision+1 WHERE id=1"); err != nil {
		return err
	}
	migrated, err := oauthMembersMigrated(ctx, tx, d.Kind)
	if err != nil {
		return err
	}
	if migrated {
		return tx.Commit()
	}
	start := strings.Index(schema, "CREATE TABLE IF NOT EXISTS oauth_consents (")
	end := strings.Index(schema, "CREATE INDEX IF NOT EXISTS oauth_tokens_family_idx")
	definition := schema[start:end]
	for _, name := range []string{"oauth_consents", "oauth_codes", "oauth_tokens"} {
		definition = strings.ReplaceAll(definition, name, name+"_members")
	}
	if _, err = tx.ExecContext(ctx, definition); err != nil {
		return err
	}
	statements := []string{
		"INSERT INTO oauth_consents_members(client_id,subject_id,legacy_admin_id,data) SELECT client_id,subject_id,subject_id,data FROM oauth_consents",
		"INSERT INTO oauth_codes_members(code_hash,client_id,subject_id,expires_at,data) SELECT c.code_hash,c.client_id,g.subject_id,c.expires_at,c.data FROM oauth_codes c JOIN oauth_consents g ON g.client_id=c.client_id",
		"INSERT INTO oauth_tokens_members(access_hash,refresh_hash,client_id,subject_id,family_id,expires_at,rotated,revoked,data) SELECT t.access_hash,t.refresh_hash,t.client_id,g.subject_id,t.family_id,t.expires_at,t.rotated,t.revoked,t.data FROM oauth_tokens t JOIN oauth_consents g ON g.client_id=t.client_id",
		"DROP TABLE oauth_tokens", "DROP TABLE oauth_codes", "DROP TABLE oauth_consents",
		"ALTER TABLE oauth_consents_members RENAME TO oauth_consents", "ALTER TABLE oauth_codes_members RENAME TO oauth_codes", "ALTER TABLE oauth_tokens_members RENAME TO oauth_tokens",
	}
	for _, q := range statements {
		if _, err = tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	indexEnd := strings.Index(schema[end:], "\n\n") + end
	if _, err = tx.ExecContext(ctx, schema[end:indexEnd]); err != nil {
		return err
	}
	return tx.Commit()
}

func oauthMembersMigrated(ctx context.Context, tx *sql.Tx, kind string) (bool, error) {
	query := "SELECT name FROM pragma_table_info('oauth_codes') WHERE name='subject_id'"
	if kind == "postgres" {
		query = "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='oauth_codes' AND column_name='subject_id'"
	}
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	migrated := rows.Next()
	return migrated, rows.Err()
}
