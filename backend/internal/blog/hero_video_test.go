package blog

import "testing"

func TestHomepageHeroVideoValidationAndRendering(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	home := object(theme["homepage"])
	home["artworkType"] = "video"
	for _, source := range []string{"https://example.test/film.mp4", "https://example.test/live.m3u8", "https://youtu.be/dQw4w9WgXcQ?autoplay=1"} {
		home["artworkVideo"] = source
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
		page := request(t, app, "GET", "/", nil, false).Body.String()
		containsHTML(t, page, `class="homepage-hero-video"`)
		excludesHTML(t, page, `autoplay=""`, `src="https://youtu.be/dQw4w9WgXcQ?autoplay=1"`, `class="journal-art"`)
	}
	for _, source := range []string{"javascript:alert(1)", "https://evil.test/embed/123", "https://www.youtube.com/film.mp4", "/api/public/videos/../secret", "https://user:password@example.test/file.mp4"} {
		home["artworkVideo"] = source
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}

func TestHomepageHeroUploadedVideoPublication(t *testing.T) {
	app, _ := coreFixture(t)
	video := responseRow(t, request(t, app, "POST", "/api/media/videos", videoAPIInput("video/mp4"), true), 201).str("url")
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
	theme := defaultTheme()
	home := object(theme["homepage"])
	home["artworkType"], home["artworkVideo"] = "video", video
	expectStatus(t, request(t, app, "GET", video, nil, false), 404) // Unsaved design is private.
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 200)
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `src="`+video+`"`, `controls playsinline`)
	home["showArtwork"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
}

func TestComposedHeroUploadedVideoVisibility(t *testing.T) {
	app, _ := coreFixture(t)
	video := responseRow(t, request(t, app, "POST", "/api/media/videos", videoAPIInput("video/mp4"), true), 201).str("url")
	theme := componentTheme(t)
	home := object(theme["homepage"])
	sections := home["sections"].([]any)
	props := object(object(sections[0])["props"])
	props["mediaType"], props["video"] = "video", video
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 200)
	containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), `template-hero-split with-image`, `class="template-hero-video"`, `src="`+video+`"`)
	props["mediaType"] = "image"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
	props["mediaType"], home["showHero"] = "video", false
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
	home["showHero"], home["sections"] = true, sections[1:]
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "GET", video, nil, false), 404)
}

func TestHeroVideoEscapingAndMountedPath(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	containsHTML(t, string(publicHeroVideo("/api/public/videos/00000000-0000-4000-8000-000000000001", `<script>title</script>`)), `/blog/api/public/videos/`, `aria-label="&lt;script&gt;title&lt;/script&gt;"`)
	if publicHeroVideo("javascript:alert(1)", "Title") != "" {
		t.Fatal("unsafe hero source rendered")
	}
}
