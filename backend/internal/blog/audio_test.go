package blog

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http/httptest"
	"strings"
	"testing"
)

func audioFixture() []byte { return append([]byte("ID3"), make([]byte, 21)...) }
func audioAPIInput() Row {
	return Row{"contentType": "audio/mpeg", "data": base64.StdEncoding.EncodeToString(audioFixture()), "title": "Episode one"}
}
func TestAudioUploadPrivacyCoverAndRanges(t *testing.T) {
	app, storage := coreFixture(t)
	key := roleToken(t, app, "publisher")
	uploaded := responseRow(t, tokenRequest(app, key, "POST", "/api/media/audio", audioAPIInput()), 201)
	address := uploaded.str("url")
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, key, "GET", address, nil), 200)
	input := draftInput("voice-story")
	input["cover"] = address
	input["content"] = "Text accompanying the recording."
	post := responseRow(t, tokenRequest(app, key, "POST", "/api/posts", input), 201)
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	postPath := "/api/posts/" + post.str("id")
	post = responseRow(t, tokenRequest(app, key, "PUT", postPath, Row{"revision": post["revision"], "status": "published"}), 200)
	r := httptest.NewRequest("GET", "http://blog.test"+address, nil)
	r.Header.Set("Range", "bytes=3-7")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	expectStatus(t, w, 206)
	if w.Body.Len() != 5 || w.Header().Get("Content-Type") != "audio/mpeg" {
		t.Fatal(w.Body.Len(), w.Header())
	}
	expectStatus(t, request(t, app, "HEAD", address, nil, false), 200)
	page := request(t, app, "GET", "/post/voice-story", nil, false)
	containsHTML(t, page.Body.String(), "<audio", address, "Text accompanying the recording.")
	if strings.Contains(page.Body.String(), `<img class="article-cover"`) {
		t.Fatal("audio rendered as an image")
	}
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), "Listen &amp; read")
	containsHTML(t, request(t, app, "GET", "/post/voice-story/print", nil, false).Body.String(), address)
	// Moving the recording from the cover into the body preserves public access.
	post = responseRow(t, tokenRequest(app, key, "PUT", postPath, Row{"revision": post["revision"], "cover": "", "content": "Before.\n\n[Audio src=\"" + address + "\"]\n\nAfter."}), 200)
	expectStatus(t, request(t, app, "GET", address, nil, false), 200)
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "assets/audio/") {
			app.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
		}
	}
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	storage.onGet = nil
	expectStatus(t, request(t, app, "HEAD", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, key, "GET", address, nil), 200)
}
func TestAudioUploadRolesAndValidation(t *testing.T) {
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		key := roleToken(t, app, role)
		status := 201
		if role == "reader" {
			status = 403
		}
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/audio", audioAPIInput()), status)
		expectStatus(t, tokenRequest(app, key, "GET", "/api/media/audio", nil), 200)
	}
	expectStatus(t, request(t, app, "GET", "/api/media/audio", nil, false), 401)
	key := roleToken(t, app, "writer")
	for _, input := range []Row{{"contentType": "audio/mpeg", "data": "bad"}, {"contentType": "audio/mpeg", "data": base64.StdEncoding.EncodeToString([]byte("<script>bad</script>"))}, {"contentType": "audio/wav", "data": audioAPIInput()["data"]}, {"contentType": "text/html", "data": audioAPIInput()["data"]}} {
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/audio", input), 400)
	}
	r := httptest.NewRequest("POST", "http://blog.test/api/media/audio", bytes.NewReader(audioFixture()))
	r.Header.Set("Content-Type", "audio/mpeg")
	r.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	expectStatus(t, w, 201)
}
func TestAudioRenderingAndMetadata(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	spotify := "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5?autoplay=1"
	source := resolveAudio(spotify)
	if source == nil || !source.spotify || source.height != 152 || strings.Contains(source.src, "autoplay") {
		t.Fatal(source)
	}
	content := "Before.\n\n[Spotify src=\"" + spotify + "\" caption=\"Transcript below\"]\n\nAfter."
	html := renderMarkdown(content, "https://blog.test/blog/post/voice", true)
	containsHTML(t, html, `<iframe src="https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5"`, "Before.", "After.", "Transcript below")
	feed := rssMarkdown(content, "https://blog.test/blog/post/voice")
	containsHTML(t, feed, `href="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5"`)
	if strings.Contains(feed, "<iframe") {
		t.Fatal(feed)
	}
	if postShareImage(Row{"cover": spotify}, Row{"image": "https://blog.test/share.png"}) != "https://blog.test/share.png" {
		t.Fatal("audio used as share image")
	}
	local := "/api/public/audio/12345678-1234-1234-1234-123456789abc"
	containsHTML(t, renderMarkdown(`[Audio src="`+local+`"]`, "https://blog.test/blog/post/voice", true), `src="https://blog.test/blog`+local+`"`)
	for _, raw := range []string{"javascript:alert(1)", "//example.test/a.mp3", "https://user:pass@example.test/a.mp3", "https://open.spotify.com.evil.test/episode/7makk4oTQel546B0PZlDM5", "https://open.spotify.com:9000/episode/7makk4oTQel546B0PZlDM5", local + "?secret=1", "https://open.spotify.com/episode/bad"} {
		if resolveAudio(raw) != nil {
			t.Fatal("accepted unsafe audio", raw)
		}
	}
}
