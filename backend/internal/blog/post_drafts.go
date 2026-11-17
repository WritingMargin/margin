package blog

import (
	"context"
	"database/sql"
	"net/http"
	"net/url"
	"time"
)

func (a *App) draftRoutes() {
	a.mux.HandleFunc("GET /api/posts/{id}/preview", a.createPostPreview)
	a.mux.HandleFunc("GET /draft/preview/{token}", a.publicPageHandler(a.sharedDraftHTML))
	a.mux.HandleFunc("GET /api/posts/{id}/draft", a.readPostDraft)
	a.mux.HandleFunc("PUT /api/posts/{id}/draft", a.updatePostDraft)
	a.mux.HandleFunc("POST /api/posts/{id}/draft/publish", a.publishPostDraft)
	a.mux.HandleFunc("DELETE /api/posts/{id}/draft", a.discardPostDraft)
	a.mux.HandleFunc("GET /draft/post/{slug}", a.publicPageHandler(a.draftHTML))
}

func (a *App) draftURL(r *http.Request, slug string) string {
	return a.publicationOrigin(r) + "/draft/post/" + url.PathEscape(slug)
}

func (a *App) savedPostDraft(ctx context.Context, id string) Row {
	return first(a.DB.Must(ctx, "SELECT * FROM post_drafts WHERE post_id=$1", id))
}

// @Summary Read the working draft of a post
// @ID readPostDraft
// @Description Returns saved staged changes, or the current post as the starting point if none exist. For published content baseRevision identifies the live revision on which the draft is based. Use the returned revision with updatePostDraft. Reading does not create a draft or change the live post. Archived posts cannot be staged.
// @Tags Posts
// @Security BearerAuth
// @Produce json
// @Param id path string true "Post ID"
// @Success 200 {object} APIPost
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Router /api/posts/{id}/draft [get]
func (a *App) readPostDraft(w http.ResponseWriter, r *http.Request) {
	live := a.getPost(r.Context(), r.PathValue("id"))
	row := live
	draft := a.savedPostDraft(r.Context(), live.str("id"))
	if draft != nil {
		row = object(draft["snapshot"])
	} else if live.str("status") == "archived" {
		coded(409, "Restore this archived post before editing a draft.", "POST_ARCHIVED")
	}
	result := a.postContent(r.Context(), row)
	result["recommendations"] = row["recommendations"]
	result["author"] = a.savedRevisionAuthor(r.Context(), row.str("id"), row.str("revision"))
	if draft != nil {
		result["baseRevision"] = draft["base_revision"]
	} else if live.str("status") == "published" {
		result["baseRevision"] = live["revision"]
	}
	a.sendPostResponse(w, r, 200, result)
}

// @Summary Save changes without publishing
// @ID updatePostDraft
// @Description Saves an ordinary draft or stages changes to a published article or guide while leaving all live content unchanged. Read readPostDraft first and supply its revision. Omitted fields are preserved from the working draft. Status may only be draft or omitted. Returns draftUrl at /draft/post/{slug}; only a signed-in admin browser session can load it. Writers and publishers may save drafts. If the live version changes after staging, discard and reconcile the draft before saving again. Use previewPost to obtain an expiring preview link without an admin session. Supports edits (exact oldText/newText replacements) instead of full content; returns structural block warnings. Publish explicitly using publishPostDraft.
// @Tags Posts
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Post ID"
// @Param input body APIUpdatePost true "Draft changes"
// @Success 200 {object} APIPost
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Failure 428 {object} APIError
// @Router /api/posts/{id}/draft [put]
func (a *App) updatePostDraft(w http.ResponseWriter, r *http.Request) {
	input := validPost(body(w, r), true)
	if nonDraftStatus(input) {
		fail(400, "Draft saves cannot publish or archive. Use publishPostDraft to publish.")
	}
	input["status"] = "draft"
	a.authorizePostWrite(r, input, nil)
	live := a.getPost(r.Context(), r.PathValue("id"))
	if live.str("status") == "draft" && a.savedPostDraft(r.Context(), live.str("id")) == nil {
		requirePostRevision(input, live)
		a.sendPostResponse(w, r, 200, a.updatePostResult(r, input, live))
		return
	}
	if live.str("status") != "published" {
		coded(409, "Restore this post before staging changes; discard any old staged draft first.", "POST_NOT_PUBLISHED")
	}
	result := a.savePostDraft(r, live, input)
	a.sendPostResponse(w, r, 200, result)
}

