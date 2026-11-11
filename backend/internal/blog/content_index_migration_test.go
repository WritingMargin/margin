package blog

import (
	"context"
	"strings"
	"testing"
)

func TestStartupMigrationRestoresMediaReferencesAndMarksEmptyPosts(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	image := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "With image", "slug": "with-image", "status": "published", "content": `![Image](` + image + `)`}, true), 201)
	responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Plain", "slug": "plain", "status": "published", "content": "Plain text"}, true), 201)
	a.DB.Must(ctx, "DELETE FROM post_media_references")
	a.DB.Must(ctx, "DELETE FROM post_media_indexed")
	articleReads := 0
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "posts/") {
			articleReads++
		}
	}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if articleReads != 2 || len(a.DB.Must(ctx, "SELECT post_id FROM post_media_indexed")) != 2 {
		t.Fatalf("migration did not cover image and zero-reference posts: reads=%d", articleReads)
	}
	if !a.publishedMediaReference(ctx, image) {
		t.Fatal("image reference was not indexed before requests")
	}
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "posts/") {
			t.Fatal("request or repeat migration reread indexed article")
		}
	}
	expectStatus(t, request(t, a, "GET", image, nil, false), 200)
	if a.uploadInPublishedContent(ctx, "/api/public/covers/"+uuid()) {
		t.Fatal("unrelated image became public")
	}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestStartupMigrationFailsClosedAndRetries(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	a.Storage = unavailablePublicStorage{storage}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatalf("empty workspace should start without S3: %v", err)
	}
	a.Storage = storage
	post := searchFixturePost(t, a, "Existing", "existing", "searchable body", "published")
	a.DB.Must(ctx, "DELETE FROM post_search_terms WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_search_documents WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_media_indexed WHERE post_id=$1", post["id"])
	a.Storage = unavailablePublicStorage{storage}
	if err := a.MigrateContentIndexes(ctx); err == nil {
		t.Fatal("startup accepted an incomplete index after S3 failed")
	}
	if len(a.DB.Must(ctx, "SELECT 1 FROM post_search_documents WHERE post_id=$1", post["id"])) != 0 {
		t.Fatal("failed migration wrote a search marker")
	}
	a.Storage = storage
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if len(searchResults(t, a, "/api/public/search?q=searchable", false)) != 1 {
		t.Fatal("retry did not restore search")
	}
}

func TestStartupMigrationSkipsChangedRevision(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	image := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Changing", "slug": "changing", "status": "published", "content": `![Image](` + image + `) old phrase`}, true), 201)
	a.DB.Must(ctx, "DELETE FROM post_media_references WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_media_indexed WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_search_terms WHERE post_id=$1", post["id"])
	a.DB.Must(ctx, "DELETE FROM post_search_documents WHERE post_id=$1", post["id"])
	var updated Row
	storage.onGet = func(key string) {
		if !strings.HasPrefix(key, "posts/") {
			return
		}
		storage.onGet = nil
		updated = responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "New phrase without image"}, true), 200)
	}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if updated == nil || a.publishedMediaReference(ctx, image) {
		t.Fatal("old revision restored public media")
	}
	if first(a.DB.Must(ctx, "SELECT revision FROM post_search_documents WHERE post_id=$1", post["id"])).str("revision") != updated.str("revision") {
		t.Fatal("old search revision replaced the current index")
	}
}

func TestPostgresStartupContentIndexMigration(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	seedPostgres(t, db)
	a, storage := postgresApp(t, db)
	ctx := context.Background()
	const address = "/api/public/covers/fixture-cover"
	db.Must(ctx, "INSERT INTO uploaded_covers(id,object_key,content_type) VALUES('fixture-cover','assets/covers/fixture-cover','image/png')")
	if err := storage.Put(ctx, "posts/article.md", []byte("Existing orbital text ![Image]("+address+")")); err != nil {
		t.Fatal(err)
	}
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if len(db.Must(ctx, "SELECT 1 FROM post_search_documents WHERE post_id=$1", postgresFixtureID)) != 1 || !a.publishedMediaReference(ctx, address) {
		t.Fatal("PostgreSQL content indexes were not migrated")
	}
	storage.onGet = func(string) { t.Fatal("repeat migration read S3") }
	if err := a.MigrateContentIndexes(ctx); err != nil {
		t.Fatal(err)
	}
}
