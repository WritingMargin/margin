package blog

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSQLiteCurrentSchemaReopens(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "current.db")
	db := databaseFixture(t, filename)
	seedCurrentSchema(t, db)
	db.Must(context.Background(), "CREATE INDEX custom_post_title ON posts(title)")
	if err := db.SQL.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := databaseFixture(t, filename)
	if len(reopened.Must(context.Background(), "SELECT name FROM sqlite_master WHERE name='custom_post_title'")) != 1 {
		t.Fatal("custom index lost on startup")
	}
	assertCurrentSchema(t, reopened)
}

func TestPostgreSQLCurrentSchemaReopens(t *testing.T) {
	db, address := postgresTestDatabase(t)
	seedCurrentSchema(t, db)
	reopened, err := OpenDatabase(address, "")
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.SQL.Close()
	assertCurrentSchema(t, reopened)
}

func seedCurrentSchema(t *testing.T, db *Database) {
	t.Helper()
	ctx := context.Background()
	seedDatabase(db)
	post := first(db.Must(ctx, "SELECT * FROM posts WHERE id='post-1'"))
	expected := Row{"content_type": "article", "featured": false, "toc": "off", "cover_mode": "player",
		"recommended_ids": []any{}, "recommendations": defaultRecommendations(), "citation_documents": []any{}, "seo": defaultPostSEO()}
	for key, want := range expected {
		if encode(post[key]) != encode(want) {
			t.Fatalf("default %s = %v, want %v", key, post[key], want)
		}
	}
	db.Must(ctx, "INSERT INTO api_tokens(token_hash,name) VALUES('automation','Automation')")
	if first(db.Must(ctx, "SELECT role FROM api_tokens WHERE token_hash='automation'")).str("role") != "owner" {
		t.Fatal("unexpected default token role")
	}
	db.Must(ctx, "UPDATE api_tokens SET role='reader' WHERE token_hash='automation'")
	db.Must(ctx, "UPDATE posts SET status='archived' WHERE id='post-1'")
	db.Must(ctx, "INSERT INTO post_revisions(post_id,revision,version,snapshot,saved_at) VALUES('post-1','revision-1',1,$1,NOW())", encode(post))
}

func assertCurrentSchema(t *testing.T, db *Database) {
	t.Helper()
	ctx := context.Background()
	post := first(db.Must(ctx, "SELECT title, revision, status FROM posts WHERE id='post-1'"))
	if !reflect.DeepEqual(post, Row{"title": "Private title", "revision": "revision-1", "status": "archived"}) {
		t.Fatal("post changed after reopening", post)
	}
	if first(db.Must(ctx, "SELECT role FROM api_tokens WHERE token_hash='automation'")).str("role") != "reader" {
		t.Fatal("token role changed after reopening")
	}
	author := first(db.Must(ctx, "SELECT author FROM post_revisions WHERE post_id='post-1'"))
	if object(author["author"]).str("kind") != "unknown" {
		t.Fatal("unexpected default revision author", author)
	}
	for _, statement := range []string{"UPDATE posts SET status='invalid'", "UPDATE posts SET content_type='invalid'", "UPDATE api_tokens SET role='invalid'"} {
		if _, err := db.SQL.Exec(statement); err == nil {
			t.Fatal("missing database constraint", statement)
		}
	}
	tables := []string{"comments", "ai_summaries", "generated_assets", "post_revisions"}
	for _, table := range tables {
		if len(db.Must(ctx, "SELECT post_id FROM "+table+" WHERE post_id='post-1'")) != 1 {
			t.Fatalf("missing %s after reopening", table)
		}
	}
	db.Must(ctx, "DELETE FROM posts WHERE id='post-1'")
	for _, table := range tables {
		if len(db.Must(ctx, "SELECT post_id FROM "+table)) != 0 {
			t.Fatalf("%s did not cascade", table)
		}
	}
}
