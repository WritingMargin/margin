package blog

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type APIPostPreview struct {
	ID         string   `json:"id"`
	Revision   string   `json:"revision"`
	PreviewURL string   `json:"previewUrl"`
	ExpiresAt  string   `json:"expiresAt" format:"date-time"`
	Warnings   []string `json:"warnings"`
}

// @Summary Preview the saved draft without an admin browser session
// @ID previewPost
// @Description Returns a bearer preview link valid for 30 minutes and only the current draft revision, plus structural block warnings. Anyone with this link may view this draft and its referenced uploaded media until it expires or the draft changes, is discarded, or is published. Uses the normal page renderer. Does not publish or modify post content. Warnings check block structure, not every semantic or visual constraint.
// @Tags Posts
// @Security BearerAuth
// @Produce json
// @Param id path string true "Post ID"
// @Success 200 {object} APIPostPreview
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Router /api/posts/{id}/preview [get]
func (a *App) createPostPreview(w http.ResponseWriter, r *http.Request) {
	live := a.getPost(r.Context(), r.PathValue("id"))
	row, _ := a.previewDraft(r, live.str("id"))
	if row == nil {
		coded(409, "Save a draft before requesting a preview.", "NO_DRAFT")
	}
	item := a.postContent(r.Context(), row)
	value := token()
	expires := time.Now().UTC().Add(30 * time.Minute).Format(time.RFC3339)
	a.DB.Must(r.Context(), "DELETE FROM post_previews WHERE expires_at<=NOW()")
	a.DB.Must(r.Context(), "INSERT INTO post_previews(token_hash,post_id,revision,expires_at) VALUES($1,$2,$3,$4)", hash(value), row["id"], row["revision"], expires)
	send(w, 200, Row{"id": row["id"], "revision": row["revision"], "previewUrl": a.publicationOrigin(r) + "/draft/preview/" + value, "expiresAt": expires, "warnings": postAuthoringWarnings(item)})
}

func (a *App) previewDraft(r *http.Request, id string) (Row, Row) {
	live := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE id=$1", id))
	if live == nil || live.str("status") == "archived" {
		return nil, nil
	}
	draft := a.savedPostDraft(r.Context(), id)
	if draft != nil {
		return object(draft["snapshot"]), draft
	}
	if live.str("status") == "draft" {
		return live, nil
	}
	return nil, nil
}

func (a *App) previewGrant(r *http.Request, value string) (Row, Row) {
	if len(value) != 43 {
		return nil, nil
	}
	grant := first(a.DB.Must(r.Context(), "SELECT * FROM post_previews WHERE token_hash=$1 AND expires_at>NOW()", hash(value)))
	if grant == nil {
		return nil, nil
	}
	row, draft := a.previewDraft(r, grant.str("post_id"))
	if row.str("revision") != grant.str("revision") {
		return nil, nil
	}
	return row, draft
}

func (a *App) sharedDraftHTML(w http.ResponseWriter, r *http.Request) {
	setDraftPreviewHeaders(w)
	value := r.PathValue("token")
	row, draft := a.previewGrant(r, value)
	if row == nil {
		fail(404, "Preview expired or draft changed.")
	}
	item := a.postContent(r.Context(), row)
	a.recheckDraftPreview(r, row, draft)
	// Change only the preview copy. Stored Markdown and live media stay untouched.
	for _, field := range []string{"content", "cover"} {
		item[field] = previewMediaURLs(item.str(field), value)
	}
	a.renderDraftPreview(w, r, item, a.publicationOrigin(r)+"/draft/preview/"+value)
}

const previewMediaPattern = `/api/(?:public/models/` + modelFilePattern + `|public/(?:covers|videos|audio)/[a-f0-9-]{36}\b|assets/[a-f0-9-]{36}\.png)`

var previewMediaPath = regexp.MustCompile(previewMediaPattern)

// Consume entire remote URLs first so a lookalike path on another host never receives the grant.
var previewMediaReference = regexp.MustCompile(`(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?//[^\s"'<>()[\]]+|` + previewMediaPattern)

func previewMediaURLs(text, value string) string {
	return previewMediaReference.ReplaceAllStringFunc(text, func(path string) string {
		if !strings.HasPrefix(path, "/api/") {
			return path
		}
		return path + "?preview=" + url.QueryEscape(value)
	})
}

func (a *App) previewMediaAllowed(r *http.Request) bool {
	value := r.URL.Query().Get("preview")
	if value == "" || previewMediaPath.FindString(r.URL.Path) != r.URL.Path {
		return false
	}
	row, draft := a.previewGrant(r, value)
	if row == nil {
		row, draft = a.peerMediaGrant(r, value)
	}
	if row == nil {
		return false
	}
	item := a.postContent(r.Context(), row)
	a.recheckDraftPreview(r, row, draft)
	for _, source := range []string{item.str("content"), item.str("cover"), object(item["seo"]).str("image")} {
		for _, path := range previewMediaPath.FindAllString(source, -1) {
			if strings.TrimSpace(path) == r.URL.Path {
				return true
			}
		}
	}
	return false
}

var previewMediaQuery = regexp.MustCompile(`\?preview=[A-Za-z0-9_-]{43}$`)

// Only renderer checks strip this narrowly defined grant; API input validators
// continue to require canonical stored paths.
func previewMediaBase(raw string) string { return previewMediaQuery.ReplaceAllString(raw, "") }

func (a *App) recheckPreviewMedia(r *http.Request) {
	if r.URL.Query().Get("preview") != "" && !a.previewMediaAllowed(r) {
		fail(404, "Preview expired or draft changed.")
	}
}
