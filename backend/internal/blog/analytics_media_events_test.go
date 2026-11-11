package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func mediaEvent(kind string, at time.Time) Row {
	return Row{"id": uuid(), "mediaId": mediaIdentity("audio", analyticsAudioURL), "kind": kind, "occurredAt": at.UTC().Format(time.RFC3339Nano), "positionMs": 12000}
}
func mediaEventPayload(post Row, events ...Row) Row {
	payload := analyticsPayload(post)
	payload["media"] = []Row{mediaSnapshot()}
	payload["mediaEvents"] = events
	return payload
}
func mediaEventReport(t *testing.T, a *App, query string) []any {
	t.Helper()
	return responseRow(t, request(t, a, "GET", "/api/analytics"+query, nil, true), 200)["mediaEvents"].([]any)
}
func TestAnalyticsMediaEventOrderingRetryAndAttribution(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	now := time.Now().UTC().Truncate(time.Second).Add(-time.Minute)
	early := mediaEvent("play", now.Add(10*time.Millisecond))
	late := mediaEvent("pause", now.Add(100*time.Millisecond))
	payload := mediaEventPayload(post, late, early)
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	rows := mediaEventReport(t, a, "")
	if len(rows) != 2 || object(rows[0]).str("id") != late.str("id") || object(rows[1]).str("id") != early.str("id") {
		t.Fatal(rows)
	}
	row := object(rows[0])
	for field, want := range map[string]string{"media_title": "Episode one", "title": "A podcast", "media_type": "audio", "provider": "Native"} {
		if row.str(field) != want {
			t.Fatal(row)
		}
	}
	assertAnalyticsNumber(t, row, "position_ms", 12000)
	stored := a.DB.Must(context.Background(), "SELECT * FROM analytics_media_events")
	if strings.Contains(encode(stored), "PRIVATE_SECRET") || strings.Contains(encode(stored), "media.example") {
		t.Fatal("media URL leaked", stored)
	}
	if len(mediaEventReport(t, a, "?pageSize=1&mediaEventsOffset=1")) != 1 {
		t.Fatal("history did not paginate")
	}
	assertAnalyticsNumber(t, object(mediaReport(t, a, "")[0]), "starts", 1)
}
func TestAnalyticsMediaEventIdentityIsImmutable(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	event := mediaEvent("play", time.Now())
	payload := mediaEventPayload(post, event)
	analyticsSubmit(t, a, payload)
	event["kind"] = "pause"
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	event["kind"] = "play"
	event["positionMs"] = 13000
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	event["positionMs"] = 12000
	payload["viewId"] = uuid()
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_visits")) != 1 {
		t.Fatal("conflicting event left partial visit")
	}
	rows := mediaEventReport(t, a, "")
	if len(rows) != 1 || object(rows[0]).str("kind") != "play" {
		t.Fatal(rows)
	}
}
func TestAnalyticsMediaEventValidation(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	changes := []Row{{"id": "bad"}, {"mediaId": "bad"}, {"mediaId": mediaIdentity("audio", "https://other.test/a.mp3")}, {"kind": "click"}, {"positionMs": -1}, {"positionMs": 86400001}, {"positionMs": 0.5}, {"occurredAt": "yesterday"}, {"occurredAt": "2000-01-01T00:00:00Z"}, {"occurredAt": time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano)}, {"occurredAt": time.Now().In(time.FixedZone("non-UTC", 3600)).Format(time.RFC3339Nano)}, {"url": "https://private.test"}}
	for _, change := range changes {
		event := mediaEvent("play", time.Now())
		for key, value := range change {
			event[key] = value
		}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", mediaEventPayload(post, event), false), 400)
	}
	payload := analyticsPayload(post)
	payload["mediaEvents"] = []Row{mediaEvent("play", time.Now())}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	snapshots := []Row{{"id": mediaIdentity("audio", analyticsAudioURL)}}
	for _, snapshot := range snapshots {
		payload = mediaEventPayload(post, mediaEvent("play", time.Now()))
		payload["media"] = []Row{snapshot}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	}
	events := make([]Row, 31)
	for i := range events {
		events[i] = mediaEvent("play", time.Now())
	}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", mediaEventPayload(post, events...), false), 400)
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_visits")) != 0 {
		t.Fatal("invalid media event created visit")
	}
}
func TestAnalyticsMediaEventPrivacyFiltersAndRetention(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload := mediaEventPayload(post, mediaEvent("ended", time.Now()))
	// Reaching the end is an action, independent of unique watched completion.
	payload["media"] = []Row{{"id": mediaIdentity("audio", analyticsAudioURL), "measurable": true, "started": true, "playedMs": 1000, "progress": 10, "completed": false}}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, true), 204)
	for key, value := range map[string]string{"DNT": "1", "Sec-GPC": "1", "User-Agent": "Search crawler"} {
		r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", strings.NewReader(encode(payload)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set(key, value)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 204)
	}
	if len(mediaEventReport(t, a, "")) != 0 {
		t.Fatal("excluded visitor events stored")
	}
	analyticsSubmit(t, a, payload)
	if len(mediaEventReport(t, a, "?page="+post.str("id"))) != 1 {
		t.Fatal("article filter lost event")
	}
	assertAnalyticsNumber(t, object(mediaReport(t, a, "")[0]), "completed", 0)
	for _, query := range []string{"?page=home", "?page=" + uuid(), "?contentType=guide", "?from=2000-01-01&to=2000-01-01"} {
		if len(mediaEventReport(t, a, query)) != 0 {
			t.Fatal("filter leaked event", query)
		}
	}
	payload["revision"] = "old"
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	payload["revision"] = post["revision"]
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 404)
	a.DB.Must(context.Background(), "UPDATE analytics_visits SET day='2000-01-01'")
	analyticsSubmit(t, a, analyticsPayload(nil))
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_media_events")) != 0 {
		t.Fatal("expired event retained")
	}
}

