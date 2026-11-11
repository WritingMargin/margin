package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

const analyticsAudioURL = "https://media.example.test/episode.mp3?token=PRIVATE_SECRET"

func mediaAnalyticsFixture(t *testing.T) (*App, Row) {
	t.Helper()
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A podcast", "slug": "a-podcast", "status": "published", "content": "[Audio src=\"" + analyticsAudioURL + "\" title=\"Episode one\"]\n\n[Video src=\"https://player.mux.com/abcdef\"]"}, true), 201)
	return a, post
}
func mediaSnapshot() Row {
	return Row{"id": mediaIdentity("audio", analyticsAudioURL), "started": true, "playedMs": 9000, "progress": 90, "completed": true, "measurable": true}
}
func mediaReport(t *testing.T, a *App, query string) []any {
	t.Helper()
	return responseRow(t, request(t, a, "GET", "/api/analytics"+query, nil, true), 200)["media"].([]any)
}
func TestAnalyticsMediaRetriesCountsAndPrivacy(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload := analyticsPayload(post)
	measurement := mediaSnapshot()
	payload["media"] = []Row{measurement}
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	measurement["playedMs"], measurement["progress"], measurement["completed"] = 3000, 20, false
	analyticsSubmit(t, a, payload)
	rows := mediaReport(t, a, "")
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	row := object(rows[0])
	assertAnalyticsNumber(t, row, "views", 1)
	assertAnalyticsNumber(t, row, "starts", 1)
	assertAnalyticsNumber(t, row, "played_ms", 9000)
	assertAnalyticsNumber(t, row, "progress", 90)
	assertAnalyticsNumber(t, row, "completed", 1)
	if row.str("media_title") != "Episode one" || row.str("provider") != "Native" {
		t.Fatal(row)
	}
	stored := a.DB.Must(context.Background(), "SELECT * FROM analytics_media")
	if strings.Contains(encode(stored), "PRIVATE_SECRET") || strings.Contains(encode(stored), "media.example") {
		t.Fatal("media URL leaked to storage", stored)
	}
	second := analyticsPayload(post)
	second["media"] = []Row{{"id": mediaIdentity("audio", analyticsAudioURL)}, {"id": mediaIdentity("video", "https://player.mux.com/abcdef")}}
	analyticsSubmit(t, a, second)
	rows = mediaReport(t, a, "")
	row = object(rows[0])
	assertAnalyticsNumber(t, row, "views", 2)
	assertAnalyticsNumber(t, row, "measurable_views", 1)
	assertAnalyticsNumber(t, row, "starts", 1)
	if len(rows) != 2 {
		t.Fatal(rows)
	}
}
func TestAnalyticsMediaRejectsInvalidAndUnpublishedAttribution(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	changes := []Row{{"id": mediaIdentity("audio", "https://attacker.test/other.mp3")}, {"playedMs": -1}, {"playedMs": 86400001}, {"playedMs": 1.5}, {"progress": 101}, {"progress": 89}, {"playedMs": 0}, {"started": false}, {"measurable": false}, {"title": "Injected title"}, {"provider": "Forged"}, {"id": mediaIdentity("video", "https://player.mux.com/abcdef")}}
	for _, change := range changes {
		snapshot := mediaSnapshot()
		for key, value := range change {
			snapshot[key] = value
		}
		payload := analyticsPayload(post)
		payload["media"] = []Row{snapshot}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	}
	payload := analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot(), mediaSnapshot()}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	payload = analyticsPayload(nil)
	payload["media"] = []Row{mediaSnapshot()}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	payload = analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	payload["revision"] = "old"
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	payload["revision"] = post["revision"]
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 404)
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_visits")) != 0 {
		t.Fatal("invalid measurement partially committed")
	}
}
func TestAnalyticsMediaFiltersRetentionAndConsent(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload := analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, true), 204)
	for key, value := range map[string]string{"DNT": "1", "Sec-GPC": "1", "User-Agent": "Search crawler"} {
		r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", strings.NewReader(encode(payload)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set(key, value)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 204)
	}
	if len(mediaReport(t, a, "")) != 0 {
		t.Fatal("excluded visitor stored")
	}
	analyticsSubmit(t, a, payload)
	if len(mediaReport(t, a, "?page="+post.str("id"))) != 1 {
		t.Fatal("article filter lost media")
	}
	for _, query := range []string{"?page=home", "?page=" + uuid(), "?contentType=guide", "?from=2000-01-01&to=2000-01-01"} {
		if len(mediaReport(t, a, query)) != 0 {
			t.Fatal("filter leaked media", query)
		}
	}
	a.DB.Must(context.Background(), "UPDATE analytics_visits SET day='2000-01-01'")
	analyticsSubmit(t, a, analyticsPayload(nil))
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_media")) != 0 {
		t.Fatal("expired media measurements retained")
	}
}
func TestAnalyticsMediaPublishedSourceIdentity(t *testing.T) {
	src := "https://example.test/real.mp3"
	hidden := "https://example.test/code.mp3"
	content := "```\n[Audio src=\"" + hidden + "\"]\n```\n\n[Audio src=\"" + src + "\"]\n\n[Diagram]\n[Audio src=\"" + hidden + "\"]\n[/Diagram]"
	assets := analyticsMediaAssets(content, Row{"cover": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5", "title": "Cover audio"})
	if len(assets) != 2 || assets[mediaIdentity("audio", src)].provider != "Native" {
		t.Fatal(assets)
	}
	if _, ok := assets[mediaIdentity("audio", hidden)]; ok {
		t.Fatal("code example became measurable media")
	}
	if mediaIdentity("audio", " café ") != "a0716bff8157594d" {
		t.Fatal("cross-language fixture:", mediaIdentity("audio", " café "))
	}
}

func TestAnalyticsMediaProgressExcludesUnavailableAndUnstartedViews(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	snapshots := []Row{
		mediaSnapshot(),
		{"id": mediaIdentity("audio", analyticsAudioURL)},
		{"id": mediaIdentity("audio", analyticsAudioURL), "measurable": true},
		{"id": mediaIdentity("audio", analyticsAudioURL), "measurable": true, "started": true, "progress": 30, "playedMs": 3000},
	}
	for _, snapshot := range snapshots {
		payload := analyticsPayload(post)
		payload["media"] = []Row{snapshot}
		analyticsSubmit(t, a, payload)
	}
	rows := mediaReport(t, a, "")
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	row := object(rows[0])
	assertAnalyticsNumber(t, row, "views", 4)
	assertAnalyticsNumber(t, row, "measurable_views", 3)
	assertAnalyticsNumber(t, row, "starts", 2)
	assertAnalyticsNumber(t, row, "progress", 60)
	// A source remains one asset even if its title differs between recorded revisions.
	a.DB.Must(context.Background(), "UPDATE analytics_media SET media_title='Earlier title' WHERE started=0")
	rows = mediaReport(t, a, "")
	if len(rows) != 1 {
		t.Fatal("title edit split an asset", rows)
	}
	assertAnalyticsNumber(t, object(rows[0]), "progress", 60)
}

func TestAnalyticsMediaCollectionTimelineAvailability(t *testing.T) {
	cases := map[string]bool{
		"https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5":                                 true,
		"https://open.spotify.com/track/7makk4oTQel546B0PZlDM5":                                   true,
		"https://open.spotify.com/show/7makk4oTQel546B0PZlDM5":                                    false,
		"https://open.spotify.com/album/7makk4oTQel546B0PZlDM5":                                   false,
		"https://open.spotify.com/playlist/7makk4oTQel546B0PZlDM5":                                false,
		"https://open.spotify.com/artist/7makk4oTQel546B0PZlDM5":                                  false,
		"https://soundcloud.com/artist/episode":                                                   true,
		"https://soundcloud.com/artist/sets/series":                                               false,
		"https://api.soundcloud.com/playlists/123":                                                false,
		"https://api.soundcloud.com/tracks/123":                                                   true,
		"https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Fplaylists%2F123": false,
	}
	for src, want := range cases {
		if got := analyticsTimelineAvailable("audio", src); got != want {
			t.Fatalf("%s: got %v want %v", src, got, want)
		}
	}
	a, post := mediaAnalyticsFixture(t)
	src := "https://open.spotify.com/show/7makk4oTQel546B0PZlDM5"
	a.DB.Must(context.Background(), "UPDATE posts SET cover=$1 WHERE id=$2", src, post["id"])
	payload := analyticsPayload(post)
	snapshot := mediaSnapshot()
	snapshot["id"] = mediaIdentity("audio", src)
	payload["media"] = []Row{snapshot}
	analyticsSubmit(t, a, payload)
	row := object(mediaReport(t, a, "")[0])
	assertAnalyticsNumber(t, row, "timeline_available", 0)
	assertAnalyticsNumber(t, row, "starts", 1)
	assertAnalyticsNumber(t, row, "played_ms", 9000)
	assertAnalyticsNumber(t, row, "progress", 0)
	assertAnalyticsNumber(t, row, "completed", 0)
	payload = analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	analyticsSubmit(t, a, payload)
	rows := mediaReport(t, a, "")
	for _, raw := range rows {
		item := object(raw)
		if item.str("media_id") == mediaIdentity("audio", analyticsAudioURL) {
			assertAnalyticsNumber(t, item, "timeline_available", 1)
			assertAnalyticsNumber(t, item, "completed", 1)
		}
	}
}
