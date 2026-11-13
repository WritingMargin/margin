package blog

import (
	"html/template"
	"net/http"
)

func (a *App) draftHTML(w http.ResponseWriter, r *http.Request) {
	setDraftPreviewHeaders(w)
	// Preview links grant no access. Require an actual content-author browser session,
	// independently of any API/OAuth token supplied with the request.
	browser := r.Clone(r.Context())
	browser.Header.Del("Authorization")
	if !a.authenticated(browser) {
		fail(401, "Sign in as admin to preview this draft.")
	}
	if !tokenRouteAllowed(a.requestRole(browser), "GET /api/posts/{id}/draft") {
		fail(403, "Open this article through your peer-review invitation.")
	}
	slug := r.PathValue("slug")
	draft := first(a.DB.Must(r.Context(), "SELECT * FROM post_drafts WHERE slug=$1", slug))
	var row Row
	if draft != nil {
		row = object(draft["snapshot"])
	} else {
		row = first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='draft'", slug))
	}
	if row == nil {
		fail(404, "Draft not found.")
	}
	item := a.postContent(r.Context(), row)
	// Recheck after storage I/O so deleted, published or replaced drafts are not exposed.
	a.recheckDraftPreview(r, row, draft)
	a.renderDraftPreview(w, r, item, a.draftURL(r, slug))
}

func (a *App) renderDraftPreview(w http.ResponseWriter, r *http.Request, item Row, canonical string) {
	theme := themeForContent(a.publicTheme(r), item.str("contentType"))
	page := publicPage{Theme: theme, Post: item, Title: item.str("title"), Canonical: canonical, Status: 200, Preview: true}
	page.Body = template.HTML(sectionedArticle(item.str("content"), page.Canonical, true, item.str("tableOfContents"), contentsDesign(theme), "")) // #nosec G203 -- renderMarkdown disables author HTML and unsafe URLs; articleContents preserves sanitized markup.
	page.Data = publicJSON(Row{"theme": theme, "post": item, "preview": true})
	a.renderPublic(w, r, page)
}

func (a *App) recheckDraftPreview(r *http.Request, row, draft Row) {
	var current []Row
	if draft != nil {
		current = a.DB.Must(r.Context(), "SELECT post_id FROM post_drafts WHERE post_id=$1 AND revision=$2", draft["post_id"], draft["revision"])
	} else {
		current = a.DB.Must(r.Context(), "SELECT id FROM posts WHERE id=$1 AND revision=$2 AND status='draft'", row["id"], row["revision"])
	}
	if len(current) == 0 {
		fail(404, "Draft changed. Reload its current preview URL.")
	}
}

func setDraftPreviewHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Referrer-Policy", "no-referrer")
}
