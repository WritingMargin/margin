package blog

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"mime"
	"net/http"
	"regexp"
	"time"
)

const maxVideoBytes = 50 << 20
const maxJSONVideoBytes = 10 << 20

var videoUploadRE = regexp.MustCompile(`^/api/public/videos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func (a *App) videoRoutes() {
	a.mux.HandleFunc("GET /api/media/videos", a.listVideos)
	a.mux.HandleFunc("POST /api/media/videos", a.uploadVideo)
	a.mux.HandleFunc("GET /api/public/videos/{id}", a.readVideo)
}

// @Summary Upload a video to Margin storage
// @ID uploadVideo
// @Description Upload MP4 or WebM to Margin's configured storage without Cloudinary. JSON accepts standard base64 data (no data-URL prefix), contentType and optional title, up to 10 MiB decoded. Alternatively send raw video/mp4 or video/webm bytes up to 50 MiB, with optional title query parameter. The file signature must match contentType. This validates the container, not browser codec compatibility; no transcoding is performed. Store the returned canonical URL unchanged in a [Video src="URL" title="Description"] block or a post's cover, then updatePost with its current revision. Uploading alone does not change or publish a post. Unused and draft-only videos require authentication; a reference in published content, a published post cover, or a saved, visible homepage hero makes the video public. Delivery supports HEAD and HTTP byte ranges for seeking.
// @Tags Media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param title query string false "Optional title for binary uploads only (up to 200 characters)" maxLength(200)
// @Param input body APIUploadVideo true "Base64 video, or raw bytes with video Content-Type"
// @Success 201 {object} APIUploadedVideo
// @Failure 400 {object} APIError "Invalid JSON, base64, title or video type"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit uploads"
// @Failure 413 {object} APIError "Video exceeds 50 MiB binary or 10 MiB decoded JSON"
// @Router /api/media/videos [post]
func (a *App) uploadVideo(w http.ResponseWriter, r *http.Request) {
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		fail(400, "Use video/mp4, video/webm or application/json.")
	}
	var data []byte
	var title string
	if kind == "application/json" {
		data, kind, title = decodeVideoJSON(w, r)
	} else {
		kind = enumField(Row{"contentType": kind}, "contentType", "video/mp4", "video/webm")
		title = stringField(Row{"title": r.URL.Query().Get("title")}, "title", 0, 200, false)
		data, err = io.ReadAll(http.MaxBytesReader(w, r.Body, maxVideoBytes))
		if err != nil {
			fail(413, "Video exceeds 50 MiB.")
		}
	}
	if http.DetectContentType(data) != kind {
		fail(400, "Video bytes must match contentType (MP4 or WebM).")
	}
	send(w, 201, a.storeUploadedVideo(r.Context(), data, kind, title))
}

func decodeVideoJSON(w http.ResponseWriter, r *http.Request) ([]byte, string, string) {
	limit := base64.StdEncoding.EncodedLen(maxJSONVideoBytes)
	r = parseJSONRequestBody(w, r, int64(limit+2048))
	input := body(w, r)
	strict(input, "contentType", "data", "title")
	kind := enumField(input, "contentType", "video/mp4", "video/webm")
	title := ""
	if _, ok := input["title"]; ok {
		title = stringField(input, "title", 0, 200, false)
	}
	encoded := stringField(input, "data", 1, limit+2048, false)
	if len(encoded) > limit {
		fail(413, "Video exceeds the base64 size limit.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil {
		fail(400, "data: use standard base64 video bytes without a data-URL prefix.")
	}
	if len(data) > maxJSONVideoBytes {
		fail(413, "JSON video exceeds 10 MiB.")
	}
	return data, kind, title
}

func (a *App) storeUploadedVideo(ctx context.Context, data []byte, kind, title string) Row {
	id := uuid()
	key := "assets/videos/" + id
	must(a.Storage.Put(ctx, key, data))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(ctx), key)
		}
	}()
	a.DB.Must(ctx, "INSERT INTO uploaded_videos(id,object_key,content_type,title,size_bytes) VALUES($1,$2,$3,$4,$5)", id, key, kind, title, len(data))
	saved = true
	return Row{"url": "/api/public/videos/" + id, "id": id, "contentType": kind, "title": title, "sizeBytes": len(data)}
}

// @Summary List videos stored in Margin
// @ID listVideos
// @Description Returns reusable MP4 and WebM uploads, including private draft videos, newest first. No Cloudinary connection is needed. secure_url is canonical: store it unchanged in a [Video src="URL"] block. Apply Margin's mount path only when fetching the file. Cloudinary's separate library remains available at GET /api/media.
// @Tags Media
// @Security BearerAuth
// @Produce json
// @Success 200 {object} APIMediaLibrary
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Router /api/media/videos [get]
func (a *App) listVideos(w http.ResponseWriter, r *http.Request) {
	result := []Row{}
	for _, item := range a.DB.Must(r.Context(), "SELECT id,content_type,title,size_bytes,created_at FROM uploaded_videos ORDER BY created_at DESC,id") {
		result = append(result, Row{"public_id": item["id"], "secure_url": "/api/public/videos/" + item.str("id"), "resource_type": "video", "contentType": item["content_type"], "title": item["title"], "sizeBytes": item["size_bytes"], "createdAt": item["created_at"]})
	}
	send(w, 200, Row{"resources": result})
}

func (a *App) readVideo(w http.ResponseWriter, r *http.Request) {
	address := "/api/public/videos/" + r.PathValue("id")
	if !videoUploadRE.MatchString(address) {
		fail(404, "Video not found.")
	}
	authenticated := a.privateMediaAllowed(r, "content:read")
	a.checkVideoAccess(r.Context(), authenticated, address)
	row := first(a.DB.Must(r.Context(), "SELECT object_key,content_type FROM uploaded_videos WHERE id=$1", r.PathValue("id")))
	if row == nil {
		fail(404, "Video not found.")
	}
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.recheckPreviewMedia(r)
	// Publication can change while storage is loading the video.
	a.checkVideoAccess(r.Context(), authenticated, address)
	w.Header().Set("Content-Type", row.str("content_type"))
	w.Header().Set("Cache-Control", "no-store")
	if !authenticated {
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	}
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(data))
}
func (a *App) checkVideoAccess(ctx context.Context, authenticated bool, address string) {
	if !authenticated && !a.uploadInPublishedContent(ctx, address) && !a.uploadIsPublishedCover(ctx, address) && !publishedDesignVideo(a.settings(ctx), address) {
		fail(404, "Video not found.")
	}
}

func (a *App) uploadIsPublishedCover(ctx context.Context, address string) bool {
	return len(a.DB.Must(ctx, "SELECT id FROM posts WHERE status='published' AND cover=$1", address)) > 0
}
