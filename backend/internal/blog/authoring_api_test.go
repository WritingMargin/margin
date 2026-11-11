package blog

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http/httptest"
	"strings"
	"testing"
)

func imageAPIInput() Row {
	data := append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, 24)...)
	return Row{"contentType": "image/png", "data": base64.StdEncoding.EncodeToString(data)}
}

func TestTokenAuthoringUploadSEOAndPublish(t *testing.T) {
	app, _ := coreFixture(t)
	writer, publisher := roleToken(t, app, "writer"), roleToken(t, app, "publisher")
	item := responseRow(t, tokenRequest(app, writer, "POST", "/api/posts", draftInput("mcp-image-story")), 201)
	path := "/api/posts/" + item.str("id")
	upload := responseRow(t, tokenRequest(app, writer, "POST", "/api/media/images", imageAPIInput()), 201)
	address := upload.str("url")
	if !coverRE.MatchString(address) {
		t.Fatal("invalid upload URL", upload)
	}
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, writer, "GET", address, nil), 200)
	content := item.str("content") + "\n\n![Architecture diagram](" + address + ")"
	before := item["revision"]
	seo := Row{"title": "A searchable story", "description": "Description for discovery", "image": address, "noindex": false}
	item = responseRow(t, tokenRequest(app, writer, "PUT", path, Row{"revision": before, "content": content, "seo": seo, "cover": address}), 200)
	if item.str("content") != content || item.str("cover") != address || encode(item["seo"]) != encode(seo) {
		t.Fatal("content or SEO not saved", item)
	}
	expectStatus(t, request(t, app, "GET", address, nil, false), 404)
	expectStatus(t, tokenRequest(app, writer, "PUT", path, Row{"revision": before, "content": "Stale overwrite"}), 409)
	expectStatus(t, tokenRequest(app, writer, "PUT", path, Row{"seo": seo}), 428)
	item = responseRow(t, tokenRequest(app, publisher, "PUT", path, Row{"revision": item["revision"], "status": "published"}), 200)
	expectStatus(t, tokenRequest(app, writer, "PUT", path, Row{"revision": item["revision"], "seo": seo}), 403)
	seo["title"] = "Updated search title"
	item = responseRow(t, tokenRequest(app, publisher, "PUT", path, Row{"revision": item["revision"], "seo": seo}), 200)
	if item.str("content") != content {
		t.Fatal("SEO-only update replaced article")
	}
	containsHTML(t, request(t, app, "GET", "/post/mcp-image-story", nil, false).Body.String(), "Updated search title", address, "Architecture diagram")
	expectStatus(t, request(t, app, "GET", address, nil, false), 200)
}

func TestAuthoringImageAndSEOAPIRoles(t *testing.T) {
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		key := roleToken(t, app, role)
		status := 201
		if role == "reader" {
			status = 403
		}
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/images", imageAPIInput()), status)
		raw, _ := base64.StdEncoding.DecodeString(imageAPIInput().str("data"))
		r := httptest.NewRequest("POST", "http://blog.test/api/media/covers", bytes.NewReader(raw))
		r.Header.Set("Content-Type", "image/png")
		r.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		expectStatus(t, w, status)
		seoStatus := 403
		if role == "owner" {
			seoStatus = 200
		}
		expectStatus(t, tokenRequest(app, key, "GET", "/api/settings/seo", nil), seoStatus)
		expectStatus(t, tokenRequest(app, key, "PUT", "/api/settings/seo", defaultSEO()), seoStatus)
	}
	expectStatus(t, request(t, app, "POST", "/api/media/images", imageAPIInput(), false), 401)
	expectStatus(t, request(t, app, "GET", "/api/settings/seo", nil, false), 401)
}

func TestImageAPIValidationLimitsAndMount(t *testing.T) {
	app, _ := coreFixture(t)
	key := roleToken(t, app, "writer")
	for _, input := range []any{nil, []any{}, Row{}, Row{"contentType": "image/svg+xml", "data": "PHN2Zz4="}, Row{"contentType": "image/png", "data": "not base64"}, Row{"contentType": "image/png", "data": "data:image/png;base64,abcd"}, Row{"contentType": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("not an image"))}, Row{"contentType": "image/jpeg", "data": imageAPIInput()["data"]}, Row{"contentType": "image/png", "data": imageAPIInput()["data"], "url": "https://example.test/image.png"}} {
		expectStatus(t, tokenRequest(app, key, "POST", "/api/media/images", input), 400)
	}
	large := imageAPIInput()
	large["data"] = base64.StdEncoding.EncodeToString(make([]byte, maxArticleImageBytes+1))
	expectStatus(t, tokenRequest(app, key, "POST", "/api/media/images", large), 413)
	if len(app.DB.Must(context.Background(), "SELECT id FROM uploaded_covers")) != 0 {
		t.Fatal("invalid upload created a record")
	}
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	upload := responseRow(t, tokenRequest(app, key, "POST", "/blog/api/media/images", imageAPIInput()), 201)
	expectStatus(t, tokenRequest(app, key, "GET", "/blog"+upload.str("url"), nil), 200)
}

func TestLargeJSONUploadIsAuthorizedBeforeDecoding(t *testing.T) {
	app, _ := coreFixture(t)
	reader := roleToken(t, app, "reader")
	for _, key := range []string{"", reader} {
		r := httptest.NewRequest("POST", "http://blog.test/api/media/images", strings.NewReader("{broken JSON"))
		r.Header.Set("Content-Type", "application/json")
		if key != "" {
			r.Header.Set("Authorization", "Bearer "+key)
		}
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		want := 401
		if key != "" {
			want = 403
		}
		expectStatus(t, w, want)
	}
}

func TestImageAPIAllowsLargeFilesWithoutChangingOtherJSONLimits(t *testing.T) {
	app, _ := coreFixture(t)
	key := roleToken(t, app, "writer")
	data := append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, 4<<20)...)
	input := Row{"contentType": "image/png", "data": base64.StdEncoding.EncodeToString(data)}
	upload := responseRow(t, tokenRequest(app, key, "POST", "/api/media/images", input), 201)
	image := tokenRequest(app, key, "GET", upload.str("url"), nil)
	expectStatus(t, image, 200)
	if !bytes.Equal(image.Body.Bytes(), data) {
		t.Fatal("uploaded bytes changed")
	}
	expectStatus(t, tokenRequest(app, key, "POST", "/api/posts", Row{"content": strings.Repeat("a", 4<<20)}), 413)
	input["data"] = strings.Repeat("A", base64.StdEncoding.EncodedLen(maxArticleImageBytes)+2048)
	expectStatus(t, tokenRequest(app, key, "POST", "/api/media/images", input), 413)
}
