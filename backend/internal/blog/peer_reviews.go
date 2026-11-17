package blog

import (
	"context"
	"database/sql"
	"net/http"
)

func (a *App) peerRoutes() {
	a.mux.HandleFunc("GET /api/public/team/reviews", a.memberPeerReviews)
	a.mux.HandleFunc("GET /review/{invite}", a.publicPageHandler(a.peerPage))
	a.mux.HandleFunc("POST /api/public/reviews/{invite}/open", a.openPeerReview)
	a.mux.HandleFunc("POST /api/public/reviews/{invite}/notes", a.addPeerNote)
	a.mux.HandleFunc("GET /api/public/reviews/{invite}/notes/{note}/fix", a.peerNoteFix)
	a.mux.HandleFunc("POST /api/public/reviews/{invite}/approve", a.approvePeerReview)
	a.mux.HandleFunc("GET /api/posts/{id}/reviews", a.authorReviews)
	a.mux.HandleFunc("POST /api/posts/{id}/reviews", a.invitePeer)
	a.mux.HandleFunc("GET /api/posts/{id}/reviews/notes/{note}/revisions", a.peerFixRevisions)
	a.mux.HandleFunc("POST /api/posts/{id}/reviews/notes/{note}/address", a.addressPeerNote)
}

func (a *App) peerPage(w http.ResponseWriter, r *http.Request) {
	setDraftPreviewHeaders(w)
	theme := a.publicTheme(r)
	page := publicPage{Theme: theme, Title: "Peer review", Action: "review", Status: 200}
	page.Data = publicJSON(Row{"theme": theme, "reviewInvite": r.PathValue("invite")})
	a.renderPublic(w, r, page)
}

func (a *App) activePeer(r *http.Request, id string) (Row, Row) {
	member := a.peerReviewPrincipal(r)
	if member == nil {
		coded(401, "Sign in to this publication to review this article.", "REVIEW_ACCOUNT_REQUIRED")
	}
	review := a.memberPeerReview(r, member, id)
	if review == nil {
		coded(404, "No active article invitation for this account.", "REVIEW_ACCOUNT_REQUIRED")
	}
	return review, member
}

func (a *App) reviewDraft(r *http.Request, id string) Row {
	draft, _ := a.previewDraft(r, id)
	if draft == nil {
		fail(409, "Save a working draft before opening peer review.")
	}
	return draft
}

// Recheck both grant and draft under the same lock as draft saves and publication.
func (a *App) peerTransaction(ctx context.Context, postID, revision string) *sql.Tx {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	ready := false
	defer func() {
		if !ready {
			tx.Rollback()
		}
	}()
	a.lockPostWrites(ctx, tx)
	current := a.queryPostTransaction(ctx, tx, `SELECT COALESCE(d.revision,p.revision) AS revision FROM posts p LEFT JOIN post_drafts d ON p.id=d.post_id WHERE p.id=$1 AND (p.status='draft' OR (p.status='published' AND d.revision IS NOT NULL))`, postID)
	if current == nil || current.str("revision") != revision {
		coded(409, "The working draft changed. Reload it to continue.", "REVISION_CONFLICT")
	}
	ready = true
	return tx
}