func (a *App) savePostDraft(r *http.Request, live, input Row) Row {
	ctx := r.Context()
	draft := a.savedPostDraft(ctx, live.str("id"))
	previous, baseRevision := live, live.str("revision")
	if draft != nil {
		previous, baseRevision = object(draft["snapshot"]), draft.str("base_revision")
	}
	requirePostRevision(input, previous)
	if baseRevision != live.str("revision") {
		coded(409, "The live post changed. Read both versions, discard the staged draft and reconcile your edits.", "REVISION_CONFLICT")
	}
	a.applyPostEdits(ctx, input, previous)
	content := a.postContent(ctx, previous).str("content")
	if value, exists := input["content"]; exists {
		content = value.(string)
	}
	row := draftSnapshot(previous, input)
	a.validateRecommendationPosts(ctx, live.str("id"), row["recommendations"])

	author := a.revisionAuthor(r)
	a.storePostDraft(ctx, live, draft, row, author, content)
	result := post(row)
	result["content"], result["recommendations"], result["author"] = content, row["recommendations"], author
	result["baseRevision"] = baseRevision
	return result
}

func draftSnapshot(previous, input Row) Row {
	row := Row{}
	for key, value := range previous {
		row[key] = value
	}
	for key, value := range input {
		row[key] = value
	}
	row["cover_mode"] = lookString(input, "coverMode", lookString(previous, "cover_mode", "player"))
	delete(row, "coverMode")
	row["toc"] = lookString(input, "tableOfContents", lookString(previous, "toc", "off"))
	row["content_type"] = lookString(input, "contentType", postContentType(previous))
	delete(row, "content")
	delete(row, "contentType")
	delete(row, "tableOfContents")
	row["revision"] = uuid()
	row["content_key"] = "posts/" + row.str("id") + "/" + row.str("revision") + ".md"
	row["updated_at"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	return row
}

func (a *App) storePostDraft(ctx context.Context, live, draft, row, author Row, content string) {
	key := row.str("content_key")
	must(a.Storage.Put(ctx, key, []byte(content)))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(ctx), key)
		}
	}()
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	a.lockPostWrites(ctx, tx)
	other := a.queryPostTransaction(ctx, tx, "SELECT id FROM posts WHERE slug=$1 AND id<>$2", row["slug"], row["id"])
	if other != nil {
		coded(409, "This slug is already in use.", "SLUG_CONFLICT")
	}
	// Serialize draft and live writes on the post before checking the draft revision.
	locked := a.queryPostTransaction(ctx, tx, "UPDATE posts SET revision=revision WHERE id=$1 AND revision=$2 AND status='published' RETURNING id", live["id"], live["revision"])
	requireDraftWrite(locked)
	var updated Row
	if draft == nil {
		updated = a.queryPostTransaction(ctx, tx, "INSERT INTO post_drafts(post_id,slug,revision,base_revision,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(post_id) DO NOTHING RETURNING post_id", live["id"], row["slug"], row["revision"], live["revision"], encode(row))
	} else {
		updated = a.queryPostTransaction(ctx, tx, "UPDATE post_drafts SET slug=$1,revision=$2,snapshot=$3 WHERE post_id=$4 AND revision=$5 RETURNING post_id", row["slug"], row["revision"], encode(row), live["id"], draft["revision"])
	}
	requireDraftWrite(updated)
	a.recordRevision(ctx, tx, row, author)
	if draft != nil {
		// A writer may refine an accepted reader fix in the working draft.
		// Keep attribution attached to that draft lineage until it is published.
		a.execInteraction(ctx, tx, `UPDATE section_flags SET accepted_draft_revision=$3,updated_at=NOW()
			WHERE post_id=$1 AND status='accepted' AND accepted_draft_revision=$2`, live["id"], draft["revision"], row["revision"])
	}
	a.reviewDraftChanged(ctx, tx, row["id"])
	a.DB.notifyPostTransaction(ctx, tx, row.str("id"))
	must(tx.Commit())
	a.DB.postCommitted(row.str("id"))
	saved = true
}

func requireDraftWrite(row Row) {
	if row == nil {
		coded(409, "The post or working draft changed. Read it again before saving.", "REVISION_CONFLICT")
	}
}

type draftPublicationKey struct{}
type draftPublication struct{ ID, Revision string }

func (a *App) consumePostDraft(ctx context.Context, tx *sql.Tx) {
	draft, ok := ctx.Value(draftPublicationKey{}).(draftPublication)
	if !ok {
		return
	}
	row := a.queryPostTransaction(ctx, tx, "DELETE FROM post_drafts WHERE post_id=$1 AND revision=$2 RETURNING post_id", draft.ID, draft.Revision)
	requireDraftWrite(row)
}

