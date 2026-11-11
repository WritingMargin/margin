package blog

import (
	"context"
	"log"
	"net/http"
	"slices"
	"time"
)

const writingChatRetention = 24 * time.Hour
const writingChatMaxBytes = 1_500_000

// Existing installations may have chat rows from before article references
// were recorded. Attach rows whose key is already an article ID on startup.
func (d *Database) migrateWritingChatSessionReferences(ctx context.Context) error {
	rows, err := d.SQL.QueryContext(ctx, "SELECT * FROM writing_chat_sessions LIMIT 0")
	if err != nil {
		return err
	}
	columns, err := rows.Columns()
	closeErr := rows.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if !slices.Contains(columns, "post_id") {
		statement := "ALTER TABLE writing_chat_sessions ADD COLUMN post_id TEXT REFERENCES posts(id) ON DELETE CASCADE"
		if d.Kind == "postgres" {
			statement = "ALTER TABLE writing_chat_sessions ADD COLUMN IF NOT EXISTS post_id TEXT REFERENCES posts(id) ON DELETE CASCADE"
		}
		if _, err = d.SQL.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if _, err = d.SQL.ExecContext(ctx, `UPDATE writing_chat_sessions SET post_id=session_key
	 WHERE post_id IS NULL AND EXISTS(SELECT 1 FROM posts WHERE posts.id=writing_chat_sessions.session_key)`); err != nil {
		return err
	}
	_, err = d.SQL.ExecContext(ctx, "CREATE INDEX IF NOT EXISTS writing_chat_sessions_post_idx ON writing_chat_sessions(post_id)")
	return err
}

func (d *Database) pruneWritingChatSessions(ctx context.Context) error {
	_, err := d.Query(ctx, "DELETE FROM writing_chat_sessions WHERE expires_at <= $1", time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
	return err
}

func (a *App) RunWritingSessionCleanup(ctx context.Context) {
	a.runWritingSessionCleanup(ctx, time.Hour)
}

func (a *App) runWritingSessionCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := a.DB.pruneWritingChatSessions(ctx); err != nil && ctx.Err() == nil {
				log.Printf("[margin] prune writing sessions: %v", err)
			}
		}
	}
}

func writingSessionKey(r *http.Request) string {
	key := r.PathValue("key")
	if !uuidRE.MatchString(key) {
		fail(400, "Session key must be a UUID.")
	}
	return key
}

// @Summary Restore a short-lived writing conversation
// @ID getWritingChatSession
// @Description Returns the owner’s saved chats for one post or unsaved draft key. Expired chats are deleted and return null.
// @Tags AI
// @Produce json
// @Security BearerAuth
// @Param key path string true "Post or draft UUID"
// @Success 200 {object} APIWritingChatSession
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Router /api/ai/writing/sessions/{key} [get]
func (a *App) writingChatSession(w http.ResponseWriter, r *http.Request) {
	key := writingSessionKey(r)
	if err := a.DB.pruneWritingChatSessions(r.Context()); err != nil {
		panic(err)
	}
	row := first(a.DB.Must(r.Context(), "SELECT chats,expires_at FROM writing_chat_sessions WHERE session_key=$1 AND expires_at>$2", key, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")))
	if row == nil {
		send(w, 200, Row{"chats": nil})
		return
	}
	send(w, 200, Row{"chats": decodeJSONColumn(row["chats"]), "expiresAt": row["expires_at"]})
}

// @Summary Save a short-lived writing conversation
// @ID saveWritingChatSession
// @Description Stores a bounded owner-only chat session for 24 hours after its last update. Set postId to the article ID for saved articles; omit it for unsaved drafts. previousDraftKey clears the temporary copy after saving an article.
// @Tags AI
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "Post or draft UUID"
// @Param input body APIWritingChatsInput true "Writing chats"
// @Success 200 {object} APIWritingChatExpiry
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 413 {object} APIError
// @Router /api/ai/writing/sessions/{key} [put]
func (a *App) saveWritingChatSession(w http.ResponseWriter, r *http.Request) {
	key := writingSessionKey(r)
	input := body(w, r)
	strict(input, "chats", "postId", "previousDraftKey")
	chats := object(input["chats"])
	if !validWritingChats(chats) {
		fail(400, "Invalid writing conversation session.")
	}
	serialized := encode(chats)
	if len(serialized) > writingChatMaxBytes {
		fail(413, "Writing conversation session is too large.")
	}
	postID := a.writingChatPostID(r.Context(), key, input)
	previousDraftKey := writingChatPreviousDraftKey(key, postID, input)
	if err := a.DB.pruneWritingChatSessions(r.Context()); err != nil {
		panic(err)
	}
	now := time.Now().UTC()
	rows := a.DB.Must(r.Context(), `INSERT INTO writing_chat_sessions(session_key,post_id,chats,updated_at,expires_at)
	 VALUES($1,$2,$3,$4,$5)
	 ON CONFLICT(session_key) DO UPDATE SET post_id=excluded.post_id,chats=excluded.chats,updated_at=excluded.updated_at,expires_at=excluded.expires_at
	 RETURNING expires_at`, key, postID, serialized, now.Format("2006-01-02T15:04:05.000Z"), now.Add(writingChatRetention).Format("2006-01-02T15:04:05.000Z"))
	if previousDraftKey != "" {
		a.DB.Must(r.Context(), "DELETE FROM writing_chat_sessions WHERE session_key=$1 AND post_id IS NULL", previousDraftKey)
	}
	send(w, 200, Row{"expiresAt": rows[0]["expires_at"]})
}

func (a *App) writingChatPostID(ctx context.Context, key string, input Row) any {
	linkedPost := first(a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1", key))
	if value, exists := input["postId"]; exists {
		id, ok := value.(string)
		if !ok || id != key {
			fail(400, "Post ID must match the session key.")
		}
		if linkedPost == nil {
			fail(404, "Post not found.")
		}
	}
	if linkedPost != nil {
		return key
	}
	return nil
}

func writingChatPreviousDraftKey(key string, postID any, input Row) string {
	value, exists := input["previousDraftKey"]
	if !exists {
		return ""
	}
	previousDraftKey, ok := value.(string)
	if !ok || postID == nil || !uuidRE.MatchString(previousDraftKey) || previousDraftKey == key {
		fail(400, "Previous draft key is invalid.")
	}
	return previousDraftKey
}

func validWritingChats(chats Row) bool {
	active, ok := chats["active"].(string)
	if !ok || active == "" {
		return false
	}
	items, ok := chats["items"].([]any)
	if !ok || len(items) < 1 || len(items) > 32 {
		return false
	}
	found := false
	for _, value := range items {
		id := validWritingChat(value)
		if id == "" {
			return false
		}
		found = found || id == active
	}
	return found
}

func validWritingChat(value any) string {
	chat := object(value)
	id, ok := chat["id"].(string)
	if !ok || id != "initial" && !uuidRE.MatchString(id) {
		return ""
	}
	if _, ok := chat["createdAt"].(float64); !ok {
		return ""
	}
	turns, ok := object(chat["state"])["turns"].([]any)
	if !ok || len(turns) > 100 {
		return ""
	}
	return id
}
