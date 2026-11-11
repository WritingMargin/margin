package blog

import (
	"html"
	"net/http"
	"strings"
	"time"
)

func (a *App) guideProgressPost(r *http.Request) Row {
	post := a.publishedInteractionPost(r)
	if post.str("content_type") != "guide" {
		fail(404, "Guide not found.")
	}
	return post
}

func guideHasSection(post Row, section string) bool {
	if section == "" {
		return false
	}
	markup := sectionedArticle(post.str("content"), "", false, "off", nil, "")
	return strings.Contains(markup, `id="`+html.EscapeString(section)+`"`) && strings.HasPrefix(section, "section")
}

func (a *App) readerGuideProgress(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	reader := a.requireCommentReader(r)
	post := a.guideProgressPost(r)
	row := first(a.DB.Must(r.Context(), "SELECT section FROM reader_guide_progress WHERE reader_id=$1 AND post_id=$2", reader["id"], post["id"]))
	section := row.str("section")
	if !guideHasSection(a.postContent(r.Context(), post), section) {
		section = ""
	}
	send(w, 200, Row{"section": section, "completed": a.completedGuideSteps(r, reader, post, guideSections(a.postContent(r.Context(), post).str("content")))})
}

func (a *App) saveReaderGuideProgress(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	reader := a.requireCommentReader(r)
	a.limit(r, "guide-progress", 240, time.Minute, false)
	post := a.guideProgressPost(r)
	input := body(w, r)
	strict(input, "section", "revision")
	section := stringField(input, "section", 1, 2048, true)
	if stringField(input, "revision", 1, 100, true) != post.str("revision") {
		coded(409, "This guide changed. Reload it to save your place.", "REVISION_CONFLICT")
	}
	if !guideHasSection(a.postContent(r.Context(), post), section) {
		fail(400, "Guide section not found.")
	}
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	a.execInteraction(r.Context(), tx, `INSERT INTO reader_guide_progress(reader_id,post_id,section) VALUES($1,$2,$3)
 ON CONFLICT(reader_id,post_id) DO UPDATE SET section=EXCLUDED.section`, reader["id"], post["id"], section)
	must(tx.Commit())
	send(w, 200, Row{"section": section})
}
