package blog

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"margin/backend/internal/contentcrypto"
)

// ReencryptionResult counts current referenced objects and saved credentials.
// Bucket versions and external backups are intentionally not rewritten.
type ReencryptionResult struct {
	Objects, Settings, AlreadyCurrent int
}

type keyRotation struct {
	previous, target *contentcrypto.Encryption
}

// Reencrypt supports online migration after every server instance has switched
// to the new primary key with the old key as a read fallback. Metadata is read
// in a short snapshot; conditional writes never replace concurrent edits.
func Reencrypt(ctx context.Context, db *Database, storage *S3Storage, previousKey string) (ReencryptionResult, error) {
	result := ReencryptionResult{}
	previous, err := contentcrypto.New(previousKey)
	if err != nil {
		return result, fmt.Errorf("CONTENT_ENCRYPTION_KEY_PREVIOUS must be 64 hexadecimal characters: %w", err)
	}
	if storage.encryption == nil {
		return result, contentcrypto.ErrKey
	}
	rotation := keyRotation{previous: previous, target: storage.encryption.PrimaryOnly()}
	keys, settings, err := rotation.snapshot(ctx, db)
	if err != nil {
		return result, err
	}
	if err := requireRotationStorage(storage, keys); err != nil {
		return result, err
	}
	objects, err := rotation.prepareObjects(ctx, storage, keys)
	if err != nil {
		return result, err
	}
	result, err = rotation.apply(ctx, db, storage, objects, settings)
	if err != nil {
		return result, err
	}
	return result, VerifyReencryption(ctx, db, storage)
}

// VerifyReencryption authenticates all currently referenced content and saved
// credentials with only the primary key, even when runtime fallback is enabled.
// Every server instance must already write with this primary key before the
// previous key can be retired. Backups and old bucket versions are not checked.
func VerifyReencryption(ctx context.Context, db *Database, storage *S3Storage) error {
	if storage.encryption == nil {
		return contentcrypto.ErrKey
	}
	primary := storage.encryption.PrimaryOnly()
	rotation := keyRotation{previous: primary, target: primary}
	keys, _, err := rotation.snapshot(ctx, db)
	if err != nil {
		return fmt.Errorf("primary-key verification failed: %w", err)
	}
	if err := requireRotationStorage(storage, keys); err != nil {
		return err
	}
	if _, err = rotation.prepareObjects(ctx, storage, keys); err != nil {
		return fmt.Errorf("primary-key verification failed; keep CONTENT_ENCRYPTION_KEY_PREVIOUS and rerun re-encryption: %w", err)
	}
	return nil
}

func requireRotationStorage(storage *S3Storage, keys []string) error {
	if len(keys) == 0 {
		return nil
	}
	return storage.require()
}

func (r keyRotation) snapshot(ctx context.Context, db *Database) ([]string, []rotationSetting, error) {
	opts := &sql.TxOptions{}
	if db.Kind == "postgres" {
		opts.Isolation = sql.LevelRepeatableRead
		opts.ReadOnly = true
	}
	tx, err := db.SQL.BeginTx(ctx, opts)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	keys, err := reencryptionKeys(ctx, tx)
	if err != nil {
		return nil, nil, err
	}
	settings, err := r.prepareSettings(ctx, tx)
	if err != nil {
		return nil, nil, err
	}
	return keys, settings, tx.Commit()
}

