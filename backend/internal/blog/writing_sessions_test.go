package blog

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWritingChatSessionsExpireAndRequireOwner(t *testing.T) {
	a, _ := coreFixture(t)
	key := uuid()
	path := "/api/ai/writing/sessions/" + key
	chats := Row{"active": "initial", "items": []Row{{"id": "initial", "createdAt": 0, "state": Row{"turns": []Row{}, "brief": "A private idea"}}}}
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": chats}, false), 401)
	writer := roleToken(t, a, "writer")
	expectStatus(t, tokenRequest(a, writer, "GET", path, nil), 403)
	expectStatus(t, tokenRequest(a, writer, "PUT", path, Row{"chats": chats}), 403)
	expectStatus(t, request(t, a, "PUT", "/api/ai/writing/sessions/not-a-uuid", Row{"chats": chats}, true), 400)
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": Row{"active": "missing", "items": chats["items"]}}, true), 400)
	saved := responseRow(t, request(t, a, "PUT", path, Row{"chats": chats}, true), 200)
	expires, err := time.Parse(time.RFC3339Nano, saved.str("expiresAt"))
	if err != nil || time.Until(expires) < 23*time.Hour || time.Until(expires) > 25*time.Hour {
		t.Fatalf("unexpected expiry: %v, %v", saved["expiresAt"], err)
	}
	got := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	items := object(got["chats"])["items"].([]any)
	if object(object(items[0])["state"]).str("brief") != "A private idea" {
		t.Fatalf("saved conversation was not restored: %v", got)
	}
	a.DB.Must(t.Context(), "UPDATE writing_chat_sessions SET expires_at=$1 WHERE session_key=$2", "2000-01-01T00:00:00.000Z", key)
	if responseRow(t, request(t, a, "GET", path, nil, true), 200)["chats"] != nil {
		t.Fatal("expired conversation remained visible")
	}
	if len(a.DB.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", key)) != 0 {
		t.Fatal("expired conversation was not deleted")
	}
}