// Unpublishing withdraws public content without discarding work in progress.
// The reviewed live revision and the captured draft revision commit together;
// both previous versions remain available in revision history.
func (a *App) updatePostWithDraft(r *http.Request, input, previous Row) Row {
	if input.str("status") != "draft" || previous.str("status") == "draft" {
		return a.updatePostResult(r, input, previous)
	}
	draft := a.savedPostDraft(r.Context(), previous.str("id"))
	if draft == nil {
		return a.updatePostResult(r, input, previous)
	}
	if _, exists := input["edits"]; exists {
		fail(400, "Save text edits with save_draft before unpublishing a post with staged changes.")
	}
	snapshot := object(draft["snapshot"])
	changes := a.postContent(r.Context(), snapshot)
	changes["recommendations"] = snapshot["recommendations"]
	for key, value := range input {
		changes[key] = value
	}
	ctx := context.WithValue(r.Context(), draftPublicationKey{}, draftPublication{previous.str("id"), draft.str("revision")})
	return a.updatePostResult(r.WithContext(ctx), changes, previous)
}

// @Summary Publish the reviewed working draft
// @ID publishPostDraft
// @Description Publishes the entire saved draft, including metadata and slug. Requires the draft revision from readPostDraft or updatePostDraft and publisher permission. The live revision must still match the draft's baseRevision; a conflict preserves both versions. Also publishes ordinary unpublished drafts. Does not send a newsletter.
// @Tags Posts
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Post ID"
// @Param input body APIDeletePost true "Reviewed draft revision"
// @Success 200 {object} APIPost
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Failure 428 {object} APIError
// @Router /api/posts/{id}/draft/publish [post]
func (a *App) publishPostDraft(w http.ResponseWriter, r *http.Request) {
	live := a.getPost(r.Context(), r.PathValue("id"))
	draft := a.savedPostDraft(r.Context(), live.str("id"))
	input := body(w, r)
	a.authorizePostWrite(r, Row{"status": "published"}, live)
	if draft == nil {
		if live.str("status") != "draft" {
			coded(409, "There is no saved draft to publish.", "NO_DRAFT")
		}
		requirePostRevision(input, live)
		a.sendPostResponse(w, r, 200, a.updatePostResult(r, Row{"revision": live["revision"], "status": "published"}, live))
		return
	}
	requirePostRevision(input, draft)
	if live.str("status") != "published" || live.str("revision") != draft.str("base_revision") {
		coded(409, "The live post changed. Reconcile the draft before publishing.", "REVISION_CONFLICT")
	}
	snapshot := object(draft["snapshot"])
	changes := a.postContent(r.Context(), snapshot)
	changes["recommendations"] = snapshot["recommendations"]
	changes["status"], changes["revision"] = "published", live["revision"]
	ctx := context.WithValue(r.Context(), draftPublicationKey{}, draftPublication{live.str("id"), draft.str("revision")})
	a.sendPostResponse(w, r, 200, a.updatePostResult(r.WithContext(ctx), changes, live))
}

// @Summary Discard staged changes to a published post
// @ID discardPostDraft
// @Description Deletes only the working draft, preserving the live post and revision history. Requires the saved draft revision. Ordinary unpublished posts must be deleted using deletePost.
// @Tags Posts
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Post ID"
// @Param input body APIDeletePost true "Reviewed draft revision"
// @Success 200 {object} APIOK
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Failure 428 {object} APIError
// @Router /api/posts/{id}/draft [delete]
func (a *App) discardPostDraft(w http.ResponseWriter, r *http.Request) {
	draft := a.savedPostDraft(r.Context(), r.PathValue("id"))
	if draft == nil {
		fail(404, "No staged draft exists.")
	}
	requirePostRevision(body(w, r), draft)
	ctx := r.Context()
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	a.lockPostWrites(ctx, tx)
	requireDraftWrite(a.queryPostTransaction(ctx, tx, "DELETE FROM post_drafts WHERE post_id=$1 AND revision=$2 RETURNING post_id", draft["post_id"], draft["revision"]))
	a.execInteraction(ctx, tx, "UPDATE peer_reviews SET closed=TRUE WHERE post_id=$1 AND closed=FALSE", draft["post_id"])
	a.DB.notifyPostTransaction(ctx, tx, draft.str("post_id"))
	must(tx.Commit())
	a.DB.postCommitted(draft.str("post_id"))
	send(w, 200, Row{"ok": true})
}
