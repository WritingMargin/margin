package blog

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func replaySnapshot() Row {
	row := mediaSnapshot()
	row["durationMs"] = 10000
	row["replayMs"] = replayBins(1000)
	return row
}

func replayBins(value int64) []int64 {
	bins := make([]int64, analyticsReplayBins)
	bins[3] = value
	return bins
}

func TestAnalyticsMediaReplayAndStintAudioVideoParity(t *testing.T) {
	for _, item := range []struct{ kind, src string }{
		{"audio", "https://media.example.test/episode.mp3"},
		{"video", "https://media.example.test/episode.mp4"},
		{"video", "https://stream.mux.com/episode.m3u8"},
	} {
		t.Run(item.src, func(t *testing.T) {
			a, _ := coreFixture(t)
			content := fmt.Sprintf("[%s src=%q title=\"Recording\"]", item.kind, item.src)
			post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Playback parity", "slug": "playback-parity", "status": "published", "content": content}, true), 201)
			id := mediaIdentity(item.kind, item.src)
			snapshot := replaySnapshot()
			snapshot["id"] = id
			payload := analyticsPayload(post)
			payload["media"] = []Row{snapshot}
			var events []Row
			for _, kind := range []string{"pause", "ended", "exit"} {
				event := mediaEvent(kind, time.Now())
				event["mediaId"], event["playedMs"] = id, 2500
				events = append(events, event)
			}
			payload["mediaEvents"] = events
			analyticsSubmit(t, a, payload)
			analyticsSubmit(t, a, payload)
			assertReplayReport(t, object(mediaReport(t, a, "")[0]), 1000, 1)
			history := mediaEventReport(t, a, "")
			if len(history) != 3 {
				t.Fatal(history)
			}
			for _, row := range history {
				assertAnalyticsNumber(t, object(row), "played_ms", 2500)
				if object(row).str("media_type") != item.kind {
					t.Fatal(row)
				}
			}
		})
	}
}

func TestAnalyticsMediaReplayCumulativeRetryAndCoverage(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload, snapshot := analyticsPayload(post), replaySnapshot()
	payload["media"] = []Row{snapshot}
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	snapshot["replayMs"] = replayBins(2000)
	analyticsSubmit(t, a, payload)
	// A delayed packet cannot erase more recent replay measurements.
	snapshot["playedMs"], snapshot["replayMs"] = 5000, replayBins(500)
	analyticsSubmit(t, a, payload)
	// Neither a changed timeline nor an adversarial max-merge inflates bins.
	snapshot["durationMs"], snapshot["replayMs"] = 20000, replayBins(5000)
	analyticsSubmit(t, a, payload)
	other := make([]int64, analyticsReplayBins)
	other[4] = 8000
	snapshot["durationMs"], snapshot["playedMs"], snapshot["replayMs"] = 10000, 9000, other
	analyticsSubmit(t, a, payload)
	assertReplayReport(t, object(mediaReport(t, a, "")[0]), 2000, 1)
	// A second visit sums once; historical clients are excluded from coverage.
	payload["viewId"], payload["media"] = uuid(), []Row{replaySnapshot()}
	analyticsSubmit(t, a, payload)
	payload["viewId"], payload["media"] = uuid(), []Row{mediaSnapshot()}
	analyticsSubmit(t, a, payload)
	row := object(mediaReport(t, a, "?page="+post.str("id"))[0])
	assertReplayReport(t, row, 3000, 2)
	assertAnalyticsNumber(t, row, "views", 3)
	assertAnalyticsNumber(t, row, "played_ms", 27000)
	if len(mediaReport(t, a, "?page=home")) != 0 {
		t.Fatal("replay report ignored filter")
	}
	a.DB.Must(context.Background(), "UPDATE analytics_visits SET day='2000-01-01'")
	analyticsSubmit(t, a, analyticsPayload(nil))
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_media_replay")) != 0 {
		t.Fatal("expired replay bins retained")
	}
}

func TestAnalyticsMediaReplayMergesBinsWithoutExceedingPlayback(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload, snapshot := analyticsPayload(post), replaySnapshot()
	first := replayBins(2000)
	first[4] = 1000
	snapshot["replayMs"] = first
	payload["media"] = []Row{snapshot}
	analyticsSubmit(t, a, payload)

	second := replayBins(1000)
	second[4] = 3000
	snapshot["replayMs"] = second
	analyticsSubmit(t, a, payload)

	// The packet is valid alone, but its merged bins would exceed playback.
	third := make([]int64, analyticsReplayBins)
	third[5] = 5000
	snapshot["replayMs"] = third
	analyticsSubmit(t, a, payload)

	rows := a.DB.Must(context.Background(), `SELECT bin,replay_ms FROM analytics_media_replay WHERE visit_id=$1 AND media_id=$2 AND replay_ms>0 ORDER BY bin`, payload["viewId"], snapshot["id"])
	if len(rows) != 2 || rows[0]["bin"] != int64(3) || rows[0]["replay_ms"] != int64(2000) || rows[1]["bin"] != int64(4) || rows[1]["replay_ms"] != int64(3000) {
		t.Fatal(rows)
	}
}

func assertReplayReport(t *testing.T, row Row, replay, coverage float64) {
	t.Helper()
	assertAnalyticsNumber(t, row, "duration_ms", 10000)
	assertAnalyticsNumber(t, row, "replay_measured_views", coverage)
	bins, ok := row["replay_ms"].([]any)
	if !ok || len(bins) != analyticsReplayBins {
		t.Fatal(row)
	}
	for bin, value := range bins {
		want := float64(0)
		if bin == 3 {
			want = replay
		}
		if value != want {
			t.Fatalf("bin %d: got %v, want %v", bin, value, want)
		}
	}
}

