package blog

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
)

func (a *App) assetRoutes() {
	a.brandingRoutes()
	a.mux.HandleFunc("POST /api/media/models", a.uploadDiagramAsset)
	a.mux.HandleFunc("GET /api/public/models/{id}", a.readDiagramAsset)
	a.mux.HandleFunc("POST /api/settings/logo", a.uploadLogo)
	a.mux.HandleFunc("POST /api/media/covers", a.uploadCover)
	a.mux.HandleFunc("POST /api/media/images", a.uploadImageJSON)
	a.mux.HandleFunc("GET /api/public/logos/{id}", a.readLogo)
	a.mux.HandleFunc("GET /api/public/covers/{id}", a.readCover)
}
func imageType(data []byte) string {
	if len(data) < 24 {
		return ""
	}
	if bytes.Equal(data[:8], []byte{137, 80, 78, 71, 13, 10, 26, 10}) {
		return "image/png"
	}
	if data[0] == 255 && data[1] == 216 && data[2] == 255 {
		return "image/jpeg"
	}
	if string(data[:6]) == "GIF87a" || string(data[:6]) == "GIF89a" {
		return "image/gif"
	}
	if string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	return ""
}
func (a *App) uploadImage(w http.ResponseWriter, r *http.Request, limit int64, table, prefix, public, message string) {
	declared := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
	if !supportedImageType(declared) {
		fail(400, message)
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		fail(413, "Request body is too large.")
	}
	kind := imageType(data)
	if kind == "" || kind != declared {
		fail(400, message)
	}
	url := a.storeUploadedImage(r.Context(), data, kind, table, prefix, public)
	send(w, 201, Row{"url": url})
}

func (a *App) storeUploadedImage(ctx context.Context, data []byte, kind, table, prefix, public string) string {
	id := uuid()
	a.storeMediaObject(ctx, data, kind, table, prefix+id, id)
	return public + id
}

func (a *App) storeMediaObject(ctx context.Context, data []byte, kind, table, key, id string) {
	must(a.Storage.Put(ctx, key, data))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(ctx), key)
		}
	}()
	a.DB.Must(ctx, "INSERT INTO "+table+"(id,object_key,content_type) VALUES($1,$2,$3)", id, key, kind)
	saved = true
}
func (a *App) uploadLogo(w http.ResponseWriter, r *http.Request) {
	a.uploadImage(w, r, 2<<20, "blog_logos", "logos/", "/api/public/logos/", "Choose a PNG, JPEG, WebP, or GIF image, up to 2 MB.")
}

// @Summary Upload an image as binary data
// @ID uploadImageBinary
// @Description Upload PNG, JPEG, WebP or GIF bytes (up to 10 MiB), with a matching Content-Type. Returns a reusable image URL for Markdown content, a post cover, or SEO image. Uploading alone does not attach or publish the image. Use updatePost with the latest revision to reference the returned URL. For JSON-only MCP tools, use uploadImage instead.
// @Tags Media
// @Security BearerAuth
// @Accept png,jpeg,gif
// @Produce json
// @Param image body string true "Raw image bytes, not multipart form data"
// @Success 201 {object} APIUploadedImage
// @Failure 400 {object} APIError "Unsupported or mismatched image type"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit uploads"
// @Failure 413 {object} APIError "Image exceeds 10 MiB"
// @Router /api/media/covers [post]
func (a *App) uploadCover(w http.ResponseWriter, r *http.Request) {
	a.uploadImage(w, r, maxArticleImageBytes, "uploaded_covers", "assets/covers/", "/api/public/covers/", "Choose a PNG, JPEG, WebP, or GIF image up to 10 MB.")
}
func (a *App) readLogo(w http.ResponseWriter, r *http.Request) {
	url := "/api/public/logos/" + r.PathValue("id")
	if !logoRE.MatchString(url) {
		fail(404, "Logo not found.")
	}
	private := a.privateMediaAllowed(r, "settings:manage")
	if !publishedDesignImage(a.settings(r.Context()), url) && !private {
		fail(404, "Logo not found.")
	}
	row := first(a.DB.Must(r.Context(), "SELECT object_key,content_type FROM blog_logos WHERE id=$1", r.PathValue("id")))
	if row == nil {
		fail(404, "Logo not found.")
	}
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	if !private && !publishedDesignImage(a.settings(r.Context()), url) {
		fail(404, "Logo not found.")
	}
	sendImage(w, row.str("content_type"), data)
}
func (a *App) coverPublished(ctx context.Context, url string) bool {
	if a.seoSettings(ctx).str("image") == url || a.publicAuthorProfile(ctx).str("image") == url {
		return true
	}
	if len(a.DB.Must(ctx, "SELECT id FROM posts WHERE (cover=$1 OR seo->>'image'=$1) AND status='published' LIMIT 1", url)) > 0 {
		return true
	}
	return a.uploadInPublishedContent(ctx, url)
}
func (a *App) readCover(w http.ResponseWriter, r *http.Request) {
	url := "/api/public/covers/" + r.PathValue("id")
	if !coverRE.MatchString(url) {
		fail(404, "Cover image not found.")
	}
	owner := a.privateMediaAllowed(r, "content:read")
	if !owner && !a.coverPublished(r.Context(), url) {
		fail(404, "Cover image not found.")
	}
	row := first(a.DB.Must(r.Context(), "SELECT object_key,content_type FROM uploaded_covers WHERE id=$1", r.PathValue("id")))
	if row == nil {
		fail(404, "Cover image not found.")
	}
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.recheckPreviewMedia(r)
	// Recheck publication after storage I/O to prevent leaking an unpublished cover.
	if !owner && !a.coverPublished(r.Context(), url) {
		fail(404, "Cover image not found.")
	}
	if !owner {
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	}
	sendImage(w, row.str("content_type"), data)
}
func sendImage(w http.ResponseWriter, kind string, data []byte) {
	w.Header().Set("Content-Type", kind)
	w.WriteHeader(200)
	_, _ = w.Write(data)
}

func supportedImageType(kind string) bool {
	return kind == "image/png" || kind == "image/jpeg" || kind == "image/webp" || kind == "image/gif"
}
