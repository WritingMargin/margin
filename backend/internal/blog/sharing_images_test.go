package blog

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"
)

func uploadSharingImage(t *testing.T, app *App) string {
	t.Helper()
	png := append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, 24)...)
	return responseRow(t, uploadRequest(t, app, "/api/media/covers", "image/png", png), 201).str("url")
}

func TestUploadedPostSharingImagePublication(t *testing.T) {
	app, storage, post := publicFixture(t)
	image := uploadSharingImage(t, app)
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
	expectStatus(t, request(t, app, "GET", image, nil, true), 200)
	seo := defaultPostSEO()
	seo["image"] = image
	path := "/api/posts/" + post.str("id")
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "seo": seo, "status": "draft"}, true), 200)
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "published"}, true), 200)
	expectStatus(t, request(t, app, "PUT", "/api/settings/domain", Row{"url": "https://journal.example.com"}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="https://journal.example.com`+image+`"`, `name="twitter:image" content="https://journal.example.com`+image+`"`)
	public := request(t, app, "GET", image, nil, false)
	expectStatus(t, public, 200)
	if public.Header().Get("Content-Type") != "image/png" || !bytes.HasPrefix(public.Body.Bytes(), []byte{137, 80, 78, 71}) {
		t.Fatal("sharing image bytes were not served")
	}
	storage.onGet = func(string) {
		app.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	}
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
}

func TestUploadedDefaultSharingImagePublication(t *testing.T) {
	app, storage, _ := publicFixture(t)
	image := uploadSharingImage(t, app)
	seo := defaultSEO()
	seo["image"] = image
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 200)
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `property="og:image" content="http://blog.test`+image+`"`)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="http://blog.test`+image+`"`)
	expectStatus(t, request(t, app, "GET", image, nil, false), 200)
	storage.onGet = func(string) { app.saveSiteSetting(context.Background(), "seo", defaultSEO()) }
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
	for _, invalid := range []string{"/api/private/image", "//example.com/image.png", image + "?x=1"} {
		seo["image"] = invalid
		expectStatus(t, request(t, app, "PUT", "/api/settings/seo", seo, true), 400)
	}
}

func TestSharingImageLibrary(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("CLOUDINARY_CLOUD_NAME", "")
	image := uploadSharingImage(t, app)
	expectStatus(t, request(t, app, "GET", "/api/media/images", nil, false), 401)
	library := responseRow(t, request(t, app, "GET", "/api/media/images", nil, true), 200)
	if !strings.Contains(encode(library), image) {
		t.Fatal(library)
	}
	t.Setenv("CLOUDINARY_CLOUD_NAME", "test")
	t.Setenv("CLOUDINARY_API_KEY", "key")
	t.Setenv("CLOUDINARY_API_SECRET", "secret")
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "central.example" {
			account := paidAccount()
			object(account["entitlements"])["planId"] = "studio"
			return fixtureResponse(account), nil
		}
		if r.URL.Path != "/v1_1/test/resources/image/upload" {
			t.Fatalf("unexpected request: %s", r.URL)
		}
		return fixtureResponse(Row{"resources": []Row{{"public_id": "library-image", "secure_url": "https://images.example.test/image.png", "resource_type": "image"}}}), nil
	})
	library = responseRow(t, request(t, app, "GET", "/api/media/images?source=cloudinary", nil, true), 200)
	if !strings.Contains(encode(library), image) || !strings.Contains(encode(library), "library-image") {
		t.Fatal(library)
	}
}
