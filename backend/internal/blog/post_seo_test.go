package blog

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestPostSEOOverridesMetadataWithoutChangingArticle(t *testing.T) {
	app, _, _ := publicFixture(t)
	seo := Row{"title": "A separate search title", "description": "A description just for search.", "image": "https://images.example.test/post-og.png"}
	item := responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "The visible heading", "slug": "separate-seo", "excerpt": "Visible introduction", "content": "Visible article body.", "status": "published", "cover": "https://images.example.test/cover.png", "seo": seo}, true), 201)
	if encode(item["seo"]) != encode(seo) {
		t.Fatal(item)
	}
	page := request(t, app, "GET", "/post/separate-seo", nil, false)
	containsHTML(t, page.Body.String(), `<title>A separate search title</title>`, `name="description" content="A description just for search."`, `property="og:title" content="A separate search title"`, `property="og:description" content="A description just for search."`, `property="og:image" content="https://images.example.test/post-og.png"`, `name="twitter:image" content="https://images.example.test/post-og.png"`, `<h1>The visible heading</h1>`, "Visible introduction", "Visible article body.")
	containsHTML(t, request(t, app, "GET", "/read/separate-seo", nil, false).Body.String(), `<title>A separate search title</title>`, `<h1>The visible heading</h1>`)
	containsHTML(t, request(t, app, "GET", "/rss.xml", nil, false).Body.String(), `<title>The visible heading</title>`, `<description>Visible introduction</description>`)
	read := responseRow(t, request(t, app, "GET", "/api/posts/"+item.str("id"), nil, true), 200)
	if encode(read["seo"]) != encode(seo) {
		t.Fatal("SEO was not persisted")
	}
	// A normal content-only edit (including CLI edits) must preserve SEO fields.
	updated := responseRow(t, request(t, app, "PUT", "/api/posts/"+item.str("id"), Row{"revision": item["revision"], "content": "Updated body"}, true), 200)
	if encode(updated["seo"]) != encode(seo) {
		t.Fatal("content edit lost SEO")
	}
	expectStatus(t, request(t, app, "PUT", "/api/posts/"+item.str("id"), Row{"revision": item["revision"], "seo": defaultPostSEO()}, true), 409)
}

func TestPostSEOClearingRestoresArticleAndSiteDefaults(t *testing.T) {
	app, _, item := publicFixture(t)
	site := defaultSEO()
	site["image"] = "https://images.example.test/site.png"
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", site, true), 200)
	path := "/api/posts/" + item.str("id")
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": Row{"title": "SEO title", "description": "SEO description", "image": "https://images.example.test/post.png"}, "cover": "https://images.example.test/cover.png"}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="https://images.example.test/post.png"`)
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": defaultPostSEO()}, true), 200)
	page := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, page, `<title>Crawlable story —`, `name="description" content="Public introduction"`, `property="og:image" content="https://images.example.test/cover.png"`)
	responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "cover": ""}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="https://images.example.test/site.png"`)
}

func TestPostSEOValidationAndDraftPrivacy(t *testing.T) {
	app, _, item := publicFixture(t)
	path := "/api/posts/" + item.str("id")
	for _, invalid := range []any{nil, "invalid", Row{}, Row{"title": "", "description": "", "image": "javascript:alert(1)"}, Row{"title": "", "description": "", "image": "https://user:pass@example.com/image.png"}, Row{"title": strings.Repeat("x", 121), "description": "", "image": ""}, Row{"title": "", "description": strings.Repeat("x", 321), "image": ""}} {
		expectStatus(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": invalid}, true), 400)
	}
	seo := Row{"title": `</title><script>alert(1)</script>`, "description": `"><img src=x onerror=alert(2)>`, "image": ""}
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": seo}, true), 200)
	excludesHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `<script>alert(1)</script>`, `<img src=x onerror=alert(2)>`)
	responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "status": "draft"}, true), 200)
	expectStatus(t, request(t, app, "GET", "/api/public/posts/crawlable", nil, false), 404)
	expectStatus(t, request(t, app, "GET", "/post/crawlable", nil, false), 404)
}

