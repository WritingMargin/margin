package blog

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestLinkPreviewMetadataAndLimits(t *testing.T) {
	base, _ := url.Parse("https://example.com/articles/story")
	content := `<html><head><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta name="description" content="Fallback description"><meta property="og:description" content="A useful preview"><meta property="og:image" content="/cover.jpg"><script>alert(1)</script></head><body>private body</body></html>`
	preview := parseLinkPreview([]byte(content), base)
	if preview.str("title") != "A & B" || preview.str("description") != "A useful preview" || preview.str("image") != "https://example.com/cover.jpg" {
		t.Fatal(preview)
	}
	responseType := "text/html"
	client := &http.Client{Transport: testTransport(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {responseType}}, Body: io.NopCloser(strings.NewReader(content)), Request: req}, nil
	})}
	result, err := fetchLinkPreview(context.Background(), client, base.String())
	if err != nil || result.str("url") != base.String() {
		t.Fatal(result, err)
	}
	responseType = "application/json"
	if _, err = fetchLinkPreview(context.Background(), client, base.String()); err == nil {
		t.Fatal("accepted non-HTML")
	}
	responseType = "text/html"
	content = strings.Repeat("x", (1<<20)+1)
	if _, err = fetchLinkPreview(context.Background(), client, base.String()); err == nil {
		t.Fatal("accepted oversized metadata")
	}
}
func TestLinkPreviewPrivateTargetsAndRedirects(t *testing.T) {
	client := previewHTTPClient()
	defer client.CloseIdleConnections()
	for _, raw := range []string{"http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/", "http://10.0.0.1/", "https://localhost/", "https://foo.localhost/", "https://user:pass@example.com/", "https://example.com:9000/", "file:///etc/passwd", "ftp://example.com/a"} {
		if validLinkPreviewURL(raw) {
			t.Fatal("accepted private or unsafe URL", raw)
		}
		u, _ := url.Parse(raw)
		if client.CheckRedirect(&http.Request{URL: u}, nil) == nil {
			t.Fatal("accepted redirect", raw)
		}
	}
	if _, err := dialPWALogo(context.Background(), "tcp", "127.0.0.1:80"); err == nil {
		t.Fatal("dial allowed loopback")
	}
	u, _ := url.Parse("https://example.com/")
	if client.CheckRedirect(&http.Request{URL: u}, make([]*http.Request, 4)) == nil {
		t.Fatal("unbounded redirects")
	}
	app, _ := coreFixture(t)
	expectStatus(t, request(t, app, "POST", "/api/media/preview", Row{"url": "http://127.0.0.1/"}, false), 401)
	expectStatus(t, request(t, app, "POST", "/api/media/preview", Row{"url": "http://127.0.0.1/"}, true), 400)
}
func TestLinkCardsRenderWithoutExecutingMetadata(t *testing.T) {
	source := `[Link url="https://example.com/story" title="A & B" description="An article preview" image="https://example.com/image.jpg" mode="preview"]`
	html := renderMarkdown(source, "https://blog.test/post/links", true)
	containsHTML(t, html, `class="link-preview-card"`, `href="https://example.com/story"`, `src="https://example.com/image.jpg"`, "A &amp; B", "An article preview")
	plain := renderMarkdown(`[Link url="https://example.com" title="Example" mode="link"]`, "https://blog.test/post/links", true)
	if strings.Contains(plain, "link-preview-card") {
		t.Fatal(plain)
	}
	unsafe := renderMarkdown(`[Link url="javascript:alert(1)" image="data:image/png,bad" title="<script>bad</script>"]`, "https://blog.test/post/links", true)
	if strings.Contains(unsafe, "javascript:") || strings.Contains(unsafe, "<script>") {
		t.Fatal(unsafe)
	}
	containsHTML(t, rssMarkdown(source, "https://blog.test/post/links"), "An article preview", "https://example.com/story")
}
func TestSoundCloudCoverModeAndDraftPersistence(t *testing.T) {
	app, _ := coreFixture(t)
	input := draftInput("soundcloud-story")
	input["cover"] = "https://soundcloud.com/forss/flickermood"
	input["coverMode"] = "preview"
	post := responseRow(t, request(t, app, "POST", "/api/posts", input, true), 201)
	path := "/api/posts/" + post.str("id")
	if post.str("coverMode") != "preview" {
		t.Fatal(post)
	}
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "published"}, true), 200)
	page := request(t, app, "GET", "/post/soundcloud-story", nil, false)
	containsHTML(t, page.Body.String(), "w.soundcloud.com/player/", "visual=true", "show_artwork=true", `height="450"`)
	containsHTML(t, page.Header().Get("Content-Security-Policy"), "https://w.soundcloud.com")
	draft := responseRow(t, request(t, app, "PUT", path+"/draft", Row{"revision": post["revision"], "coverMode": "player"}, true), 200)
	if draft.str("coverMode") != "player" {
		t.Fatal(draft)
	}
	containsHTML(t, request(t, app, "GET", "/post/soundcloud-story", nil, false).Body.String(), "visual=true")
	saved := responseRow(t, request(t, app, "POST", path+"/draft/publish", Row{"revision": draft["revision"]}, true), 200)
	if saved.str("coverMode") != "player" {
		t.Fatal(saved)
	}
	containsHTML(t, request(t, app, "GET", "/post/soundcloud-story", nil, false).Body.String(), "visual=false", `height="166"`)
	expectStatus(t, request(t, app, "PUT", path, Row{"revision": saved["revision"], "coverMode": "arbitrary"}, true), 400)
}
