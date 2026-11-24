package blog

import (
	"context"
	"net/http"
	"strings"
	"time"
)

// @Summary Delete a library image
// @ID deleteImage
// @Description Permanently removes an uploaded or AI-generated image from the media library and object storage. Images still used by an article (including private and archived articles), saved draft or publication setting are refused. Select the image by its public_id from listImages.
// @Tags Media
// @Security BearerAuth
// @Produce json
// @Param id path string true "Image public_id"
// @Success 200 {object} map[string]string "Deleted image public_id"
// @Failure 404 {object} APIError "Image not found"
// @Failure 409 {object} APIError "Image is still used by an article or setting"
// @Failure 503 {object} APIError "Storage could not verify or remove the image"
// @Router /api/media/images/{id} [delete]
func (a *App) deleteImage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidRE.MatchString(id) {
		imageMissing()
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	table, address, image := a.libraryImage(ctx, id)
	if a.imageInUse(ctx, address) {
		coded(409, "This image is used by an article, saved draft or publication setting. Remove that reference before deleting it.", "MEDIA_IN_USE")
	}
	must(ctx.Err())
	// Keep the row discoverable and retryable if storage rejects the deletion.
	// Use the request context so a disconnected client cannot leave unbounded work.
	if err := a.Storage.Remove(ctx, image.str("object_key")); err != nil {
		coded(503, "The image could not be removed from storage. Please try again.", "MEDIA_DELETE_FAILED")
	}
	a.DB.Must(ctx, "DELETE FROM "+table+" WHERE id=$1", id)
	send(w, 200, Row{"deleted": id})
}

func imageMissing() { coded(404, "Image not found.", "IMAGE_NOT_FOUND") }

func (a *App) libraryImage(ctx context.Context, id string) (string, string, Row) {
	if image := first(a.DB.Must(ctx, "SELECT object_key FROM uploaded_covers WHERE id=$1", id)); image != nil {
		return "uploaded_covers", "/api/public/covers/" + id, image
	}
	image := first(a.DB.Must(ctx, "SELECT object_key FROM generated_assets WHERE id=$1", id))
	if image == nil {
		imageMissing()
	}
	return "generated_assets", "/api/assets/" + id + ".png", image
}

// Published indexes omit private articles and generated images. Read every
// current article and staged draft's immutable content instead, and fail closed
// if any object cannot be checked. DB.Must materializes and closes its SQL rows
// before the object-storage reads start.
func (a *App) imageInUse(ctx context.Context, address string) bool {
	if strings.Contains(encode(a.settings(ctx)), address) {
		return true
	}
	for _, row := range a.DB.Must(ctx, "SELECT cover,seo,content_key FROM posts ORDER BY id") {
		if a.imageInSnapshot(ctx, row, address) {
			return true
		}
	}
	for _, draft := range a.DB.Must(ctx, "SELECT snapshot FROM post_drafts ORDER BY post_id") {
		if a.imageInSnapshot(ctx, object(draft["snapshot"]), address) {
			return true
		}
	}
	for _, row := range a.DB.Must(ctx, "SELECT content FROM simplified_versions UNION ALL SELECT content FROM simplified_edits UNION ALL SELECT content FROM workspace_notes") {
		if strings.Contains(row.str("content"), address) {
			return true
		}
	}
	return false
}

func (a *App) imageInSnapshot(ctx context.Context, row Row, address string) bool {
	if strings.Contains(encode(row), address) {
		return true
	}
	key := row.str("content_key")
	if key == "" {
		return false
	}
	content, err := a.Storage.Get(ctx, key)
	if err != nil {
		coded(503, "Article content could not be checked. Please try deleting the image again later.", "MEDIA_REFERENCE_CHECK_FAILED")
	}
	return strings.Contains(string(content), address)
}
