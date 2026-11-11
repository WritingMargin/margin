package blog

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestReaderNoteMigrationPreservesNotesWithoutSubscriptionConstraint(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "legacy.db")
	createLegacyReaderNotesDatabase(t, filename)
	db := databaseFixture(t, filename)
	ctx := context.Background()
	if first(db.Must(ctx, "SELECT body FROM reader_notes WHERE id='old'")).str("body") != "Saved note" {
		t.Fatal("existing note changed during migration")
	}
	for _, key := range db.Must(ctx, "PRAGMA foreign_key_list(reader_notes)") {
		if key.str("table") == "newsletter_subscribers" {
			t.Fatal("newsletter constraint survived migration")
		}
	}
	db.Must(ctx, "INSERT INTO reader_notes(id,post_id,email,quote,body,revision) VALUES('new','post','new@example.test','Quote','New note','rev')")
	if len(db.Must(ctx, "SELECT id FROM reader_notes")) != 2 {
		t.Fatal("new reader note was not saved after migration")
	}
}

func createLegacyReaderNotesDatabase(t *testing.T, filename string) {
	t.Helper()
	legacy := strings.Replace(schema, "CREATE TABLE IF NOT EXISTS reader_notes (\n id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,\n email TEXT NOT NULL,", "CREATE TABLE IF NOT EXISTS reader_notes (\n id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,\n email TEXT NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,", 1)
	if legacy == schema {
		t.Fatal("legacy schema fixture did not include the old subscription constraint")
	}
	raw, err := sql.Open("sqlite", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(sqliteSchema(legacy)); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		"INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES('post','Title','post','','published','content','rev')",
		"INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES('subscriber@example.test','subscribed','hash')",
		"INSERT INTO reader_notes(id,post_id,email,quote,body,revision) VALUES('old','post','subscriber@example.test','Quote','Saved note','rev')",
	} {
		if _, err := raw.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	if err := raw.Close(); err != nil {
		t.Fatal(err)
	}
}

func databaseFixture(t *testing.T, filename string) *Database {
	t.Helper()
	db, err := OpenDatabase("", filename)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.SQL.Close() })
	return db
}
func seedDatabase(db *Database) {
	ctx := context.Background()
	db.Must(ctx, "INSERT INTO posts(id,title,slug,excerpt,status,tags,content_key,revision) VALUES('post-1','Private title','private-title','','draft',$1,'posts/post-1/revision.md','revision-1')", `["Go","日本語"]`)
	db.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body) VALUES('comment-1','post-1','Reader','private@example.com','Unapproved')")
	db.Must(ctx, "INSERT INTO ai_summaries(id,post_id,source_hash,tone,summaries) VALUES('summary-1','post-1','source','natural','[]')")
	db.Must(ctx, "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES('asset-1','post-1','assets/1.png','Draw a tree','minimal','1024x1024','source')")
	db.Must(ctx, "INSERT INTO uploaded_covers(id,object_key,content_type) VALUES('cover-1','covers/1','image/png')")
}
func TestSQLitePersistenceAndPrivateFiles(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "private", "margin.db")
	db := databaseFixture(t, filename)
	seedDatabase(db)
	ctx := context.Background()
	before := db.Must(ctx, "SELECT * FROM posts")
	if first(db.Must(ctx, "PRAGMA journal_mode")).str("journal_mode") != "wal" {
		t.Fatal("WAL mode disabled")
	}
	info, err := os.Stat(filename)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("database permissions %o", info.Mode().Perm())
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		assertPrivateSidecar(t, filename+suffix)
	}
	if err := db.SQL.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := databaseFixture(t, filename)
	if !reflect.DeepEqual(before, reopened.Must(ctx, "SELECT * FROM posts")) {
		t.Fatal("metadata not persisted")
	}
}
func TestSQLiteForeignKeysIndexesAndPragmas(t *testing.T) {
	db := databaseFixture(t, ":memory:")
	seedDatabase(db)
	ctx := context.Background()
	if first(db.Must(ctx, "PRAGMA foreign_keys"))["foreign_keys"] != int64(1) {
		t.Fatal("foreign keys disabled")
	}
	if first(db.Must(ctx, "PRAGMA busy_timeout"))["timeout"] != int64(10000) {
		t.Fatal("missing busy timeout")
	}
	rows := db.Must(ctx, "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('ai_summaries_post_idx','generated_assets_post_idx','comments_post_idx','sessions_expiry_idx')")
	if len(rows) != 4 {
		t.Fatal("missing indexes")
	}
	db.Must(ctx, "DELETE FROM posts WHERE id='post-1'")
	for _, table := range []string{"comments", "ai_summaries", "generated_assets"} {
		if len(db.Must(ctx, "SELECT * FROM "+table)) != 0 {
			t.Fatal("cascade failed", table)
		}
	}
	if len(db.Must(ctx, "SELECT * FROM uploaded_covers")) != 1 {
		t.Fatal("unrelated metadata deleted")
	}
}
func assertPrivateSidecar(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0077 != 0 {
		t.Fatalf("private database sidecar %s is readable by others: %o", path, info.Mode().Perm())
	}
}
func TestSQLiteAdapterReordersParametersAndNormalizesColumns(t *testing.T) {
	db := databaseFixture(t, ":memory:")
	row := first(db.Must(context.Background(), "SELECT $2 AS second,$1 AS first,$2 AS again", "one", "two"))
	if row.str("first") != "one" || row.str("second") != "two" || row.str("again") != "two" {
		t.Fatal(row)
	}
	row = first(db.Must(context.Background(), "SELECT '[]' AS tags,'{\"key\":true}' AS configuration,0 AS approved"))
	if !reflect.DeepEqual(row["tags"], []any{}) || !reflect.DeepEqual(row["configuration"], map[string]any{"key": true}) || row.yes("approved") {
		t.Fatal(row)
	}
}
func TestSQLiteAdapterIntervalsUseUTC(t *testing.T) {
	db := databaseFixture(t, ":memory:")
	row := first(db.Must(context.Background(), "SELECT NOW() AS current,NOW()+INTERVAL '24 hours' AS future,NOW()-INTERVAL '15 minutes' AS past"))
	current := parseDatabaseTime(t, row.str("current"))
	future := parseDatabaseTime(t, row.str("future"))
	past := parseDatabaseTime(t, row.str("past"))
	if future.Sub(current) != 24*time.Hour || current.Sub(past) != 15*time.Minute {
		t.Fatal(row)
	}
	if time.Since(current) > time.Minute {
		t.Fatal("database clock differs from UTC current time")
	}
}
func parseDatabaseTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse("2006-01-02T15:04:05.000Z", value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}
func TestPostgresAdapterLeavesQueryIntact(t *testing.T) {
	db := Database{Kind: "postgres"}
	query := "SELECT $2,$1,NOW()+INTERVAL '24 hours'"
	args := []any{"one", "two"}
	actual, values := db.adapt(query, args)
	if actual != query || !reflect.DeepEqual(values, args) {
		t.Fatalf("PostgreSQL query changed: %s %v", actual, values)
	}
}