func (a *App) openPeerReview(w http.ResponseWriter, r *http.Request) {
	review, reader := a.activePeer(r, r.PathValue("invite"))
	ctx := r.Context()
	draft, staged := a.previewDraft(r, review.str("post_id"))
	if draft == nil {
		fail(409, "The working draft is no longer available.")
	}
	item := a.postContent(ctx, draft)
	previous := a.peerPrevious(ctx, review, item)
	tx := a.peerTransaction(ctx, draft.str("id"), draft.str("revision"))
	defer tx.Rollback()
	state := a.queryPostTransaction(ctx, tx, `UPDATE peer_reviews SET seen_revision=$1,reviewer_name=$2,status=CASE WHEN status='Requested' THEN 'In review' ELSE status END
 WHERE id=$3 AND closed=FALSE AND seen_revision=$4 RETURNING status,badge_name`, draft["revision"], reader["name"], review["id"], review["seen_revision"])
	if state == nil {
		fail(409, "Review changed. Reopen the invitation.")
	}
	notes, canApprove := a.visitNotes(ctx, tx, review.str("id"))
	must(tx.Commit())
	a.locateReviewPassages(ctx, item, notes)
	a.recheckDraftPreview(r, draft, staged)
	item["content"] = previewMediaURLs(item.str("content"), review.str("id"))
	item["cover"] = previewMediaURLs(item.str("cover"), review.str("id"))
	send(w, 200, Row{"post": item, "previous": previous, "notes": notes, "canApprove": canApprove, "status": state["status"], "badgeName": state["badge_name"], "name": reader["name"]})
}
func (a *App) peerPrevious(ctx context.Context, review, item Row) Row {
	seen := review.str("seen_revision")
	if seen == "" || seen == item.str("revision") {
		return nil
	}
	row := first(a.DB.Must(ctx, "SELECT snapshot FROM post_revisions WHERE post_id=$1 AND revision=$2", review["post_id"], seen))
	if row == nil {
		return nil
	}
	old := a.postContent(ctx, object(row["snapshot"]))
	old["content"] = previewMediaURLs(old.str("content"), review.str("id"))
	old["cover"] = previewMediaURLs(old.str("cover"), review.str("id"))
	return old
}
func (a *App) peerNotes(ctx context.Context, id string) []Row {
	rows := a.DB.Must(ctx, "SELECT id,revision,quote,occurrence,body,addressed_revision FROM peer_review_notes WHERE review_id=$1 ORDER BY created_at,id", id)
	if rows == nil {
		return []Row{}
	}
	return rows
}
func (a *App) authorReviews(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.getPost(r.Context(), id)
	rows := a.DB.Must(r.Context(), "SELECT id,email,reviewer_name,status,closed FROM peer_reviews WHERE post_id=$1 ORDER BY created_at DESC,id", id)
	if rows == nil {
		rows = []Row{}
	}
	for _, row := range rows {
		row["notes"] = a.peerNotes(r.Context(), row.str("id"))
	}
	send(w, 200, rows)
}

func (a *App) addPeerNote(w http.ResponseWriter, r *http.Request) {
	review, _ := a.activePeer(r, r.PathValue("invite"))
	draft := a.reviewDraft(r, review.str("post_id"))
	input := body(w, r)
	quote := a.validatePassage(r, input, draft)
	msg := stringField(input, "body", 1, 10000, true)
	ctx := r.Context()
	tx := a.peerTransaction(ctx, draft.str("id"), draft.str("revision"))
	defer tx.Rollback()
	id := uuid()
	if key, supplied := input["submissionId"]; supplied {
		id = peerNoteID(review.str("id"), key)
		prior := a.queryPostTransaction(ctx, tx, "SELECT revision,quote,body,occurrence FROM peer_review_notes WHERE id=$1", id)
		if prior != nil {
			samePeerNote(prior, msg, quote, draft.str("revision"), anchorOccurrence(input))
			send(w, 200, Row{"ok": true})
			return
		}
	}
	active := a.queryPostTransaction(ctx, tx, "UPDATE peer_reviews SET status='In review',approved_revision='',approved_digest='',badge_name='' WHERE id=$1 AND closed=FALSE RETURNING id", review["id"])
	if active == nil {
		fail(409, "Review is closed.")
	}
	a.execInteraction(ctx, tx, "INSERT INTO peer_review_notes(id,review_id,revision,quote,occurrence,body) VALUES($1,$2,$3,$4,$5,$6)", id, review["id"], draft["revision"], quote, anchorOccurrence(input), msg)
	must(tx.Commit())
	send(w, 201, Row{"ok": true})
}

