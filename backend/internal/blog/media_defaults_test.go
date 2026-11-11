package blog

import "testing"

func TestMediaDefaultsArePrivateAndDoNotRewritePosts(t *testing.T) {
	app, _, post := publicFixture(t)
	expectStatus(t, request(t, app, "GET", "/api/settings/media", nil, false), 401)
	expectStatus(t, request(t, app, "PUT", "/api/settings/media", defaultMediaSettings(), false), 401)
	original := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	settings := responseRow(t, request(t, app, "GET", "/api/settings/media", nil, true), 200)
	object(settings["image"])["width"] = "small"
	responseRow(t, request(t, app, "PUT", "/api/settings/media", settings, true), 200)
	saved := responseRow(t, request(t, app, "GET", "/api/settings/media", nil, true), 200)
	if object(saved["image"]).str("width") != "small" {
		t.Fatal(saved)
	}
	current := responseRow(t, request(t, app, "GET", "/api/posts/"+post.str("id"), nil, true), 200)
	if current.str("revision") != post.str("revision") {
		t.Fatal("saving defaults changed the post")
	}
	containsHTML(t, original, "Crawlable story")
	containsHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), "Readable <strong>without JavaScript</strong>")
	for _, field := range []string{"src", "caption", "unknown"} {
		invalid := defaultMediaSettings()
		object(invalid["image"])[field] = "not a layout default"
		expectStatus(t, request(t, app, "PUT", "/api/settings/media", invalid, true), 400)
	}
	invalid := defaultMediaSettings()
	object(invalid["video"])["width"] = "invalid"
	expectStatus(t, request(t, app, "PUT", "/api/settings/media", invalid, true), 400)
}
