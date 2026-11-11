package blog

import (
	"context"
	"database/sql"
	"html"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func validInteractions(input Row) Row {
	// Saved settings from earlier releases may contain this retired field.
	delete(input, "publicNotes")
	strict(input, "enabled", "editPolicy", "questions", "notes")
	enabled := booleanField(input, "enabled")
	mode := "hidden"
	if enabled {
		mode = "open"
	}
	if _, ok := input["questions"]; ok {
		mode = enumField(input, "questions", "open", "closed", "hidden")
	}
	notes := enabled
	if _, ok := input["notes"]; ok {
		notes = booleanField(input, "notes")
	}
	return Row{"enabled": mode != "hidden" || notes, "questions": mode, "notes": notes, "editPolicy": enumField(input, "editPolicy", "keep", "hide")}
}
func (a *App) interactionSettings(ctx context.Context) Row {
	settings := a.siteSetting(ctx, "interactions", validInteractions(Row{"enabled": false, "editPolicy": "keep"}), validInteractions)
	// Article comments are the authority for every public conversation, including
	// legacy clients and previously saved independent question settings.
	comments := object(a.settings(ctx)["comments"])
	settings["questions"] = conversationMode(comments.yes("visible"), comments.yes("enabled"))
	settings["enabled"] = settings.str("questions") != "hidden" || settings.yes("notes")
	return settings
}
func (a *App) interactionRoutes() {
	a.socialRoutes()
	a.mux.HandleFunc("GET /api/settings/interactions", func(w http.ResponseWriter, r *http.Request) { send(w, 200, a.interactionSettings(r.Context())) })
	a.mux.HandleFunc("PUT /api/settings/interactions", func(w http.ResponseWriter, r *http.Request) {
		value := validInteractions(body(w, r))
		a.saveSiteSetting(r.Context(), "interactions", value)
		send(w, 200, a.interactionSettings(r.Context()))
	})
	a.mux.HandleFunc("GET /api/public/posts/{id}/interactions", a.publicInteractions)
	a.mux.HandleFunc("POST /api/public/posts/{id}/questions", a.createQuestion)
	a.mux.HandleFunc("POST /api/public/posts/{id}/questions/{question}/followups", a.createPassageFollowup)
	a.mux.HandleFunc("POST /api/public/posts/{id}/reactions", a.createPassageReaction)
	a.mux.HandleFunc("PUT /api/comments/{id}/answer", a.answerQuestion)
	a.mux.HandleFunc("PATCH /api/comments/{id}/followups/{followup}", a.moderatePassageFollowup)
	a.readerRoutes()
	a.readerAdminRoutes()
}
func (a *App) publishedInteractionPost(r *http.Request) Row {
	row := a.getPost(r.Context(), r.PathValue("id"))
	if row.str("status") != "published" {
		fail(404, "Post not found.")
	}
	return row
}
func (a *App) requireInteractions(ctx context.Context) {
	if !a.interactionSettings(ctx).yes("enabled") {
		fail(403, "Reader interactions are disabled.")
	}
}
func (a *App) publicInteractions(w http.ResponseWriter, r *http.Request) {
	post := a.publishedInteractionPost(r)
	config := a.publicInteractionSettings(r.Context())
	questions := []Row{}
	reader := a.commentReader(r)
	if config.str("questions") != "hidden" {
		for _, row := range a.DB.Must(r.Context(), `SELECT c.*,q.quote,q.anchor_status,q.answer,ca.reader_id,
			COALESCE(a.anchor_status,'active') AS section_anchor_status,COALESCE(a.position,0) AS position,COALESCE(a.occurrence,0) AS occurrence
			FROM comments c JOIN passage_questions q ON q.comment_id=c.id
			LEFT JOIN comment_authors ca ON ca.comment_id=c.id
			LEFT JOIN section_anchors a ON a.id=c.id
			WHERE c.post_id=$1 AND c.approved=TRUE AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL) AND q.anchor_status<>'hidden' ORDER BY c.created_at`, post["id"]) {
			question := passageQuestion(row)
			question["followups"] = a.readerQuestionFollowups(r.Context(), row.str("id"), readerIDForQuestion(reader, row))
			question["canReply"] = reader != nil && row.str("reader_id") == reader.str("id") && first(a.DB.Must(r.Context(), "SELECT id FROM passage_followups WHERE question_id=$1 AND answer='' LIMIT 1", row["id"])) == nil
			questions = append(questions, question)
		}
	}
	send(w, 200, Row{"enabled": config["enabled"], "questionMode": config["questions"], "notesEnabled": config["notes"], "reactionsEnabled": true, "questions": questions, "reactions": a.visibleReactions(r.Context(), post.str("id")), "subscriber": reader != nil && reader.str("email") != "", "authorUpdate": a.authorUpdate(r.Context(), post.str("id"), false), "contributors": a.publicContributors(r.Context(), post.str("id"))})
}
func readerIDForQuestion(reader, question Row) string {
	if reader != nil && reader.str("id") == question.str("reader_id") {
		return reader.str("id")
	}
	return ""
}
func passageQuestion(row Row) Row {
	result := comment(row, false)
	for _, field := range []string{"quote", "anchor_status", "answer"} {
		result[field] = row[field]
	}
	if _, ok := row["section_anchor_status"]; ok {
		result["section_anchor_status"] = row["section_anchor_status"]
		result["position"] = row["position"]
		result["occurrence"] = row["occurrence"]
	}
	return result
}

var passageBlocks = regexp.MustCompile(`</(?:p|div|li|h[1-6]|blockquote|pre|tr)>|<br\s*/?>`)
var passageTags = regexp.MustCompile(`<[^>]*>`)

func passageText(content string) string {
	return readableLine(html.UnescapeString(passageTags.ReplaceAllString(passageBlocks.ReplaceAllString(rssMarkdown(content, "https://passage.invalid"), " "), "")))
}
func (a *App) validatePassage(r *http.Request, input, post Row) string {
	if stringField(input, "revision", 1, 100, false) != post.str("revision") {
		coded(409, "This article changed. Reload it before adding your annotation.", "REVISION_CONFLICT")
	}
	quote := readableLine(stringField(input, "quote", 1, 2000, true))
	content, err := a.Storage.Get(r.Context(), post.str("content_key"))
	must(err)
	if nthPassagePosition(passageText(string(content)), quote, anchorOccurrence(input)) < 0 {
		fail(400, "Select a passage from the current article.")
	}
	return quote
}
func (a *App) createQuestion(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comments", 5, 15*time.Minute, false)
	a.requireInteractions(r.Context())
	if a.publicInteractionSettings(r.Context()).str("questions") != "open" {
		fail(403, "New passage questions are closed.")
	}
	input := body(w, r)
	name := stringField(input, "name", 1, 100, true)
	email := a.requireCommentReader(r).str("email")
	message := stringField(input, "body", 1, 10000, true)
	post := a.publishedInteractionPost(r)
	quote := a.validatePassage(r, input, post)
	send(w, 201, a.submitConversation(r, post, input, name, email, message, quote))
}
func (a *App) lockInteractionPost(ctx context.Context, tx *sql.Tx, post Row) {
	row := a.queryPostTransaction(ctx, tx, "UPDATE posts SET revision=revision WHERE id=$1 AND revision=$2 AND status='published' RETURNING id", post["id"], post["revision"])
	if row == nil {
		coded(409, "This article changed. Reload it before continuing.", "REVISION_CONFLICT")
	}
}
func (a *App) execInteraction(ctx context.Context, tx *sql.Tx, query string, args ...any) {
	query, args = a.DB.adapt(query, args)
	_, err := tx.ExecContext(ctx, query, args...)
	must(err)
}
func (a *App) answerQuestion(w http.ResponseWriter, r *http.Request) {
	answer := stringField(body(w, r), "answer", 0, 10000, true)
	before := first(a.DB.Must(r.Context(), `SELECT q.answer,c.post_id,ca.reader_id FROM passage_questions q
		JOIN comments c ON c.id=q.comment_id LEFT JOIN comment_authors ca ON ca.comment_id=c.id
		WHERE q.comment_id=$1`, r.PathValue("id")))
	row := first(a.DB.Must(r.Context(), "UPDATE passage_questions SET answer=$1 WHERE comment_id=$2 RETURNING comment_id", answer, r.PathValue("id")))
	if row == nil {
		fail(404, "Question not found.")
	}
	if before != nil && before.str("answer") == "" && answer != "" && before.str("reader_id") != "" {
		a.insertReaderAlert(r.Context(), before.str("reader_id"), "author_answered", before.str("post_id"), r.PathValue("id"), "question-answer:"+r.PathValue("id"), "The author answered you")
	}
	send(w, 200, Row{"ok": true})
}

// Only active anchors are processed. A later policy change never replays an edit.
func (a *App) reconcileQuestions(ctx context.Context, tx *sql.Tx, post Row, text, policy string) {
	query, args := a.DB.adapt("SELECT q.comment_id,q.quote FROM passage_questions q JOIN comments c ON c.id=q.comment_id WHERE c.post_id=$1 AND q.anchor_status='active'", []any{post["id"]})
	rows, err := tx.QueryContext(ctx, query, args...)
	must(err)
	pending := []Row{}
	for rows.Next() {
		var id, quote string
		must(rows.Scan(&id, &quote))
		pending = append(pending, Row{"id": id, "quote": quote})
	}
	must(rows.Err())
	must(rows.Close())
	for _, item := range pending {
		a.reconcileQuestion(ctx, tx, item, post, text, policy)
	}
}
func (a *App) reconcileQuestion(ctx context.Context, tx *sql.Tx, item, post Row, text, policy string) {
	status := "active"
	if !strings.Contains(text, item.str("quote")) {
		status = "detached"
		if policy == "hide" {
			status = "hidden"
		}
	}
	applied := ""
	if status != "active" {
		applied = policy
	}
	a.execInteraction(ctx, tx, "UPDATE passage_questions SET anchor_status=$1,revision=$2,applied_policy=$3 WHERE comment_id=$4", status, post["revision"], applied, item["id"])
}

func (a *App) publicInteractionSettings(ctx context.Context) Row {
	config := a.interactionSettings(ctx)
	if !a.commentsOpen(ctx, a.settings(ctx)) {
		config["questions"] = "hidden"
		config["enabled"] = config.yes("notes")
	}
	return config
}