func (a *App) addressPeerNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	postID := r.PathValue("id")
	revision := stringField(body(w, r), "revision", 1, 100, true)
	draft := a.reviewDraft(r, postID)
	tx := a.peerTransaction(ctx, postID, draft.str("revision"))
	defer tx.Rollback()
	row := a.queryPostTransaction(ctx, tx, `UPDATE peer_review_notes SET addressed_revision=$1 WHERE id=$2 AND addressed_revision='' AND review_id IN
 (SELECT id FROM peer_reviews WHERE post_id=$3 AND closed=FALSE) AND EXISTS
 (SELECT 1 FROM post_revisions fix JOIN post_revisions original ON original.post_id=fix.post_id WHERE fix.post_id=$3 AND fix.revision=$1 AND original.revision=peer_review_notes.revision AND fix.version>original.version AND fix.snapshot->>'status'='draft' AND fix.version<=(SELECT version FROM post_revisions WHERE post_id=$3 AND revision=$4))
 RETURNING review_id`, revision, r.PathValue("note"), postID, draft["revision"])
	if row == nil {
		fail(409, "Choose a saved revision after the note was written.")
	}
	a.execInteraction(ctx, tx, "UPDATE peer_reviews SET status='Changes made' WHERE id=$1", row["review_id"])
	must(tx.Commit())
	send(w, 200, Row{"ok": true})
}

func reviewDigest(post Row, content string) string {
	return hash(encode([]string{post.str("title"), post.str("excerpt"), post.str("cover"), content}))
}
func (a *App) approvePeerReview(w http.ResponseWriter, r *http.Request) {
	review, reader := a.activePeer(r, r.PathValue("invite"))
	ctx := r.Context()
	draft := a.reviewDraft(r, review.str("post_id"))
	input := body(w, r)
	requirePostRevision(input, draft)
	name := ""
	if booleanField(input, "badge") {
		name = stringField(input, "name", 1, 100, true)
	}
	content := a.postContent(ctx, draft).str("content")
	tx := a.peerTransaction(ctx, draft.str("id"), draft.str("revision"))
	defer tx.Rollback()
	approved := a.queryPostTransaction(ctx, tx, `UPDATE peer_reviews SET status='Approved',approved_revision=$1,approved_digest=$2,badge_name=$3,reviewer_name=$4
 WHERE id=$5 AND closed=FALSE AND NOT EXISTS (SELECT 1 FROM peer_review_notes WHERE review_id=$5 AND addressed_revision='') RETURNING id`, draft["revision"], reviewDigest(draft, content), name, reader["name"], review["id"])
	if approved == nil {
		fail(409, "Resolve the open review notes before approval.")
	}
	must(tx.Commit())
	send(w, 200, Row{"ok": true})
}

func (a *App) reviewDraftChanged(ctx context.Context, tx *sql.Tx, id any) {
	a.execInteraction(ctx, tx, `UPDATE peer_reviews SET status='Changes made',approved_revision='',approved_digest='',badge_name='' WHERE post_id=$1 AND closed=FALSE AND status='Approved'`, id)
}
func (a *App) reviewPostSaved(ctx context.Context, tx *sql.Tx, previous, row Row, content string) {
	if row.str("status") == "draft" {
		a.reviewDraftChanged(ctx, tx, row["id"])
		return
	}
	staged, publishingDraft := ctx.Value(draftPublicationKey{}).(draftPublication)
	if !publishingDraft && previous.str("status") != "draft" && row.str("status") != "archived" {
		return
	}
	revision := previous.str("revision")
	if publishingDraft {
		revision = staged.Revision
	}
	a.execInteraction(ctx, tx, `UPDATE peer_reviews SET closed=TRUE,published_revision=CASE WHEN approved_revision=$1 AND approved_digest=$2 AND $3='published' THEN $4 ELSE '' END WHERE post_id=$5 AND closed=FALSE`, revision, reviewDigest(row, content), row["status"], row["revision"], row["id"])
}
func (a *App) reviewerBadges(ctx context.Context, row Row) []string {
	rows := a.DB.Must(ctx, "SELECT badge_name FROM peer_reviews WHERE post_id=$1 AND published_revision=$2 AND badge_name<>'' ORDER BY created_at,id", row["id"], row["revision"])
	names := []string{}
	for _, r := range rows {
		names = append(names, r.str("badge_name"))
	}
	return names
}

