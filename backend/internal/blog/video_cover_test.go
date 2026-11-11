package blog

import (
	"strings"
	"testing"
)

func TestVideoCoverPublicationAndRendering(t *testing.T) {
	app, _ := coreFixture(t)
	video := responseRow(t, request(t, app, "POST", "/api/media/videos", videoAPIInput("video/mp4"), true), 201).str("url")
	input := draftInput("video-cover")
	input["cover"] = video
	input["content"] = "An article with a video hero."
	post := responseRow(t, request(t, app, "POST", "/api/posts", input, true), 201)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
	path := "/api/posts/" + post.str("id")
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "published"}, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 200)
	article := request(t, app, "GET", "/post/video-cover", nil, false).Body.String()
	containsHTML(t, article, `class="article-video-cover article-cover"`, `<video src="`+video+`"`, `aria-label="`, `An article with a video hero.`)
	if strings.Contains(article, `<img class="article-cover" src="`+video+`"`) || strings.Contains(article, `property="og:image" content="`+video+`"`) {
		t.Fatal("video cover used as an image", article)
	}
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), "Watch &amp; read")
	post = responseRow(t, request(t, app, "PUT", path, Row{"revision": post["revision"], "status": "draft"}, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
}

func TestVideoCoverSourcesAreValidated(t *testing.T) {
	for _, source := range []string{"https://youtu.be/dQw4w9WgXcQ?autoplay=1", "https://example.test/film.webm", "https://example.test/live.m3u8"} {
		markup := string(publicCover(source, "Film", "player", false))
		containsHTML(t, markup, "article-video-cover")
		if strings.Contains(source, "youtu.be") {
			containsHTML(t, markup, "<iframe")
		} else {
			containsHTML(t, markup, "<video")
		}
		if coverImage(source) != "" {
			t.Fatal("video became share image", source)
		}
	}
	if publicCover("javascript:alert(1)", "Bad", "player", false) != "" {
		t.Fatal("unsafe cover rendered")
	}
}