func TestAnalyticsMediaEventDatesFollowEventAcrossMidnight(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	yesterday := today.Add(-24 * time.Hour)
	before := mediaEvent("play", today.Add(-time.Second))
	after := mediaEvent("pause", today)
	payload := mediaEventPayload(post, before, after)
	analyticsSubmit(t, a, payload)
	// A page opened yesterday continues playing after midnight.
	a.DB.Must(context.Background(), "UPDATE analytics_visits SET day=$1", yesterday.Format("2006-01-02"))
	for _, test := range []struct {
		day   time.Time
		event Row
	}{{yesterday, before}, {today, after}} {
		day := test.day.Format("2006-01-02")
		rows := mediaEventReport(t, a, "?from="+day+"&to="+day)
		if len(rows) != 1 || object(rows[0]).str("id") != test.event.str("id") {
			t.Fatal(day, rows)
		}
	}
	// Event time expires independently of a still-recent page view.
	a.DB.Must(context.Background(), "UPDATE analytics_media_events SET occurred_at='2000-01-01T00:00:00.000000000Z'")
	analyticsSubmit(t, a, analyticsPayload(nil))
	if len(a.DB.Must(context.Background(), "SELECT * FROM analytics_media_events")) != 0 {
		t.Fatal("old events retained by recent visit")
	}
}

func TestAnalyticsMediaActionsBeforePlayback(t *testing.T) {
	a, post := mediaAnalyticsFixture(t)
	payload := mediaEventPayload(post, mediaEvent("seek", time.Now().Add(-time.Second)), mediaEvent("play", time.Now()))
	payload["media"] = []Row{{"id": mediaIdentity("audio", analyticsAudioURL), "measurable": true, "started": false, "playedMs": 0, "progress": 0, "completed": false}}
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	rows := mediaEventReport(t, a, "")
	if len(rows) != 2 {
		t.Fatal(rows)
	}
	if object(rows[0]).str("kind") != "play" || object(rows[1]).str("kind") != "seek" {
		t.Fatal(rows)
	}
	media := object(mediaReport(t, a, "")[0])
	assertAnalyticsNumber(t, media, "starts", 0)
	assertAnalyticsNumber(t, media, "played_ms", 0)
	assertAnalyticsNumber(t, media, "completed", 0)
}
