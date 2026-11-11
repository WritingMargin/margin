package blog

import "net/http"

// @Summary Get a published post's public link
// @ID getPostLink
// @Description Returns the absolute canonical URL of a currently published article or guide, using its current slug, the configured publication domain (or PUBLIC_URL/request origin), and the mount path. Call after publishing instead of constructing a URL from the MCP endpoint. Reader, writer, publisher and owner tokens may use this operation. Drafts and archives return 409 POST_NOT_PUBLISHED with no public URL; this operation does not publish content. A returned link describes the current state, not a permanent guarantee of future availability.
// @Tags Posts
// @Security BearerAuth
// @Produce json
// @Param id path string true "Post ID"
// @Success 200 {object} APIPostLink
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 409 {object} APIError
// @Router /api/posts/{id}/link [get]
func (a *App) readPostLink(w http.ResponseWriter, r *http.Request) {
	row := a.getPost(r.Context(), r.PathValue("id"))
	if row.str("status") != "published" {
		send(w, 409, Row{"error": "No public URL is available while this post is " + a.postPublicationState(r, row) + ". Use get_post view=preview to review its draft without publishing.", "code": "POST_NOT_PUBLISHED", "status": row["status"], "publicationState": a.postPublicationState(r, row)})
		return
	}
	send(w, 200, Row{"id": row["id"], "title": row["title"], "slug": row["slug"], "url": readableLinks(row, a.publicationOrigin(r))["canonical"]})
}

type APIPostLink struct {
	ID    string `json:"id" binding:"required"`
	Title string `json:"title" binding:"required"`
	Slug  string `json:"slug" binding:"required"`
	URL   string `json:"url" binding:"required"`
}