func (a *App) peerMediaGrant(r *http.Request, value string) (Row, Row) {
	review := a.memberPeerReview(r, a.peerReviewPrincipal(r), value)
	if review == nil {
		return nil, nil
	}
	return a.previewDraft(r, review.str("post_id"))
}

// A reviewer can compare only the two revisions referenced by their addressed note.
func (a *App) peerNoteFix(w http.ResponseWriter, r *http.Request) {
	review, _ := a.activePeer(r, r.PathValue("invite"))
	ctx := r.Context()
	note := first(a.DB.Must(ctx, "SELECT revision,addressed_revision FROM peer_review_notes WHERE id=$1 AND review_id=$2 AND addressed_revision<>''", r.PathValue("note"), review["id"]))
	if note == nil {
		fail(404, "Addressed note not found.")
	}
	result := Row{}
	for _, key := range []string{"revision", "addressed_revision"} {
		version := first(a.DB.Must(ctx, "SELECT snapshot FROM post_revisions WHERE post_id=$1 AND revision=$2", review["post_id"], note[key]))
		if version == nil {
			fail(404, "Revision not found.")
		}
		result[key] = a.postContent(ctx, object(version["snapshot"]))
	}
	a.activePeer(r, r.PathValue("invite"))
	send(w, 200, result)
}

func (a *App) peerFixRevisions(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	draft := a.reviewDraft(r, postID)
	before := revisionCursor(r)
	rows := a.DB.Must(r.Context(), `SELECT fix.revision,fix.version,fix.saved_at AS "savedAt"
 FROM peer_review_notes n JOIN peer_reviews review ON review.id=n.review_id
 JOIN post_revisions original ON original.post_id=review.post_id AND original.revision=n.revision
 JOIN post_revisions current_draft ON current_draft.post_id=review.post_id AND current_draft.revision=$3
 JOIN post_revisions fix ON fix.post_id=review.post_id AND fix.version>original.version AND fix.version<=current_draft.version
 WHERE review.post_id=$1 AND n.id=$2 AND review.closed=FALSE AND n.addressed_revision='' AND fix.snapshot->>'status'='draft'
 AND fix.version<CAST($4 AS BIGINT) ORDER BY fix.version DESC LIMIT 50`, postID, r.PathValue("note"), draft["revision"], before)
	if rows == nil {
		rows = []Row{}
	}
	send(w, 200, rows)
}

func (a *App) visitNotes(ctx context.Context, tx *sql.Tx, id string) ([]Row, bool) {
	query, args := a.DB.adapt("SELECT id,revision,quote,occurrence,body,addressed_revision FROM peer_review_notes WHERE review_id=$1 ORDER BY created_at,id", []any{id})
	rows, err := tx.QueryContext(ctx, query, args...)
	must(err)
	defer rows.Close()
	columns, err := rows.Columns()
	must(err)
	notes := []Row{}
	canApprove := true
	for rows.Next() {
		row, err := scanRow(rows, columns)
		must(err)
		notes = append(notes, row)
		if row.str("addressed_revision") == "" {
			canApprove = false
		}
	}
	must(rows.Err())
	return notes, canApprove
}
func peerNoteID(reviewID string, key any) string {
	text, ok := key.(string)
	if !ok || !uuidRE.MatchString(text) {
		fail(400, "Invalid note submission ID.")
	}
	return hash(reviewID + ":" + text)
}
func samePeerNote(prior Row, body, quote, revision string, occurrence int) {
	if prior.str("body") != body || prior.str("quote") != quote || prior.str("revision") != revision || prior["occurrence"] != int64(occurrence) {
		fail(409, "This submission ID already belongs to a different note.")
	}
}
