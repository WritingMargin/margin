package blog

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"time"
)

func (a *App) simplifiedRoutes() {
	a.mux.HandleFunc("GET /api/settings/simplified", a.readSimplifiedSettings)
	a.mux.HandleFunc("PUT /api/settings/simplified", a.saveSimplifiedSettings)
	a.mux.HandleFunc("GET /api/posts/{id}/simplified", a.readSimplifiedDraft)
	a.mux.HandleFunc("GET /api/posts/{id}/simplified/history", a.simplifiedHistory)
	a.mux.HandleFunc("PUT /api/posts/{id}/simplified", a.saveSimplifiedDraft)
	a.mux.HandleFunc("POST /api/posts/{id}/simplified/generate", a.generateSimplifiedForPost)
	a.mux.HandleFunc("POST /api/posts/{id}/simplified/retry", a.retrySimplified)
	a.mux.HandleFunc("GET /api/public/posts/{slug}/simplified", a.publicSimplified)
	a.mux.HandleFunc("GET /api/public/posts/{slug}/simplified/availability", a.simplifiedAvailability)
	a.mux.HandleFunc("GET /reading/view/{view}/{slug}", a.chooseReadingView)
}

func (a *App) chooseReadingView(w http.ResponseWriter, r *http.Request) {
	view := r.PathValue("view")
	if view != "standard" && view != "simplified" {
		fail(404, "Reading view not found.")
	}
	post := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='published'", r.PathValue("slug")))
	if post == nil {
		fail(404, "Article not found.")
	}
	if view == "simplified" {
		version := a.simplifiedVersion(r.Context(), post)
		if version == nil || version.str("status") != "ready" {
			fail(404, "Simplified version is unavailable.")
		}
	}
	http.SetCookie(w, &http.Cookie{Name: "margin_reading_view", Value: view, Path: sitePath("/"), MaxAge: 365 * 24 * 60 * 60, Secure: r.TLS != nil, SameSite: http.SameSiteLaxMode})
	target := sitePath("/post/" + url.PathEscape(post.str("slug")))
	if view == "simplified" {
		target += "/simplified"
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, target, http.StatusFound)
}

func validSimplifiedSettings(input Row) Row {
	strict(input, "enabled")
	return Row{"enabled": booleanField(input, "enabled")}
}

func (a *App) simplifiedSettings(ctx context.Context) Row {
	return a.siteSetting(ctx, "simplified", Row{"enabled": false}, validSimplifiedSettings)
}

func (a *App) readSimplifiedSettings(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.simplifiedSettings(r.Context()))
}

func (a *App) saveSimplifiedSettings(w http.ResponseWriter, r *http.Request) {
	value := validSimplifiedSettings(body(w, r))
	if value.yes("enabled") {
		config := a.aiConfig(r.Context())
		if !object(config["features"]).yes("simplified") {
			coded(503, "Simplified article generation requires a connected Margin account.", "AI_NOT_CONFIGURED")
		}
	}
	a.saveSiteSetting(r.Context(), "simplified", value)
	if value.yes("enabled") {
		go a.resumeSimplifiedJobs()
	}
	send(w, 200, value)
}

func (a *App) simplifiedVersion(ctx context.Context, post Row) Row {
	return first(a.DB.Must(ctx, "SELECT * FROM simplified_versions WHERE post_id=$1 AND source_revision=$2", post["id"], post["revision"]))
}

func (a *App) simplifiedCurrent(ctx context.Context, post Row) bool {
	return first(a.DB.Must(ctx, `SELECT 1 AS present FROM simplified_versions v JOIN posts p ON p.id=v.post_id
		WHERE v.post_id=$1 AND v.source_revision=$2 AND v.status='ready' AND p.revision=$2 AND p.status='published'`, post["id"], post["revision"])) != nil
}

func simplifiedDraftResult(post, version Row) Row {
	result := Row{"postId": post["id"], "sourceRevision": post["revision"], "status": "unavailable", "content": "", "reviewed": false, "writerRevision": "", "error": ""}
	if version != nil {
		for key, source := range map[string]string{"status": "status", "content": "content", "reviewed": "reviewed", "writerRevision": "writer_revision", "error": "error"} {
			result[key] = version[source]
		}
		result["reviewed"] = simplifiedReviewed(version)
	}
	return result
}

func simplifiedReviewed(version Row) bool {
	return version.yes("reviewed") || version["reviewed"] == int64(1)
}

func (a *App) readSimplifiedDraft(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	send(w, 200, simplifiedDraftResult(post, a.simplifiedVersion(r.Context(), post)))
}

