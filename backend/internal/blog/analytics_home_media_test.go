package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const analyticsHeroURL = "https://media.example.test/hero.mp4?token=PRIVATE_HERO_SECRET"

func homepageMediaTheme(t *testing.T, composed bool, src string) Row {
	t.Helper()
	theme := defaultTheme()
	if composed {
		theme = componentTheme(t)
		home := object(theme["homepage"])
		props := object(object(home["sections"].([]any)[0])["props"])
		props["mediaType"] = "video" // Missing video inherits artworkVideo.
	}
	home := object(theme["homepage"])
	home["artworkType"], home["artworkVideo"] = "video", src
	return theme
}

func homepageMediaPayload(src string) Row {
	payload, snapshot := analyticsPayload(nil), replaySnapshot()
	snapshot["id"] = mediaIdentity("video", src)
	payload["media"] = []Row{snapshot}
	event := mediaEvent("pause", time.Now())
	event["mediaId"], event["playedMs"] = snapshot["id"], 9000
	payload["mediaEvents"] = []Row{event}
	return payload
}

func TestHomepageMediaPlaybackReportsAndArticleSeparation(t *testing.T) {
	for _, composed := range []bool{false, true} {
		a, _ := coreFixture(t)
		theme := homepageMediaTheme(t, composed, analyticsHeroURL)
		expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
		payload := homepageMediaPayload(analyticsHeroURL)
		analyticsSubmit(t, a, payload)
		analyticsSubmit(t, a, payload)
		assertHomepagePlaybackReport(t, a)
		post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Shared video", "slug": "shared-video", "status": "published", "content": `[Video src="` + analyticsHeroURL + `"]`}, true), 201)
		article := analyticsPayload(post)
		article["media"] = payload["media"]
		analyticsSubmit(t, a, article)
		if len(mediaReport(t, a, "")) != 2 || len(mediaReport(t, a, "?page="+post.str("id"))) != 1 {
			t.Fatal("homepage and article merged")
		}
		for _, query := range []string{"?page=" + uuid(), "?contentType=guide", "?from=2000-01-01&to=2000-01-01"} {
			if len(mediaReport(t, a, query)) != 0 || len(mediaEventReport(t, a, query)) != 0 {
				t.Fatal("filter leaked homepage media", query)
			}
		}
		stored := a.DB.Must(context.Background(), "SELECT * FROM analytics_media")
		if strings.Contains(encode(stored), "PRIVATE_HERO_SECRET") || strings.Contains(encode(stored), "media.example") {
			t.Fatal("source URL leaked")
		}
	}
}

func assertHomepagePlaybackReport(t *testing.T, a *App) {
	t.Helper()
	rows := mediaReport(t, a, "?page=home")
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	row := object(rows[0])
	for key, want := range map[string]string{"post_id": "home", "title": "Homepage", "media_title": "Homepage hero", "media_type": "video", "provider": "Native"} {
		if row.str(key) != want {
			t.Fatalf("%s: %v", key, row)
		}
	}
	for key, want := range map[string]float64{"views": 1, "starts": 1, "played_ms": 9000, "progress": 90, "completed": 1} {
		assertAnalyticsNumber(t, row, key, want)
	}
	assertReplayReport(t, row, 1000, 1)
	history := mediaEventReport(t, a, "?page=home")
	if len(history) != 1 || object(history[0]).str("title") != "Homepage" {
		t.Fatal(history)
	}
	assertAnalyticsNumber(t, object(history[0]), "played_ms", 9000)
}

func TestHomepageMediaRequiresVisibleSavedHero(t *testing.T) {
	for _, composed := range []bool{false, true} {
		a, _ := coreFixture(t)
		payload := homepageMediaPayload(analyticsHeroURL)
		// An unsaved preview, or an unrelated source, cannot claim homepage playback.
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
		for _, change := range []string{"hidden", "image", "cleared", "replaced", "removed"} {
			theme := homepageMediaTheme(t, composed, analyticsHeroURL)
			home := object(theme["homepage"])
			switch change {
			case "hidden":
				home["showHero"] = false
			case "image":
				home["artworkType"] = "image"
			case "cleared":
				home["artworkVideo"] = ""
			case "replaced":
				home["artworkVideo"] = "https://example.test/other.mp4"
			case "removed":
				home["showArtwork"] = false
			}
			if composed {
				hideComposedHero(home, change)
			}
			expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
			expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
		}
		if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_visits")) != 0 {
			t.Fatal("rejected media partially committed")
		}
	}
}

func hideComposedHero(home Row, change string) {
	sections := home["sections"].([]any)
	props := object(object(sections[0])["props"])
	if change == "image" {
		props["mediaType"] = "image"
	}
	if change == "cleared" {
		props["video"], home["artworkVideo"] = "", analyticsHeroURL
	}
	if change == "removed" {
		home["sections"] = sections[1:]
	}
}

func TestHomepageMediaPrivacyAndProviderCoverage(t *testing.T) {
	a, _ := coreFixture(t)
	expectStatus(t, request(t, a, "PUT", "/api/settings", homepageMediaTheme(t, false, analyticsHeroURL), true), 200)
	payload := homepageMediaPayload(analyticsHeroURL)
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, true), 204)
	for key, value := range map[string]string{"DNT": "1", "Sec-GPC": "1", "User-Agent": "Search crawler"} {
		r := httptest.NewRequest("POST", "/api/public/analytics", strings.NewReader(encode(payload)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set(key, value)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 204)
	}
	if len(mediaReport(t, a, "")) != 0 || len(mediaEventReport(t, a, "")) != 0 {
		t.Fatal("privacy exclusion failed")
	}
	for src, measurable := range map[string]bool{
		"https://youtu.be/dQw4w9WgXcQ":                            true,
		"https://vimeo.com/123456":                                true,
		"https://stream.mux.com/clip.m3u8":                        true,
		"https://player.mux.com/clip":                             false,
		"/api/public/videos/00000000-0000-4000-8000-000000000001": true,
	} {
		expectStatus(t, request(t, a, "PUT", "/api/settings", homepageMediaTheme(t, true, src), true), 200)
		payload = homepageMediaPayload(src)
		if measurable {
			analyticsSubmit(t, a, payload)
			continue
		}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
		payload["mediaEvents"] = []Row{}
		payload["media"] = []Row{{"id": mediaIdentity("video", src)}}
		analyticsSubmit(t, a, payload)
	}
	if len(mediaReport(t, a, "?page=home")) != 5 {
		t.Fatal("provider coverage missing")
	}
}