func reencryptionKeys(ctx context.Context, tx *sql.Tx) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT content_key AS key FROM posts
		UNION SELECT object_key FROM blog_logos
		UNION SELECT object_key FROM uploaded_covers
		UNION SELECT object_key FROM uploaded_videos
		UNION SELECT object_key FROM uploaded_audio
		UNION SELECT object_key FROM uploaded_models
		UNION SELECT object_key FROM generated_assets
		UNION SELECT object_key FROM source_documents
		UNION SELECT COALESCE(snapshot->>'content_key','') FROM post_revisions
		UNION SELECT COALESCE(snapshot->>'content_key','') FROM post_drafts
		ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		if key == "" {
			return nil, errors.New("content has an empty object key; repair metadata before re-encryption")
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// plaintext first tries the new key so retries never encrypt ciphertext or
// rewrite already migrated values. Authentication binds bucket and object key.
func (r keyRotation) plaintext(data []byte, bucket, key string) ([]byte, bool, error) {
	if plain, err := r.target.Decrypt(data, bucket, key); err == nil {
		return plain, true, nil
	}
	plain, err := r.previous.Decrypt(data, bucket, key)
	return plain, false, err
}

type rotationSetting struct {
	table, column, context, before, after, serviceURL string
	provider                                          string
}

func (r keyRotation) prepareSettings(ctx context.Context, tx *sql.Tx) ([]rotationSetting, error) {
	settings := []rotationSetting{
		{table: "turnstile_settings", column: "encrypted_configuration", context: "turnstile"},
		{table: "newsletter_smtp", column: "encrypted_configuration", context: "newsletter-smtp"},
		{table: "central_connection", column: "encrypted_token"},
		{table: "publishing_connections", column: "encrypted_token", provider: "google", context: "publishing:google"},
		{table: "publishing_connections", column: "encrypted_token", provider: "linkedin", context: "publishing:linkedin"},
	}
	result := []rotationSetting{}
	for _, setting := range settings {
		found, err := r.prepareSetting(ctx, tx, &setting)
		if err != nil {
			return nil, fmt.Errorf("preflight %s: %w", setting.table, err)
		}
		if found {
			result = append(result, setting)
		}
	}
	return result, nil
}

func (r keyRotation) prepareSetting(ctx context.Context, tx *sql.Tx, setting *rotationSetting) (bool, error) {
	query := "SELECT " + setting.column + " FROM " + setting.table + " WHERE id=1"
	destinations := []any{&setting.before}
	if setting.table == "central_connection" {
		query = "SELECT encrypted_token,service_url FROM central_connection WHERE id=1"
		destinations = append(destinations, &setting.serviceURL)
	}
	var args []any
	if setting.provider != "" {
		query = "SELECT encrypted_token FROM publishing_connections WHERE provider=$1"
		args = []any{setting.provider}
	}
	if err := tx.QueryRowContext(ctx, query, args...).Scan(destinations...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if setting.table == "central_connection" {
		setting.context = "central-account:" + setting.serviceURL
	}
	data, err := base64.StdEncoding.DecodeString(setting.before)
	if err != nil {
		return false, err
	}
	plain, current, err := r.plaintext(data, "settings", setting.context)
	if err != nil || current {
		return true, err
	}
	encrypted, err := r.target.Encrypt(plain, "settings", setting.context)
	setting.after = base64.StdEncoding.EncodeToString(encrypted)
	return true, err
}

func (r keyRotation) apply(ctx context.Context, db *Database, storage *S3Storage, objects []rotationObject, settings []rotationSetting) (ReencryptionResult, error) {
	result := ReencryptionResult{}
	for _, object := range objects {
		if object.current {
			result.AlreadyCurrent++
			continue
		}
		if err := r.writeObject(ctx, storage, object); err != nil {
			return result, fmt.Errorf("re-encrypt %s: %w; keep the previous-key fallback enabled and rerun re-encryption", object.key, err)
		}
		result.Objects++
	}
	for _, setting := range settings {
		if setting.after == "" {
			result.AlreadyCurrent++
			continue
		}
		if err := applyRotationSetting(ctx, db, setting); err != nil {
			return result, err
		}
		result.Settings++
	}
	return result, nil
}

func applyRotationSetting(ctx context.Context, db *Database, setting rotationSetting) error {
	queries := map[string]string{
		"publishing_connections.encrypted_token":     "UPDATE publishing_connections SET encrypted_token=$1 WHERE encrypted_token=$2 AND provider=$3",
		"turnstile_settings.encrypted_configuration": "UPDATE turnstile_settings SET encrypted_configuration=$1 WHERE id=1 AND encrypted_configuration=$2",
		"newsletter_smtp.encrypted_configuration":    "UPDATE newsletter_smtp SET encrypted_configuration=$1 WHERE id=1 AND encrypted_configuration=$2",
		"central_connection.encrypted_token":         "UPDATE central_connection SET encrypted_token=$1 WHERE id=1 AND encrypted_token=$2 AND service_url=$3",
	}
	query, ok := queries[setting.table+"."+setting.column]
	if !ok {
		return fmt.Errorf("unsupported re-encryption setting: %s.%s", setting.table, setting.column)
	}
	args := []any{setting.after, setting.before}
	if setting.provider != "" {
		args = append(args, setting.provider)
	}
	if setting.table == "central_connection" {
		args = append(args, setting.serviceURL)
	}
	result, err := db.SQL.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("%s changed during re-encryption; the concurrent edit was preserved; keep the previous-key fallback enabled and retry", setting.table)
	}
	return nil
}