func (a *App) saveSimplifiedDraft(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "sourceRevision", "writerRevision", "content", "reviewed", "hidden")
	post := a.getPost(r.Context(), r.PathValue("id"))
	if post.str("status") != "published" || stringField(input, "sourceRevision", 1, 100, false) != post.str("revision") {
		coded(409, "The published article changed. Reload its Simplified version.", "REVISION_CONFLICT")
	}
	content := stringField(input, "content", 1, 16000, true)
	writerRevision := stringField(input, "writerRevision", 1, 100, false)
	reviewed := booleanField(input, "reviewed")
	hidden := booleanField(input, "hidden")
	status := "ready"
	if hidden {
		status = "hidden"
	}
	ctx := r.Context()
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	q, args := a.DB.adapt(`INSERT INTO simplified_edits(post_id,source_revision,writer_revision,content,reviewed,status,saved_at)
		SELECT post_id,source_revision,writer_revision,content,reviewed,status,updated_at FROM simplified_versions
		WHERE post_id=$1 AND source_revision=$2 AND writer_revision=$3 AND status IN ('ready','hidden')`, []any{post["id"], post["revision"], writerRevision})
	inserted, err := tx.ExecContext(ctx, q, args...)
	must(err)
	count, err := inserted.RowsAffected()
	must(err)
	if count != 1 {
		coded(409, "The Simplified version changed. Reload before saving.", "REVISION_CONFLICT")
	}
	nextRevision := uuid()
	q, args = a.DB.adapt(`UPDATE simplified_versions SET content=$1,reviewed=$2,status=$3,writer_revision=$4,updated_at=NOW()
		WHERE post_id=$5 AND source_revision=$6 AND writer_revision=$7 AND status IN ('ready','hidden')`, []any{content, reviewed, status, nextRevision, post["id"], post["revision"], writerRevision})
	updated, err := tx.ExecContext(ctx, q, args...)
	must(err)
	count, err = updated.RowsAffected()
	must(err)
	if count != 1 {
		coded(409, "The Simplified version changed. Reload before saving.", "REVISION_CONFLICT")
	}
	must(tx.Commit())
	send(w, 200, simplifiedDraftResult(post, Row{"status": status, "content": content, "reviewed": reviewed, "writer_revision": nextRevision, "error": ""}))
}

func (a *App) simplifiedHistory(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	rows := a.DB.Must(r.Context(), `SELECT source_revision,writer_revision,content,reviewed,status,updated_at AS saved_at,'current' AS kind
		FROM simplified_versions WHERE post_id=$1 AND status IN ('ready','hidden')
		UNION ALL
		SELECT source_revision,writer_revision,content,reviewed,status,saved_at,'previous' AS kind
		FROM simplified_edits WHERE post_id=$1
		ORDER BY saved_at DESC,kind ASC,writer_revision DESC LIMIT 50`, post["id"])
	history := []Row{}
	for _, row := range rows {
		history = append(history, Row{"sourceRevision": row["source_revision"], "writerRevision": row["writer_revision"], "content": row["content"], "reviewed": simplifiedReviewed(row), "status": row["status"], "savedAt": row["saved_at"], "kind": row["kind"]})
	}
	send(w, 200, history)
}

func (a *App) retrySimplified(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	if post.str("status") != "published" || !a.simplifiedSettings(r.Context()).yes("enabled") {
		fail(409, "Publish the article and enable Simplified articles first.")
	}
	row := first(a.DB.Must(r.Context(), `UPDATE simplified_versions SET status='queued',error='',generation_id=$3,updated_at=NOW()
		WHERE post_id=$1 AND source_revision=$2 AND status='failed' RETURNING *`, post["id"], post["revision"], uuid()))
	if row == nil {
		fail(409, "Only a failed Simplified generation can be retried.")
	}
	a.startSimplified(post.str("id"), post.str("revision"))
	send(w, 202, simplifiedDraftResult(post, row))
}

func (a *App) generateSimplifiedForPost(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	if post.str("status") != "published" || !a.simplifiedSettings(r.Context()).yes("enabled") {
		fail(409, "Publish the article and enable Simplified articles first.")
	}
	row := first(a.DB.Must(r.Context(), `INSERT INTO simplified_versions(post_id,source_revision,generation_id)
		VALUES($1,$2,$3) ON CONFLICT(post_id,source_revision) DO NOTHING RETURNING *`, post["id"], post["revision"], uuid()))
	if row == nil {
		fail(409, "This article already has a Simplified generation. Refresh its status.")
	}
	go a.queueSimplified(post.str("id"), post.str("revision"))
	send(w, 202, simplifiedDraftResult(post, row))
}

func (a *App) publicSimplified(w http.ResponseWriter, r *http.Request) {
	post := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='published'", r.PathValue("slug")))
	if post == nil {
		fail(404, "Article not found.")
	}
	version := a.simplifiedVersion(r.Context(), post)
	if version == nil || version.str("status") != "ready" {
		fail(404, "Simplified version is unavailable.")
	}
	result := a.postContent(r.Context(), post)
	result["content"] = version["content"]
	result["simplified"] = true
	result["simplifiedReviewed"] = simplifiedReviewed(version)
	a.recheckReadable(r.Context(), []Row{post})
	if !a.simplifiedCurrent(r.Context(), post) {
		fail(404, "Simplified version is unavailable.")
	}
	send(w, 200, result)
}

