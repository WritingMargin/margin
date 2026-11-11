package blog

import (
	"net/http"
	"time"
)

func (a *App) readerRoutes() {
	a.mux.HandleFunc("PUT /api/public/posts/{id}/guide-steps", a.saveReaderGuideStep)
	a.mux.HandleFunc("POST /api/public/posts/{id}/guide-reports", a.reportGuideStep)
	a.mux.HandleFunc("GET /api/public/posts/{id}/guide-progress", a.readerGuideProgress)
	a.mux.HandleFunc("PUT /api/public/posts/{id}/guide-progress", a.saveReaderGuideProgress)
	a.mux.HandleFunc("POST /api/public/reader/login", a.readerLogin)
	a.mux.HandleFunc("POST /api/public/reader/logout", a.readerLogout)
	a.mux.HandleFunc("GET /api/public/posts/{id}/notes", a.readerNotes)
	a.mux.HandleFunc("POST /api/public/posts/{id}/notes", a.createReaderNote)
	a.mux.HandleFunc("PATCH /api/public/notes/{note}", a.updateReaderNote)
	a.mux.HandleFunc("DELETE /api/public/notes/{note}", a.deleteReaderNote)
}
func (a *App) readerEmail(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookieName("margin_reader"))
	if err != nil {
		return ""
	}
	row := first(a.DB.Must(r.Context(), `SELECT s.email FROM reader_sessions s JOIN newsletter_subscribers n ON n.email=s.email WHERE s.token_hash=$1 AND s.expires_at>NOW() AND n.status='subscribed'`, hash(cookie.Value)))
	return row.str("email")
}
func (a *App) requireReader(r *http.Request) string {
	reader := a.requireCommentReader(r)
	email := reader.str("email")
	if email == "" {
		coded(403, "Sign in with an email address to use private notes.", "READER_EMAIL_REQUIRED")
	}
	return email
}
func (a *App) startReaderSession(w http.ResponseWriter, r *http.Request, email string) {
	value := newsletterToken()
	expires := time.Now().Add(30 * 24 * time.Hour)
	a.DB.Must(r.Context(), "DELETE FROM reader_sessions WHERE expires_at<NOW()")
	a.DB.Must(r.Context(), "INSERT INTO reader_sessions(token_hash,email,expires_at) VALUES($1,$2,$3)", hash(value), email, expires.UTC().Format("2006-01-02T15:04:05.000Z"))
	setSessionCookie(w, "margin_reader", value, 30*24*60*60, expires)
}
func (a *App) readerLogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "reader-login", 10, time.Hour, false)
	email := emailField(body(w, r), "email", true)
	config := a.newsletterStatus(r.Context(), nil)
	if !config.yes("ready") {
		fail(503, "Email sign-in is unavailable. Please try again later.")
	}
	row := first(a.DB.Must(r.Context(), "SELECT email FROM newsletter_subscribers WHERE email=$1 AND status='subscribed'", email))
	if row != nil {
		a.sendReaderLink(r, config, email)
	}
	send(w, 202, Row{"message": "If you have a confirmed subscription, check your inbox. Confirm the email link to sign in, then return to this article."})
}
func (a *App) sendReaderLink(r *http.Request, config Row, email string) {
	token, unsubscribe := newsletterToken(), newsletterToken()
	rows := a.DB.Must(r.Context(), `INSERT INTO reader_email_links(token_hash,email,unsubscribe_hash,expires_at)
 SELECT $1,$2,$3,$4 WHERE NOT EXISTS
 (SELECT 1 FROM reader_email_links WHERE email=$2 AND created_at>NOW()-INTERVAL '15 minutes') RETURNING token_hash`, hash(token), email, hash(unsubscribe), time.Now().Add(24*time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
	if len(rows) == 0 {
		return
	}
	defer func() {
		if err := recover(); err != nil {
			a.DB.Must(r.Context(), "DELETE FROM reader_email_links WHERE token_hash=$1", hash(token))
			panic(err)
		}
	}()
	// Reuse the supported confirmation email for both managed and SMTP delivery.
	a.sendNewsletterConfirmation(r.Context(), config, email, token, unsubscribe)
}
func (a *App) confirmReaderLink(w http.ResponseWriter, r *http.Request, token string) bool {
	existing := first(a.DB.Must(r.Context(), "SELECT token_hash FROM reader_email_links WHERE token_hash=$1", hash(token)))
	if existing == nil {
		return false
	}
	row := first(a.DB.Must(r.Context(), `UPDATE reader_email_links SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() AND EXISTS (SELECT 1 FROM newsletter_subscribers n WHERE n.email=reader_email_links.email AND n.status='subscribed') RETURNING email`, hash(token)))
	if row == nil {
		fail(400, "This sign-in link expired or was already used. Request another link.")
	}
	a.startReaderSession(w, r, row.str("email"))
	send(w, 200, Row{"message": "You’re signed in. Return to your article and reload it to use private notes."})
	return true
}
func (a *App) readerLogout(w http.ResponseWriter, r *http.Request) {
	a.commentReaderLogout(w, r)
}
func (a *App) readerNotes(w http.ResponseWriter, r *http.Request) {
	email := a.requireReader(r)
	post := a.publishedInteractionPost(r)
	notes := a.DB.Must(r.Context(), `SELECT n.id,n.quote,n.body,n.revision,n.created_at,
		COALESCE(a.anchor_status,'active') AS anchor_status FROM reader_notes n
		LEFT JOIN section_anchors a ON a.id=n.id WHERE n.email=$1 AND n.post_id=$2 ORDER BY n.created_at DESC`, email, post["id"])
	if notes == nil {
		notes = []Row{}
	}
	send(w, 200, notes)
}
func (a *App) createReaderNote(w http.ResponseWriter, r *http.Request) {
	email := a.requireReader(r)
	a.requireInteractions(r.Context())
	if !a.interactionSettings(r.Context()).yes("notes") {
		fail(403, "New private notes are disabled.")
	}
	a.limit(r, "reader-notes", 60, time.Hour, false)
	input := body(w, r)
	post := a.publishedInteractionPost(r)
	quote := a.readerNoteQuote(r, input, post)
	message := stringField(input, "body", 1, 10000, true)
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	id := uuid()
	a.execInteraction(r.Context(), tx, "INSERT INTO reader_notes(id,post_id,email,quote,body,revision) VALUES($1,$2,$3,$4,$5,$6)", id, post["id"], email, quote, message, post["revision"])
	a.insertAnchor(r.Context(), tx, id, post, "private_note", quote, anchorOccurrence(input))
	must(tx.Commit())
	send(w, 201, Row{"message": "Private note saved. Only you can see it."})
}
func (a *App) readerNoteQuote(r *http.Request, input, post Row) string {
	if _, present := input["quote"]; !present {
		input["quote"] = ""
	}
	quote := stringField(input, "quote", 0, 2000, true)
	if quote != "" {
		return a.validatePassage(r, input, post)
	}
	if stringField(input, "revision", 1, 100, false) != post.str("revision") {
		coded(409, "This article changed. Reload it before adding your note.", "REVISION_CONFLICT")
	}
	if anchorOccurrence(input) != 0 {
		fail(400, "A whole-article note cannot have a passage occurrence.")
	}
	return ""
}
func (a *App) updateReaderNote(w http.ResponseWriter, r *http.Request) {
	email := a.requireReader(r)
	a.limit(r, "reader-note-edit", 60, time.Hour, false)
	input := body(w, r)
	strict(input, "body")
	message := stringField(input, "body", 1, 10000, true)
	updated := first(a.DB.Must(r.Context(), "UPDATE reader_notes SET body=$1 WHERE id=$2 AND email=$3 RETURNING id", message, r.PathValue("note"), email))
	if updated == nil {
		fail(404, "Note not found.")
	}
	send(w, 200, Row{"message": "Private note updated."})
}
func (a *App) deleteReaderNote(w http.ResponseWriter, r *http.Request) {
	email := a.requireReader(r)
	a.DB.Must(r.Context(), "DELETE FROM section_anchors WHERE id IN (SELECT id FROM reader_notes WHERE id=$1 AND email=$2)", r.PathValue("note"), email)
	a.DB.Must(r.Context(), "DELETE FROM reader_notes WHERE id=$1 AND email=$2", r.PathValue("note"), email)
	send(w, 200, Row{"ok": true})
}