func TestPostSEOPersistsAfterReopening(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "blog.db")
	db := databaseFixture(t, filename)
	seedDatabase(db)
	ctx := context.Background()
	row := first(db.Must(ctx, "SELECT * FROM posts WHERE id='post-1'"))
	if row.str("title") != "Private title" || encode(row["seo"]) != encode(defaultPostSEO()) {
		t.Fatal("unexpected post or default SEO", row)
	}
	seo := Row{"title": "Stored title", "description": "Stored description", "image": "https://images.example.test/og.png"}
	db.Must(ctx, "UPDATE posts SET seo=$1 WHERE id='post-1'", encode(seo))
	if err := db.SQL.Close(); err != nil {
		t.Fatal(err)
	}
	db = databaseFixture(t, filename)
	row = first(db.Must(ctx, "SELECT * FROM posts WHERE id='post-1'"))
	if encode(row["seo"]) != encode(seo) {
		t.Fatal("reopening the database lost post SEO")
	}
}

func TestPostDescriptionFallbacks(t *testing.T) {
	for _, tc := range []struct {
		name          string
		item          Row
		content, want string
	}{
		{"explicit", Row{"seo": Row{"description": "Search description"}, "excerpt": "Excerpt"}, "Body", "Search description"},
		{"excerpt", Row{"seo": Row{"description": " \n"}, "excerpt": "Excerpt"}, "Body", "Excerpt"},
		{"body", Row{"seo": Row{"description": " \n"}, "excerpt": "\t"}, "## A story\n\nHello **world**, tea &amp; coffee. [Read more](https://example.test).", "A story Hello world, tea & coffee. Read more."},
		{"markup", Row{"title": "Title"}, "[Callout]\nKeep this insight.\n[/Callout]\n\n<script>bad()</script>", "Keep this insight."},
		{"title", Row{"title": "An image story"}, "![Cover](https://example.test/cover.png)", "An image story"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := postSearchDescription(tc.item, tc.content); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestArticleBodyFillsEveryDescriptionWithoutSavingOverrides(t *testing.T) {
	app, _, item := publicFixture(t)
	path := "/api/posts/" + item.str("id")
	content := "## Welcome\n\nExplore **Fused** and build your first integration."
	responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "excerpt": "", "seo": defaultPostSEO(), "content": content}, true), 200)
	description := "Welcome Explore Fused and build your first integration."
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), `name="description" content="`+description+`"`, `property="og:description" content="`+description+`"`, `name="twitter:description" content="`+description+`"`, `"description":"`+description+`"`)
	containsHTML(t, request(t, app, "GET", "/read/crawlable", nil, false).Body.String(), `name="description" content="`+description+`"`)
	saved := responseRow(t, request(t, app, "GET", path, nil, true), 200)
	if saved.str("excerpt") != "" || object(saved["seo"]).str("description") != "" || saved.str("content") != content {
		t.Fatal("fallback changed saved article fields")
	}
}

func TestGeneratedSharingImageOverridesCoverUntilCleared(t *testing.T) {
	app, storage, post := publicFixture(t)
	ctx := context.Background()
	id := uuid()
	path := "/api/assets/" + id + ".png"
	image := []byte("generated image bytes")
	must(storage.Put(ctx, "share-image", image))
	app.DB.Must(ctx, "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,'share-image','','','','')", id, post["id"])
	expectStatus(t, request(t, app, "GET", path, nil, false), 404)
	seo := defaultPostSEO()
	seo["image"] = path
	cover := "https://images.example.test/cover.png"
	route := "/api/posts/" + post.str("id")
	post = responseRow(t, request(t, app, "PUT", route, Row{"revision": post["revision"], "cover": cover, "seo": seo}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="http://blog.test`+path+`"`, cover)
	res := request(t, app, "GET", path, nil, false)
	expectStatus(t, res, 200)
	if res.Body.String() != string(image) {
		t.Fatal("generated image was not delivered")
	}
	responseRow(t, request(t, app, "PUT", route, Row{"revision": post["revision"], "seo": defaultPostSEO()}, true), 200)
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `property="og:image" content="`+cover+`"`)
	expectStatus(t, request(t, app, "GET", path, nil, false), 404)
}