func TestWritingChatSessionCleanupRunsWithoutRequests(t *testing.T) {
	a, _ := coreFixture(t)
	key := uuid()
	a.DB.Must(t.Context(), "INSERT INTO writing_chat_sessions(session_key,chats,updated_at,expires_at) VALUES($1,$2,$3,$4)", key, `{"active":"initial","items":[]}`, "2000-01-01T00:00:00.000Z", "2000-01-02T00:00:00.000Z")
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { a.runWritingSessionCleanup(ctx, time.Millisecond); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
	deadline := time.After(time.Second)
	for len(a.DB.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", key)) != 0 {
		select {
		case <-deadline:
			t.Fatal("background cleanup did not remove the expired session")
		case <-time.After(5 * time.Millisecond):
		}
	}
}

func TestWritingChatSessionFollowsArticleDeletion(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Working draft", "slug": "working-draft", "status": "draft", "content": "A draft"}, true), 201)
	postID := post.str("id")
	path := "/api/ai/writing/sessions/" + postID
	chats := Row{"active": "initial", "items": []Row{{"id": "initial", "createdAt": 0, "state": Row{"turns": []Row{}}}}}
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": chats, "postId": uuid()}, true), 400)
	expectStatus(t, request(t, a, "PUT", "/api/ai/writing/sessions/"+uuid(), Row{"chats": chats, "postId": uuid()}, true), 400)
	missing := uuid()
	expectStatus(t, request(t, a, "PUT", "/api/ai/writing/sessions/"+missing, Row{"chats": chats, "postId": missing}, true), 404)
	draft := uuid()
	expectStatus(t, request(t, a, "PUT", "/api/ai/writing/sessions/"+draft, Row{"chats": chats}, true), 200)
	if first(a.DB.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key=$1", draft))["post_id"] != nil {
		t.Fatal("unsaved draft chat should not reference an article")
	}
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": chats, "postId": postID, "previousDraftKey": postID}, true), 400)
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": chats, "postId": postID, "previousDraftKey": draft}, true), 200)
	if first(a.DB.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key=$1", postID)).str("post_id") != postID {
		t.Fatal("article chat was not attached by foreign key")
	}
	if len(a.DB.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", draft)) != 0 {
		t.Fatal("temporary draft chat remained after attaching it to the article")
	}
	expectStatus(t, request(t, a, "PUT", path, Row{"chats": chats}, true), 200)
	if first(a.DB.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key=$1", postID)).str("post_id") != postID {
		t.Fatal("later saves lost the article foreign key")
	}
	unrelatedDraft := uuid()
	expectStatus(t, request(t, a, "PUT", "/api/ai/writing/sessions/"+unrelatedDraft, Row{"chats": chats}, true), 200)
	expectStatus(t, request(t, a, "DELETE", "/api/posts/"+postID, Row{"revision": post["revision"]}, true), 200)
	if len(a.DB.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", postID)) != 0 {
		t.Fatal("article chat did not cascade on deletion")
	}
	if len(a.DB.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", unrelatedDraft)) != 1 {
		t.Fatal("temporary draft chat was removed with an unrelated article")
	}
}

func TestWritingChatSessionForeignKeyMigratesOnStartup(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "legacy-chat.db")
	legacy := strings.Replace(schema, "  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,\n  chats JSONB NOT NULL,", "  chats JSONB NOT NULL,", 1)
	if legacy == schema {
		t.Fatal("legacy chat schema fixture did not change")
	}
	raw, err := sql.Open("sqlite", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = raw.Exec(sqliteSchema(legacy)); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES('article','Title','article','','draft','content','rev')",
		`INSERT INTO writing_chat_sessions(session_key,chats,updated_at,expires_at) VALUES('article','{}','2026-11-10T00:00:00.000Z','2099-01-01T00:00:00.000Z')`,
		`INSERT INTO writing_chat_sessions(session_key,chats,updated_at,expires_at) VALUES('draft','{}','2026-11-10T00:00:00.000Z','2099-01-01T00:00:00.000Z')`,
	} {
		if _, err = raw.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	if err = raw.Close(); err != nil {
		t.Fatal(err)
	}
	db := databaseFixture(t, filename)
	if first(db.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key='article'")).str("post_id") != "article" {
		t.Fatal("existing article chat was not linked on startup")
	}
	if first(db.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key='draft'"))["post_id"] != nil {
		t.Fatal("existing draft chat was linked to an article")
	}
	db.Must(t.Context(), "DELETE FROM posts WHERE id='article'")
	if len(db.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key='article'")) != 0 {
		t.Fatal("migrated article chat did not cascade")
	}
}

func TestWritingChatSessionForeignKeyPostgres(t *testing.T) {
	db, address := postgresTestDatabase(t)
	postID := uuid()
	db.Must(t.Context(), "INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES($1,'Title','chat-fk','','draft','content','rev')", postID)
	db.Must(t.Context(), "DROP TABLE writing_chat_sessions")
	db.Must(t.Context(), `CREATE TABLE writing_chat_sessions (
	 session_key TEXT PRIMARY KEY, chats JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`)
	db.Must(t.Context(), `INSERT INTO writing_chat_sessions(session_key,chats,updated_at,expires_at)
	 VALUES($1,'{}','2026-11-10T00:00:00.000Z','2099-01-01T00:00:00.000Z')`, postID)
	reopened, err := OpenDatabase(address, "")
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.SQL.Close()
	if first(reopened.Must(t.Context(), "SELECT post_id FROM writing_chat_sessions WHERE session_key=$1", postID)).str("post_id") != postID {
		t.Fatal("PostgreSQL startup did not link the existing article chat")
	}
	reopened.Must(t.Context(), "DELETE FROM posts WHERE id=$1", postID)
	if len(reopened.Must(t.Context(), "SELECT session_key FROM writing_chat_sessions WHERE session_key=$1", postID)) != 0 {
		t.Fatal("PostgreSQL article chat did not cascade")
	}
}