func TestAnalyticsMediaReplayValidation(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	badBins := replayBins(-1)
	fractionalBins := make([]float64, analyticsReplayBins)
	fractionalBins[3] = 0.5
	changes := []Row{
		{"durationMs": nil}, {"durationMs": 0}, {"durationMs": 86400001}, {"durationMs": 1.5},
		{"replayMs": nil}, {"replayMs": []int64{}}, {"replayMs": []int64{1000}}, {"replayMs": badBins},
		{"replayMs": replayBins(9001)}, {"replayMs": replayBins(86400001)},
		{"replayMs": fractionalBins},
	}
	for _, change := range changes {
		snapshot := replaySnapshot()
		for key, value := range change {
			snapshot[key] = value
		}
		payload := analyticsPayload(post)
		payload["media"] = []Row{snapshot}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_visits")) != 0 {
		t.Fatal("invalid bins created visits")
	}
}

func TestAnalyticsMediaReplayMixedDurationsRetainPercentageBins(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	for _, duration := range []int64{10000, 20000} {
		payload, snapshot := analyticsPayload(post), replaySnapshot()
		snapshot["durationMs"] = duration
		payload["media"] = []Row{snapshot}
		analyticsSubmit(t, a, payload)
	}
	// A historical visit is not counted as measured and cannot supply duration.
	payload := analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	analyticsSubmit(t, a, payload)
	row := object(mediaReport(t, a, "")[0])
	if row["duration_ms"] != nil {
		t.Fatal("mixed timelines reported a single duration", row)
	}
	assertAnalyticsNumber(t, row, "replay_measured_views", 2)
	bins, ok := row["replay_ms"].([]any)
	if !ok || len(bins) != analyticsReplayBins || bins[3] != float64(2000) {
		t.Fatal("mixed timelines lost percentage bins", row)
	}
}

func TestAnalyticsMediaReplayHistoricalAndCollectionsUnavailable(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload := analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	analyticsSubmit(t, a, payload)
	assertReplayUnavailable(t, object(mediaReport(t, a, "")[0]))
	payload["viewId"] = uuid()
	payload["media"] = []Row{{"id": mediaIdentity("video", "https://player.mux.com/abcdef"), "durationMs": 10000, "replayMs": replayBins(0)}}
	analyticsSubmit(t, a, payload)
	assertReplayUnavailable(t, object(mediaReport(t, a, "")[1]))
	src := "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
	post = responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Collection", "slug": "collection-replay", "status": "published", "content": "[Audio src=\"" + src + "\"]"}, true), 201)
	snapshot := replaySnapshot()
	snapshot["id"] = mediaIdentity("audio", src)
	payload = analyticsPayload(post)
	payload["media"] = []Row{snapshot}
	analyticsSubmit(t, a, payload)
	assertReplayUnavailable(t, object(mediaReport(t, a, "?page="+post.str("id"))[0]))
}

func assertReplayUnavailable(t *testing.T, row Row) {
	t.Helper()
	if row["duration_ms"] != nil || row["replay_ms"] != nil {
		t.Fatal("missing coverage presented as measured", row)
	}
	assertAnalyticsNumber(t, row, "replay_measured_views", 0)
}

func TestAnalyticsMediaStintDurationRetryAndValidation(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	for _, kind := range []string{"pause", "ended", "exit"} {
		event := mediaEvent(kind, time.Now())
		event["playedMs"] = 4500
		payload := mediaEventPayload(post, event)
		analyticsSubmit(t, a, payload)
		analyticsSubmit(t, a, payload)
		event["playedMs"] = 4000
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
		delete(event, "playedMs")
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	}
	rows := mediaEventReport(t, a, "")
	if len(rows) != 3 {
		t.Fatal(rows)
	}
	for _, row := range rows {
		assertAnalyticsNumber(t, object(row), "played_ms", 4500)
	}
	for _, change := range []Row{{"playedMs": -1}, {"playedMs": 9001}, {"playedMs": 0.5}, {"kind": "play"}, {"kind": "resume"}, {"kind": "seek"}} {
		event := mediaEvent("pause", time.Now())
		event["playedMs"] = 1000
		for key, value := range change {
			event[key] = value
		}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", mediaEventPayload(post, event), false), 400)
	}
}

func TestAnalyticsPlaybackReportWithoutDuration(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	analyticsSubmit(t, a, mediaEventPayload(post, mediaEvent("pause", time.Now())))
	rows := mediaEventReport(t, a, "")
	if len(rows) != 1 || object(rows[0])["played_ms"] != nil {
		t.Fatal("unexpected event history or duration", rows)
	}
	assertReplayUnavailable(t, object(mediaReport(t, a, "")[0]))
	event := mediaEvent("exit", time.Now())
	event["playedMs"] = 0
	analyticsSubmit(t, a, mediaEventPayload(post, event))
	if len(mediaEventReport(t, a, "")) != 2 {
		t.Fatal("missing exit event")
	}
}

func TestAnalyticsPostgresPlaybackReport(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Replay report", "slug": "replay-report", "status": "published", "content": "[Audio src=\"" + analyticsAudioURL + "\"]"}, true), 201)
	event := mediaEvent("exit", time.Now())
	event["playedMs"] = 3000
	payload := mediaEventPayload(post, event)
	payload["media"] = []Row{replaySnapshot()}
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	assertReplayReport(t, object(mediaReport(t, a, "")[0]), 1000, 1)
	assertAnalyticsNumber(t, object(mediaEventReport(t, a, "")[0]), "played_ms", 3000)
}
