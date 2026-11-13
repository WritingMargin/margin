package blog

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

//go:embed schema.sql
var schema string

type Row map[string]any

func (r Row) str(k string) string { s, _ := r[k].(string); return s }
func (r Row) yes(k string) bool   { b, _ := r[k].(bool); return b }

type Database struct {
	SQL         *sql.DB
	Kind        string
	dsn         string
	postChanges postChangeHub
}

func databaseLocation(url, filename string) (string, string, error) {
	if url != "" {
		return "postgres", url, nil
	}
	if filename == "" {
		filename = ".data/margin.db"
	}
	if filename == ":memory:" {
		return "sqlite", filename, nil
	}
	absolute, err := filepath.Abs(filename)
	if err != nil {
		return "", "", err
	}
	if err = os.MkdirAll(filepath.Dir(absolute), 0700); err != nil {
		return "", "", err
	}
	file, err := os.OpenFile(absolute, os.O_CREATE|os.O_RDWR, 0600) // #nosec G304 -- SQLite location is selected by the server operator, not an HTTP request; the database is created with mode 0600.
	if err != nil {
		return "", "", err
	}
	if err = file.Close(); err != nil {
		return "", "", err
	}
	return "sqlite", absolute, os.Chmod(absolute, 0600)
}
func OpenDatabase(url, filename string) (*Database, error) {
	driver, dsn, err := databaseLocation(url, filename)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	result := &Database{SQL: db, Kind: driver, dsn: dsn}
	if err = result.initialize(); err != nil {
		return nil, errors.Join(err, db.Close())
	}
	return result, nil
}
func (d *Database) initialize() error {
	definition := schema
	if d.Kind == "sqlite" {
		if err := d.configureSQLite(); err != nil {
			return err
		}
		definition = sqliteSchema(schema)
	}
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(definition); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := d.migrateOAuthMembers(); err != nil {
		return err
	}
	if err := d.migrateAnalyticsVisitorIPs(); err != nil {
		return err
	}
	if err := d.migrateReaderNotesOwnership(); err != nil {
		return err
	}
	if err := d.migrateWritingChatSessionReferences(context.Background()); err != nil {
		return err
	}
	return d.pruneWritingChatSessions(context.Background())
}

func (d *Database) migrateAnalyticsVisitorIPs() error {
	_, err := d.SQL.Exec("UPDATE analytics_visits SET country='Unknown' WHERE country LIKE 'ip:%'")
	return err
}

// Private notes are attached to a verified reader email, independently of
// newsletter subscription. Older databases constrained that email to the
// subscribers table, so remove the constraint without changing saved notes.
func (d *Database) migrateReaderNotesOwnership() error {
	if d.Kind == "postgres" {
		_, err := d.SQL.Exec("ALTER TABLE reader_notes DROP CONSTRAINT IF EXISTS reader_notes_email_fkey")
		return err
	}
	keys, err := d.Query(context.Background(), "PRAGMA foreign_key_list(reader_notes)")
	if err != nil {
		return err
	}
	legacy := false
	for _, key := range keys {
		if key.str("table") == "newsletter_subscribers" && key.str("from") == "email" {
			legacy = true
			break
		}
	}
	if !legacy {
		return nil
	}
	if _, err := d.SQL.Exec("PRAGMA foreign_keys=OFF"); err != nil {
		return err
	}
	tx, err := d.SQL.Begin()
	if err != nil {
		d.SQL.Exec("PRAGMA foreign_keys=ON")
		return err
	}
	_, err = tx.Exec(`CREATE TABLE reader_notes_rebuild (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 email TEXT NOT NULL, quote TEXT NOT NULL, body TEXT NOT NULL, revision TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO reader_notes_rebuild(id,post_id,email,quote,body,revision,created_at)
 SELECT id,post_id,email,quote,body,revision,created_at FROM reader_notes;
DROP TABLE reader_notes;
ALTER TABLE reader_notes_rebuild RENAME TO reader_notes;
CREATE INDEX reader_notes_owner_idx ON reader_notes(email,post_id);`)
	if err == nil {
		err = tx.Commit()
	} else {
		_ = tx.Rollback()
	}
	_, restoreErr := d.SQL.Exec("PRAGMA foreign_keys=ON")
	return errors.Join(err, restoreErr)
}

func sqliteSchema(statement string) string {
	r := strings.NewReplacer("JSONB", "TEXT", "TIMESTAMPTZ", "TEXT", "NOW()", "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
	return r.Replace(statement)
}
func (d *Database) configureSQLite() error {
	d.SQL.SetMaxOpenConns(1)
	for _, q := range []string{"PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=10000", "PRAGMA journal_mode=WAL"} {
		if _, err := d.SQL.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

var placeholder = regexp.MustCompile(`\$(\d+)`)

func (d *Database) adapt(query string, args []any) (string, []any) {
	if d.Kind != "sqlite" {
		return query, args
	}
	query = strings.ReplaceAll(query, "NOW()+INTERVAL '24 hours'", "strftime('%Y-%m-%dT%H:%M:%fZ','now','+24 hours')")
	query = strings.ReplaceAll(query, "NOW()-INTERVAL '15 minutes'", "strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')")
	query = strings.ReplaceAll(query, "NOW()", "strftime('%Y-%m-%dT%H:%M:%fZ','now')")
	ordered := []any{}
	query = placeholder.ReplaceAllStringFunc(query, func(p string) string { n, _ := strconv.Atoi(p[1:]); ordered = append(ordered, args[n-1]); return "?" })
	return query, ordered
}
func (d *Database) Query(ctx context.Context, q string, args ...any) ([]Row, error) {
	q, args = d.adapt(q, args)
	rows, err := d.SQL.QueryContext(ctx, q, args...) // #nosec G701 -- Callers supply application-owned SQL with fixed or allowlisted clauses; request values are passed separately in args.
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	result := []Row{}
	for rows.Next() {
		row, err := scanRow(rows, cols)
		if err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}
func scanRow(rows *sql.Rows, cols []string) (Row, error) {
	values := make([]any, len(cols))
	ptr := make([]any, len(cols))
	for i := range values {
		ptr[i] = &values[i]
	}
	if err := rows.Scan(ptr...); err != nil {
		return nil, err
	}
	row := Row{}
	for i, k := range cols {
		row[k] = decodeColumn(k, values[i])
	}
	return row, nil
}
func decodeColumn(key string, value any) any {
	if b, ok := value.([]byte); ok {
		value = string(b)
	}
	if t, ok := value.(time.Time); ok {
		return t.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	switch key {
	case "closed", "approved", "featured", "email_required", "approval_required", "pinned":
		if n, ok := value.(int64); ok {
			return n != 0
		}
	}
	switch key {
	case "author", "snapshot", "tags", "theme", "configuration", "summaries", "seo", "registration", "recommendations", "recommended_ids", "citation_documents":
		return decodeJSONColumn(value)
	}
	return value
}
func decodeJSONColumn(value any) any {
	if s, ok := value.(string); ok {
		var decoded any
		if json.Unmarshal([]byte(s), &decoded) == nil {
			return decoded
		}
	}
	return value
}
func (d *Database) Must(ctx context.Context, q string, args ...any) []Row {
	rows, err := d.Query(ctx, q, args...)
	if err != nil {
		panic(err)
	}
	return rows
}
func first(rows []Row) Row {
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}
