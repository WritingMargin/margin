package blog

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

// @Summary Watch saved post changes
// @ID postEvents
// @Description Streams revision events (id, revision, deleted), including the current state on every connection. revision is always the live/current post revision. Optional draftRevision identifies staged changes; changes to either revision emit an event. Changes are pushed after saves and deletes commit, using local notifications for SQLite and PostgreSQL LISTEN/NOTIFY across server instances. No content polling. Clients reconnect after disconnection. No article content is streamed.
// @Tags Posts
// @Produce text/event-stream
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Success 200 {string} string "Server-sent revision events"
// @Failure 401 {object} APIError "Missing or invalid authentication"
// @Failure 404 {object} APIError "Post not found"
// @Router /api/posts/{id}/events [get]
func (a *App) postEvents(w http.ResponseWriter, r *http.Request) {
	a.getPost(r.Context(), r.PathValue("id"))
	changed, unsubscribe, err := a.DB.subscribePost(r.Context(), r.PathValue("id"))
	must(err)
	defer unsubscribe()
	// Subscribe before reading current state so a concurrent commit cannot be missed.
	rows, err := a.DB.Query(r.Context(), "SELECT p.revision,d.revision AS draft_revision FROM posts p LEFT JOIN post_drafts d ON d.post_id=p.id WHERE p.id=$1", r.PathValue("id"))
	must(err)
	row := first(rows)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	if r.Method == http.MethodHead {
		return
	}
	defer http.NewResponseController(w).SetWriteDeadline(time.Time{})
	if !writePostEvent(w, "revision", postEvent(row, r.PathValue("id"))) {
		return
	}
	if row != nil {
		a.watchPostEvents(w, r, postEventVersion(row), changed)
	}
}

func postEvent(row Row, id string) Row {
	event := Row{"id": id, "revision": row.str("revision"), "deleted": row == nil}
	if revision := row.str("draft_revision"); revision != "" {
		event["draftRevision"] = revision
	}
	return event
}

// The two revisions are independent: a live edit must still notify clients
// when an older staged draft remains in place.
func postEventVersion(row Row) string {
	return row.str("revision") + "\x00" + row.str("draft_revision")
}

func writePostEvent(w http.ResponseWriter, event string, data Row) bool {
	controller := http.NewResponseController(w)
	_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encode(data)); err != nil {
		return false
	}
	return controller.Flush() == nil
}

func (a *App) watchPostEvents(w http.ResponseWriter, r *http.Request, revision string, changed <-chan struct{}) {
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if !a.authorizePostStream(w, r) || !writePostHeartbeat(w) {
				return
			}
		case <-changed:
			next, ok := a.sendPostChange(w, r, revision)
			if !ok {
				return
			}
			revision = next
		}
	}
}
func writePostHeartbeat(w http.ResponseWriter) bool {
	controller := http.NewResponseController(w)
	_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
		return false
	}
	return controller.Flush() == nil
}
func (a *App) authorizePostStream(w http.ResponseWriter, r *http.Request) bool {
	if a.postStreamAuthorized(r) {
		return true
	}
	writePostEvent(w, "unauthorized", Row{})
	return false
}
func (a *App) sendPostChange(w http.ResponseWriter, r *http.Request, revision string) (string, bool) {
	if !a.authorizePostStream(w, r) {
		return revision, false
	}
	rows, err := a.DB.Query(r.Context(), "SELECT p.revision,d.revision AS draft_revision FROM posts p LEFT JOIN post_drafts d ON d.post_id=p.id WHERE p.id=$1", r.PathValue("id"))
	if err != nil {
		return revision, false
	}
	row := first(rows)
	next := postEventVersion(row)
	if row == nil || next != revision {
		if !writePostEvent(w, "revision", postEvent(row, r.PathValue("id"))) {
			return revision, false
		}
	}
	return next, row != nil
}

func (a *App) postStreamAuthorized(r *http.Request) (allowed bool) {
	// A stream outlives a request snapshot. Revalidate membership for each
	// heartbeat and event, and close it if Central is unavailable.
	defer func() {
		if recover() != nil {
			allowed = false
		}
	}()
	if value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		if strings.HasPrefix(value, "moat_") {
			principal := a.loadOAuthPrincipal(r, value)
			scopes, _ := principal["scopes"].([]string)
			return hasOAuthScope(scopes, "content:read")
		}
		rows, err := a.DB.Query(r.Context(), "SELECT role FROM api_tokens WHERE token_hash=$1", hash(value))
		return err == nil && validTokenRole(first(rows).str("role"))
	}
	principal := a.loadBrowserPrincipal(r)
	return principal != nil && tokenRouteAllowed(principal.str("role"), "GET /api/posts/{id}/events")
}
