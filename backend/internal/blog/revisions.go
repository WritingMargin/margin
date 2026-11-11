package blog

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
)

// Metadata and its history commit together. The content objects are immutable.
func (a *App) commitPost(ctx context.Context, previous, author Row, content, query string, args ...any) Row {
	origin := a.indexNowTarget(ctx)
	policy := a.interactionSettings(ctx).str("editPolicy")
	text := passageText(content)
	changed := a.interactionContentChanged(ctx, previous, content)
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	a.lockPostWrites(ctx, tx)
	row := a.queryPostTransaction(ctx, tx, query, args...)
	if row == nil {
		coded(409, "This post changed. Reload it before saving.", "REVISION_CONFLICT")
	}
	a.consumePostDraft(ctx, tx)
	a.reviewPostSaved(ctx, tx, previous, row, content)
	a.checkPostDraftSlug(ctx, tx, row)
	if previous != nil {
		a.recordRevision(ctx, tx, previous, unknownRevisionAuthor())
	}
	a.recordRevision(ctx, tx, row, author)
	must(a.indexPostMediaRefs(ctx, tx, row, content))
	must(a.indexPostSearch(ctx, tx, row, content))
	if changed {
		a.reconcileQuestions(ctx, tx, row, text, policy)
		oldText := ""
		if previous != nil {
			oldContent, err := a.Storage.Get(ctx, previous.str("content_key"))
			must(err)
			oldText = passageText(string(oldContent))
		}
		a.reconcileAnchors(ctx, tx, row, oldText, text)
	}
	a.queuePostSearch(ctx, tx, origin, previous, row)
	a.reconcileAppliedSectionFlags(ctx, tx, row)
	a.DB.notifyPostTransaction(ctx, tx, row.str("id"))
	must(tx.Commit())
	a.DB.postCommitted(row.str("id"))
	return row
}
func (a *App) queryPostTransaction(ctx context.Context, tx *sql.Tx, query string, args ...any) Row {
	query, args = a.DB.adapt(query, args)
	rows, err := tx.QueryContext(ctx, query, args...)
	must(err)
	defer rows.Close()
	columns, err := rows.Columns()
	must(err)
	if !rows.Next() {
		must(rows.Err())
		return nil
	}
	row, err := scanRow(rows, columns)
	must(err)
	return row
}
func (a *App) recordRevision(ctx context.Context, tx *sql.Tx, row, author Row) {
	query, args := a.DB.adapt(`INSERT INTO post_revisions(post_id,revision,version,snapshot,saved_at,author)
 SELECT $1,$2,COALESCE(MAX(version),0)+1,$3,$4,$5 FROM post_revisions WHERE post_id=$1
 ON CONFLICT(post_id,revision) DO NOTHING`, []any{row["id"], row["revision"], encode(row), row["updated_at"], encode(author)})
	_, err := tx.ExecContext(ctx, query, args...)
	must(err)
}

// @Summary List saved revisions
// @ID revisionList
// @Description Returns up to 50 revisions, newest version first. Pass the last version as before for the next page.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Param before query integer false "Exclusive version cursor" minimum(1)
// @Success 200 {array} APIRevisionSummary
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Router /api/posts/{id}/revisions [get]
func (a *App) revisionList(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.getPost(r.Context(), id)
	before := revisionCursor(r)
	rows := a.DB.Must(r.Context(), "SELECT revision,version,snapshot,saved_at,author FROM post_revisions WHERE post_id=$1 AND version<CAST($2 AS BIGINT) ORDER BY version DESC LIMIT 50", id, before)
	result := []Row{}
	for _, row := range rows {
		snapshot := object(row["snapshot"])
		result = append(result, Row{"revision": row["revision"], "version": row["version"], "savedAt": row["saved_at"], "author": row["author"], "title": snapshot["title"], "status": snapshot["status"], "contentType": postContentType(snapshot)})
	}
	a.sendPostResponse(w, r, 200, result)
}

// @Summary Read a saved revision
// @ID readRevision
// @Description Returns the historical snapshot. previousRevision is null for the earliest saved version.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Param revision path string true "Revision"
// @Success 200 {object} APIRevision
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Router /api/posts/{id}/revisions/{revision} [get]
func (a *App) readRevision(w http.ResponseWriter, r *http.Request) {
	row := first(a.DB.Must(r.Context(), "SELECT snapshot,version,saved_at,author FROM post_revisions WHERE post_id=$1 AND revision=$2", r.PathValue("id"), r.PathValue("revision")))
	if row == nil {
		fail(404, "Revision not found.")
	}
	snapshot := object(row["snapshot"])
	result := a.postContent(r.Context(), snapshot)
	result["recommendations"] = snapshot["recommendations"]
	result["version"] = row["version"]
	result["savedAt"] = row["saved_at"]
	result["author"] = row["author"]
	result["previousRevision"] = nil
	previous := first(a.DB.Must(r.Context(), "SELECT revision FROM post_revisions WHERE post_id=$1 AND version<$2 ORDER BY version DESC LIMIT 1", r.PathValue("id"), row["version"]))
	if previous != nil {
		result["previousRevision"] = previous["revision"]
	}
	a.sendPostResponse(w, r, 200, result)
}

func (a *App) interactionContentChanged(ctx context.Context, previous Row, content string) bool {
	if previous == nil {
		return false
	}
	data, err := a.Storage.Get(ctx, previous.str("content_key"))
	must(err)
	return string(data) != content
}

func revisionCursor(r *http.Request) int64 {
	before := int64(9223372036854775807)
	if value := r.URL.Query().Get("before"); value != "" {
		number, err := strconv.ParseInt(value, 10, 64)
		if err != nil || number < 1 {
			fail(400, "Invalid revision cursor.")
		}
		before = number
	}
	return before
}
