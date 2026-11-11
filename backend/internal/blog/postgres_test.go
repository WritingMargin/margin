package blog

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

// Integration tests use only the explicit test URL and disposable schemas.
func postgresTestDatabase(t *testing.T) (*Database, string) {
	t.Helper()
	address := os.Getenv("MARGIN_TEST_POSTGRES_URL")
	if address == "" {
		if os.Getenv("MARGIN_REQUIRE_POSTGRES_TESTS") == "1" {
			t.Fatal("MARGIN_TEST_POSTGRES_URL is required when MARGIN_REQUIRE_POSTGRES_TESTS=1")
		}
		t.Skip("set MARGIN_TEST_POSTGRES_URL to run PostgreSQL integration tests")
	}
	parsed, err := url.Parse(address)
	if err != nil {
		t.Fatal(err)
	}
	admin, err := sql.Open("postgres", address)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	name := "margin_test_" + strings.ReplaceAll(uuid(), "-", "")
	if _, err = admin.ExecContext(ctx, "CREATE SCHEMA "+pq.QuoteIdentifier(name)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { postgresDropSchema(t, admin, name) })
	query := parsed.Query()
	query.Set("options", "-csearch_path="+name)
	parsed.RawQuery = query.Encode()
	db, err := OpenDatabase(parsed.String(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.SQL.Close() })
	return db, parsed.String()
}
func postgresDropSchema(t *testing.T, admin *sql.DB, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := admin.ExecContext(ctx, "DROP SCHEMA "+pq.QuoteIdentifier(name)+" CASCADE"); err != nil {
		t.Errorf("remove test schema: %v", err)
	}
}
func postgresApp(t *testing.T, db *Database) (*App, *testStorage) {
	t.Helper()
	app, storage := coreFixture(t)
	app.DB = db
	db.Must(context.Background(), "INSERT INTO api_tokens(token_hash,name) VALUES($1,$2) ON CONFLICT(token_hash) DO NOTHING", hash("owner"), "Test")
	return app, storage
}

const postgresFixtureID = "11111111-1111-4111-8111-111111111111"

func TestPostgreSQLContentAndAuth(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	seedPostgres(t, db)
	app, storage := postgresApp(t, db)
	if err := storage.Put(context.Background(), "posts/article.md", []byte("Stored content")); err != nil {
		t.Fatal(err)
	}
	article := responseRow(t, request(t, app, "GET", "/api/public/posts/article", nil, false), 200)
	if article.str("createdAt") != "2026-10-02T12:34:56.789Z" {
		t.Fatal(article)
	}
	if encode(article["tags"]) != `["Go","日本語"]` {
		t.Fatal(article["tags"])
	}
	if article.str("content") != "Stored content" {
		t.Fatal(article)
	}
	postgresAssertAuth(t, app)
	comment := first(db.Must(context.Background(), "SELECT * FROM comments"))
	if !comment.yes("approved") {
		t.Fatal("PostgreSQL boolean was not decoded")
	}
}
func postgresAssertAuth(t *testing.T, app *App) {
	t.Helper()
	expectStatus(t, request(t, app, "GET", "/api/posts", nil, true), 200)
	r := httptest.NewRequest("GET", "http://blog.test/api/posts", nil)
	r.AddCookie(&http.Cookie{Name: "margin_session", Value: "fixture-session"})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	expectStatus(t, w, 200)
	login := request(t, app, "POST", "/api/login", Row{"email": "owner@example.com", "password": "fixture-password-123"}, false)
	expectStatus(t, login, 200)
	cookies := login.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("login did not create session cookie")
	}
	session := first(app.DB.Must(context.Background(), "SELECT * FROM sessions WHERE token_hash=$1", hash(cookies[0].Value)))
	if session == nil {
		t.Fatal("Go session missing from PostgreSQL")
	}
	expectStatus(t, request(t, app, "POST", "/api/login", Row{"email": "owner@example.com", "password": "wrong"}, false), 401)
}
func TestPostgreSQLConcurrentRevisionAndConstraints(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	app, storage := postgresApp(t, db)
	original := responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "First", "slug": "concurrent", "content": "Original", "tags": []string{"one"}}, true), 201)
	path := "/api/posts/" + original.str("id")
	statuses := postgresConcurrentUpdates(t, app, path, original.str("revision"))
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("CAS statuses: %v", statuses)
	}
	current := responseRow(t, request(t, app, "GET", path, nil, true), 200)
	if current.str("revision") == original.str("revision") {
		t.Fatal("revision not advanced")
	}
	before := len(storage.objects)
	expectStatus(t, request(t, app, "POST", "/api/posts", Row{"title": "Duplicate", "slug": "concurrent", "content": "orphan"}, true), 409)
	if len(storage.objects) != before {
		t.Fatal("constraint failure leaked new content")
	}
	postgresAssertCascade(t, db, original.str("id"))
}
func postgresConcurrentUpdates(t *testing.T, app *App, path, revision string) map[int]int {
	t.Helper()
	start := make(chan struct{})
	results := make(chan int, 2)
	for _, value := range []string{"Writer A", "Writer B"} {
		go func(content string) {
			<-start
			results <- request(t, app, "PUT", path, Row{"revision": revision, "content": content}, true).Code
		}(value)
	}
	close(start)
	statuses := map[int]int{}
	for range 2 {
		statuses[<-results]++
	}
	return statuses
}
func postgresAssertCascade(t *testing.T, db *Database, id string) {
	t.Helper()
	ctx := context.Background()
	db.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body) VALUES('cascade',$1,'Reader','reader@example.com','Comment')", id)
	db.Must(ctx, "DELETE FROM posts WHERE id=$1", id)
	if len(db.Must(ctx, "SELECT * FROM comments WHERE id='cascade'")) != 0 {
		t.Fatal("foreign-key cascade failed")
	}
}
func TestPostgreSQLTransactionsRollback(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	ctx := context.Background()
	tx, err := db.SQL.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "INSERT INTO api_tokens(token_hash,name) VALUES('rollback','Temporary')"); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO api_tokens(token_hash,name) VALUES('rollback','Duplicate')"); err == nil {
		t.Fatal("unique constraint accepted duplicate")
	}
	if err = tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if len(db.Must(ctx, "SELECT * FROM api_tokens")) != 0 {
		t.Fatal("transaction left partial data")
	}
	db.Must(ctx, "INSERT INTO api_tokens(token_hash,name) VALUES('usable','After rollback')")
}

func seedPostgres(t *testing.T, db *Database) {
	t.Helper()
	ctx := context.Background()
	password, err := bcrypt.GenerateFromPassword([]byte("fixture-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	db.Must(ctx, "INSERT INTO admins VALUES(1,$1,$2)", "owner@example.com", string(password))
	db.Must(ctx, "INSERT INTO sessions VALUES($1,NOW()+INTERVAL '24 hours')", hash("fixture-session"))
	stamp, err := time.Parse(time.RFC3339Nano, "2026-10-02T13:34:56.789+01:00")
	if err != nil {
		t.Fatal(err)
	}
	db.Must(ctx, "INSERT INTO posts(id,title,slug,excerpt,status,tags,content_key,revision,created_at,updated_at) VALUES($1,'Article','article','','published',$2,'posts/article.md','revision',$3,$3)", postgresFixtureID, `["Go","日本語"]`, stamp)
	db.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES('comment',$1,'Reader','reader@example.com','Approved',TRUE)", postgresFixtureID)
}