func (a *App) simplifiedAvailability(w http.ResponseWriter, r *http.Request) {
	post := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='published'", r.PathValue("slug")))
	if post == nil {
		fail(404, "Article not found.")
	}
	version := a.simplifiedVersion(r.Context(), post)
	send(w, 200, Row{"available": version != nil && version.str("status") == "ready"})
}

func (a *App) queueSimplified(id, revision string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	defer func() {
		if err := recover(); err != nil {
			log.Printf("[margin] simplified queue: %v", err)
		}
	}()
	if !a.simplifiedSettings(ctx).yes("enabled") {
		return
	}
	post := first(a.DB.Must(ctx, "SELECT * FROM posts WHERE id=$1 AND revision=$2 AND status='published'", id, revision))
	if post == nil {
		return
	}
	a.DB.Must(ctx, `INSERT INTO simplified_versions(post_id,source_revision,generation_id) VALUES($1,$2,$3)
		ON CONFLICT(post_id,source_revision) DO NOTHING`, id, revision, uuid())
	a.generateSimplified(ctx, post)
}

func (a *App) startSimplified(id, revision string) {
	if !a.recordSimplifiedJob(id, revision) {
		return
	}
	go a.queueSimplified(id, revision)
}

func (a *App) recordSimplifiedJob(id, revision string) (queued bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer func() {
		if failure := recover(); failure != nil {
			log.Printf("[margin] simplified queue: %v", failure)
			queued = false
		}
	}()
	if !a.simplifiedSettings(ctx).yes("enabled") {
		return false
	}
	post := first(a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1 AND revision=$2 AND status='published'", id, revision))
	if post == nil {
		return false
	}
	a.DB.Must(ctx, `INSERT INTO simplified_versions(post_id,source_revision,generation_id) VALUES($1,$2,$3)
		ON CONFLICT(post_id,source_revision) DO NOTHING`, id, revision, uuid())
	return true
}

func (a *App) resumeSimplifiedJobs() {
	defer func() {
		if failure := recover(); failure != nil {
			log.Printf("[margin] simplified recovery: %v", failure)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if !a.simplifiedSettings(ctx).yes("enabled") {
		return
	}
	// The Central idempotency key stays the same across a restart, so resuming
	// an interrupted generation cannot spend the writer's credits twice.
	a.DB.Must(ctx, `UPDATE simplified_versions SET status='queued',updated_at=NOW() WHERE status='generating'`)
	for _, row := range a.DB.Must(ctx, `SELECT v.post_id,v.source_revision FROM simplified_versions v
		JOIN posts p ON p.id=v.post_id AND p.revision=v.source_revision
		WHERE v.status='queued' AND p.status='published' ORDER BY p.created_at ASC,p.id ASC`) {
		a.queueSimplified(row.str("post_id"), row.str("source_revision"))
	}
}

func (a *App) generateSimplified(ctx context.Context, post Row) {
	version := first(a.DB.Must(ctx, `UPDATE simplified_versions SET status='generating',updated_at=NOW()
		WHERE post_id=$1 AND source_revision=$2 AND status='queued' RETURNING generation_id`, post["id"], post["revision"]))
	if version == nil {
		return
	}
	id := version.str("generation_id")
	defer func() {
		if failure := recover(); failure != nil {
			message := "Simplified generation failed."
			if e, ok := failure.(*HTTPError); ok {
				message = e.Message
			}
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			if _, err := a.DB.Query(cleanup, `UPDATE simplified_versions SET status='failed',error=$1,updated_at=NOW() WHERE post_id=$2 AND source_revision=$3 AND status='generating'`, message, post["id"], post["revision"]); err != nil {
				log.Printf("[margin] simplified generation cleanup: %v", err)
			}
			log.Printf("[margin] simplified generation: %v", failure)
		}
	}()
	content, err := a.Storage.Get(ctx, post.str("content_key"))
	must(err)
	result := a.serviceRequest(ctx, "/v1/generations/simplified", Row{"postId": post["id"], "title": post["title"], "content": string(content)}, id)
	text := result.str("content")
	if text == "" || len([]rune(text)) > 16000 {
		fail(502, "The AI service returned an invalid Simplified version.")
	}
	a.DB.Must(ctx, `UPDATE simplified_versions SET content=$1,status='ready',error='',writer_revision=$2,updated_at=NOW()
		WHERE post_id=$3 AND source_revision=$4 AND status='generating'`, text, uuid(), post["id"], post["revision"])
}
