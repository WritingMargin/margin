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

const maxAudioBytes = 50 << 20
const maxJSONAudioBytes = 10 << 20

var audioUploadRE = regexp.MustCompile(`^/api/public/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func (a *App) audioRoutes() {
	a.mux.HandleFunc("GET /api/media/audio", a.listAudio)
	a.mux.HandleFunc("POST /api/media/audio", a.uploadAudio)
	a.mux.HandleFunc("GET /api/public/audio/{id}", a.readAudio)
}

// @Summary Upload audio to Margin storage
// @ID uploadAudio
// @Description Upload MP3, M4A, WAV, Ogg or FLAC to Margin's configured storage without Cloudinary. JSON accepts standard base64 data (no data-URL prefix), contentType and optional title, up to 10 MiB decoded. Alternatively send raw audio/mpeg, audio/mp4, audio/wav, audio/ogg or audio/flac bytes up to 50 MiB, with optional title query parameter. The file signature must match contentType. This validates the container, not browser codec compatibility; no transcoding is performed. Store the returned canonical URL unchanged in a [Audio src="URL" title="Description"] block or the post cover, then updatePost with its current revision. Uploading alone does not change or publish a post. Unused and draft-only recordings require authentication; a reference in published content makes the audio public. Delivery supports HEAD and HTTP byte ranges for seeking.
// @Tags Media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param title query string false "Optional title for binary uploads only (up to 200 characters)" maxLength(200)
// @Param input body APIUploadAudio true "Base64 audio, or raw bytes with audio Content-Type"
// @Success 201 {object} APIUploadedAudio
// @Failure 400 {object} APIError "Invalid JSON, base64, title or audio type"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit uploads"
// @Failure 413 {object} APIError "Audio exceeds 50 MiB binary or 10 MiB decoded JSON"
// @Router /api/media/audio [post]
func (a *App) uploadAudio(w http.ResponseWriter, r *http.Request) {
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		fail(400, "Use audio/mpeg, audio/mp4, audio/wav, audio/ogg, audio/flac or application/json.")
	}
	var data []byte
	var title string
	if kind == "application/json" {
		data, kind, title = decodeAudioJSON(w, r)
	} else {
		kind = enumField(Row{"contentType": kind}, "contentType", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/flac")
		title = stringField(Row{"title": r.URL.Query().Get("title")}, "title", 0, 200, false)
		data, err = io.ReadAll(http.MaxBytesReader(w, r.Body, maxAudioBytes))
		if err != nil {
			fail(413, "Audio exceeds 50 MiB.")
		}
	}
	if !matchesAudioType(data, kind) {
		fail(400, "Audio bytes must match contentType (MP3, M4A, WAV, Ogg or FLAC).")
	}
	send(w, 201, a.storeUploadedAudio(r.Context(), data, kind, title))
}

func decodeAudioJSON(w http.ResponseWriter, r *http.Request) ([]byte, string, string) {
	limit := base64.StdEncoding.EncodedLen(maxJSONAudioBytes)
	r = parseJSONRequestBody(w, r, int64(limit+2048))
	input := body(w, r)
	strict(input, "contentType", "data", "title")
	kind := enumField(input, "contentType", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/flac")
	title := ""
	if _, ok := input["title"]; ok {
		title = stringField(input, "title", 0, 200, false)
	}
	encoded := stringField(input, "data", 1, limit+2048, false)
	if len(encoded) > limit {
		fail(413, "Audio exceeds the base64 size limit.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil {
		fail(400, "data: use standard base64 audio bytes without a data-URL prefix.")
	}
	if len(data) > maxJSONAudioBytes {
		fail(413, "JSON audio exceeds 10 MiB.")
	}
	return data, kind, title
}

func (a *App) storeUploadedAudio(ctx context.Context, data []byte, kind, title string) Row {
	id := uuid()
	key := "assets/audio/" + id
	must(a.Storage.Put(ctx, key, data))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(ctx), key)
		}
	}()
	a.DB.Must(ctx, "INSERT INTO uploaded_audio(id,object_key,content_type,title,size_bytes) VALUES($1,$2,$3,$4,$5)", id, key, kind, title, len(data))
	saved = true
	return Row{"url": "/api/public/audio/" + id, "id": id, "contentType": kind, "title": title, "sizeBytes": len(data)}
}

// @Summary List recordings stored in Margin
// @ID listAudio
// @Description Returns reusable MP3, M4A, WAV, Ogg and FLAC uploads, including private draft recordings, newest first. No Cloudinary connection is needed. secure_url is canonical: store it unchanged in a [Audio src="URL"] block. Apply Margin's mount path only when fetching the file. Cloudinary's separate library remains available at GET /api/media.
// @Tags Media
// @Security BearerAuth
// @Produce json
// @Success 200 {object} APIMediaLibrary
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Router /api/media/audio [get]
func (a *App) listAudio(w http.ResponseWriter, r *http.Request) {
	result := []Row{}
	for _, item := range a.DB.Must(r.Context(), "SELECT id,content_type,title,size_bytes,created_at FROM uploaded_audio ORDER BY created_at DESC,id") {
		result = append(result, Row{"public_id": item["id"], "secure_url": "/api/public/audio/" + item.str("id"), "resource_type": "audio", "contentType": item["content_type"], "title": item["title"], "sizeBytes": item["size_bytes"], "createdAt": item["created_at"]})
	}
	send(w, 200, Row{"resources": result})
}

func (a *App) readAudio(w http.ResponseWriter, r *http.Request) {
	address := "/api/public/audio/" + r.PathValue("id")
	if !audioUploadRE.MatchString(address) {
		fail(404, "Audio not found.")
	}
	authenticated := a.privateMediaAllowed(r, "content:read")
	a.checkAudioAccess(r.Context(), authenticated, address)
	row := first(a.DB.Must(r.Context(), "SELECT object_key,content_type FROM uploaded_audio WHERE id=$1", r.PathValue("id")))
	if row == nil {
		fail(404, "Audio not found.")
	}
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.recheckPreviewMedia(r)
	// Publication can change while storage is loading the audio.
	a.checkAudioAccess(r.Context(), authenticated, address)
	w.Header().Set("Content-Type", row.str("content_type"))
	w.Header().Set("Cache-Control", "no-store")
	if !authenticated {
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	}
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(data))
}
func (a *App) checkAudioAccess(ctx context.Context, authenticated bool, address string) {
	if !authenticated && !a.audioPublished(ctx, address) {
		fail(404, "Audio not found.")
	}
}

func (a *App) audioPublished(ctx context.Context, address string) bool {
	if len(a.DB.Must(ctx, "SELECT id FROM posts WHERE cover=$1 AND status='published' LIMIT 1", address)) > 0 {
		return true
	}
	return a.uploadInPublishedContent(ctx, address)
}

// Validate signatures/containers; codec decoding and transcoding are not performed.
func matchesAudioType(data []byte, kind string) bool {
	switch kind {
	case "audio/mpeg":
		return matchesMP3(data)
	case "audio/mp4":
		return matchesM4A(data)
	case "audio/wav":
		return http.DetectContentType(data) == "audio/wave"
	case "audio/ogg":
		return bytes.HasPrefix(data, []byte("OggS"))
	case "audio/flac":
		return bytes.HasPrefix(data, []byte("fLaC"))
	}
	return false
}

func matchesMP3(data []byte) bool {
	return len(data) >= 3 && (string(data[:3]) == "ID3" || (data[0] == 0xff && data[1]&0xe0 == 0xe0 && data[1]&0x06 != 0 && data[2]&0xf0 != 0xf0 && data[2]&0x0c != 0x0c))
}
func matchesM4A(data []byte) bool {
	return len(data) >= 12 && string(data[4:8]) == "ftyp" && (string(data[8:12]) == "M4A " || string(data[8:12]) == "M4B ")
}
