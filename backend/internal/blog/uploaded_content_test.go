package blog

import (
	"context"
	"strings"
	"testing"
)

func TestUploadedImageInArticleBody(t *testing.T) {
	app, storage, post := publicFixture(t)
	image := uploadSharingImage(t, app)
	path := "/api/posts/" + post.str("id")
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "draft", "content": `[Image src="` + image + `" width="small"]`}, true), 200)
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
	expectStatus(t, request(t, app, "GET", image, nil, true), 200)
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "published"}, true), 200)
	expectStatus(t, request(t, app, "GET", image, nil, false), 200)
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "content": "Image removed"}, true), 200)
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "content": `![Reused upload](` + image + `)`}, true), 200)
	expectStatus(t, request(t, app, "GET", image, nil, false), 200)
	storage.onGet = func(string) {
		app.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	}
	expectStatus(t, request(t, app, "GET", image, nil, false), 404)
}

func TestPublishedMediaLookupUsesCurrentSQLReferences(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	image := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	content := `![Image](` + image + `)`
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Media", "slug": "media", "status": "published", "content": content}, true), 201)
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "posts/") {
			t.Fatal("media access scanned article bodies in S3")
		}
	}
	expectStatus(t, request(t, a, "GET", image, nil, false), 200)
	storage.onGet = nil

	a.DB.Must(ctx, "DELETE FROM post_media_references WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_media_indexed WHERE post_id=$1", post["id"])
	if a.uploadInPublishedContent(ctx, image) {
		t.Fatal("media access ignored the missing SQL reference")
	}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if !a.uploadInPublishedContent(ctx, image) {
		t.Fatal("startup migration did not restore current published reference")
	}

	updated := responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "Image removed"}, true), 200)
	if updated.str("revision") == post.str("revision") {
		t.Fatal("revision did not change")
	}
	if err := a.migrateContentIndexRevision(ctx, post, content); err != nil {
		t.Fatal(err)
	}
	if a.uploadInPublishedContent(ctx, image) {
		t.Fatal("stale migration restored withdrawn media")
	}
}
