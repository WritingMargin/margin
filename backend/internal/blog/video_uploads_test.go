package blog

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http/httptest"
	"strings"
	"testing"
)

func videoFixtureBytes(kind string) []byte {
	if kind == "video/webm" {
		return append([]byte{0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84}, []byte("webm")...)
	}
	return []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0, 0, 0, 0, 'm', 'p', '4', '2', 'i', 's', 'o', 'm'}
}
func rawVideoRequest(app *App, key, kind string, data []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "http://blog.test/api/media/videos?title=Demo", bytes.NewReader(data))
	r.Header.Set("Content-Type", kind)
	if key != "" {
		r.Header.Set("Authorization", "Bearer "+key)
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	return w
}
func videoAPIInput(kind string) Row {
	return Row{"contentType": kind, "data": base64.StdEncoding.EncodeToString(videoFixtureBytes(kind)), "title": "Demo"}
}

func TestVideoUploadRolesAndLibrary(t *testing.T) {
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		testVideoRole(t, app, role)
	}
	resources := responseRow(t, request(t, app, "GET", "/api/media/videos", nil, true), 200)["resources"].([]any)
	if len(resources) != 12 {
		t.Fatal("missing video uploads", len(resources))
	}
	entry := object(resources[0])
	if entry.str("title") != "Demo" || entry.str("resource_type") != "video" || !videoUploadRE.MatchString(entry.str("secure_url")) || entry["sizeBytes"] == nil || entry["createdAt"] == nil {
		t.Fatal(entry)
	}
	expectStatus(t, request(t, app, "GET", "/api/media/videos", nil, false), 401)
	expectStatus(t, request(t, app, "GET", "/api/media/images", nil, false), 401)
	expectStatus(t, rawVideoRequest(app, "", "video/mp4", videoFixtureBytes("video/mp4")), 401)
	upload := responseRow(t, request(t, app, "POST", "/api/media/images", imageAPIInput(), true), 201)
	library := responseRow(t, tokenRequest(app, roleToken(t, app, "reader"), "GET", "/api/media/images?source=uploads", nil), 200)
	if !strings.Contains(encode(library), upload.str("url")) {
		t.Fatal("reader could not discover image")
	}
	expectStatus(t, request(t, app, "GET", "/api/media/images?source=invalid", nil, true), 400)
}

func testVideoRole(t *testing.T, app *App, role string) {
	t.Helper()
	key := roleToken(t, app, role)
	status := 201
	if role == "reader" {
		status = 403
	}
	for _, kind := range []string{"video/mp4", "video/webm"} {
		expectStatus(t, rawVideoRequest(app, key, kind, videoFixtureBytes(kind)), status)
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/videos", videoAPIInput(kind)), status)
	}
	expectStatus(t, tokenRequest(app, key, "GET", "/api/media/videos", nil), 200)
	expectStatus(t, tokenRequest(app, key, "GET", "/api/media/images", nil), 200)
}

func TestVideoPrivacyRangeAndUnpublish(t *testing.T) {
	app, storage := coreFixture(t)
	key := roleToken(t, app, "publisher")
	uploaded := responseRow(t, tokenRequest(app, key, "POST", "/api/media/videos", videoAPIInput("video/mp4")), 201)
	address := uploaded.str("url")
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, key, "GET", address, nil), 200)
	input := draftInput("video-story")
	input["content"] = `[Video src="` + address + `" title="Demo"]`
	post := responseRow(t, tokenRequest(app, key, "POST", "/api/posts", input), 201)
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	path := "/api/posts/" + post.str("id")
	post = responseRow(t, tokenRequest(app, key, "PUT", path, Row{"revision": post["revision"], "status": "published"}), 200)
	for _, item := range []struct {
		method, span   string
		status, length int
	}{
		{"GET", "", 200, 24}, {"HEAD", "", 200, 0}, {"GET", "bytes=0-7", 206, 8}, {"GET", "bytes=8-", 206, 16}, {"GET", "bytes=-4", 206, 4}, {"GET", "bytes=100-200", 416, -1},
	} {
		r := httptest.NewRequest(item.method, "http://blog.test"+address, nil)
		r.Header.Set("Range", item.span)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		expectStatus(t, w, item.status)
		if item.length >= 0 && w.Body.Len() != item.length {
			t.Fatalf("wrong range length %s: %d", item.span, w.Body.Len())
		}
		if item.status == 206 && (w.Header().Get("Content-Range") == "" || w.Header().Get("Accept-Ranges") != "bytes" || w.Header().Get("Content-Type") != "video/mp4") {
			t.Fatal("missing range headers", w.Header())
		}
	}
	containsHTML(t, request(t, app, "GET", "/post/video-story", nil, false).Body.String(), "<video", address)
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "assets/videos/") {
			app.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
		}
	}
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	storage.onGet = nil
	expectStatus(t, request(t, app, "HEAD", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, key, "GET", address, nil), 200)
}

func TestVideoValidationAndMount(t *testing.T) {
	app, _ := coreFixture(t)
	key := roleToken(t, app, "writer")
	for _, input := range []any{nil, Row{}, Row{"contentType": "video/mp4", "data": "bad"}, Row{"contentType": "video/webm", "data": videoAPIInput("video/mp4")["data"]}, Row{"contentType": "video/mp4", "data": videoAPIInput("video/mp4")["data"], "title": strings.Repeat("x", 201)}, Row{"contentType": "video/mp4", "data": "AAAA", "remoteUrl": "https://example.test"}} {
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/videos", input), 400)
	}
	expectStatus(t, rawVideoRequest(app, key, "video/mp4", []byte("<script>alert(1)</script>")), 400)
	expectStatus(t, rawVideoRequest(app, key, "image/png", videoFixtureBytes("video/mp4")), 400)
	expectStatus(t, rawVideoRequest(app, key, "video/mp4", make([]byte, maxVideoBytes+1)), 413)
	large := videoAPIInput("video/mp4")
	large["data"] = base64.StdEncoding.EncodeToString(make([]byte, maxJSONVideoBytes+1))
	expectStatus(t, tokenRequest(app, key, "POST", "/api/media/videos", large), 413)
	if len(app.DB.Must(context.Background(), "SELECT id FROM uploaded_videos")) != 0 {
		t.Fatal("invalid video was stored")
	}
	// Base64 videos above the normal JSON API limit still work after authorization.
	data := append(videoFixtureBytes("video/mp4"), make([]byte, 4<<20)...)
	large["data"] = base64.StdEncoding.EncodeToString(data)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	uploaded := responseRow(t, tokenRequest(app, key, "POST", "/blog/api/media/videos", large), 201)
	w := tokenRequest(app, key, "GET", "/blog"+uploaded.str("url"), nil)
	expectStatus(t, w, 200)
	if !bytes.Equal(w.Body.Bytes(), data) {
		t.Fatal("video bytes changed")
	}
	html := rssMarkdown(`[Video src="`+uploaded.str("url")+`"]`, "https://example.test/blog/post/video")
	containsHTML(t, html, "https://example.test/blog"+uploaded.str("url"))
}

func TestVideoUploadAuthorizesBeforeReadingJSON(t *testing.T) {
	app, _ := coreFixture(t)
	for _, key := range []string{"", roleToken(t, app, "reader")} {
		status := 401
		if key != "" {
			status = 403
		}
		expectStatus(t, rawVideoRequest(app, key, "application/json", []byte("{broken")), status)
	}
}
