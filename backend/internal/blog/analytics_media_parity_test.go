package blog

import (
	"fmt"
	"testing"
	"time"
)

func TestAnalyticsMediaAudioVideoParity(t *testing.T) {
	for _, item := range []struct{ kind, src string }{
		{"Audio", "https://media.example.test/episode.mp3"},
		{"Video", "https://media.example.test/episode.mp4"},
		{"Video", "https://stream.mux.com/episode.m3u8"},
	} {
		t.Run(item.src, func(t *testing.T) {
			a, _ := coreFixture(t)
			content := fmt.Sprintf("[%s src=%q title=\"Recording\"]", item.kind, item.src)
			post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Media parity", "slug": "media-parity", "status": "published", "content": content}, true), 201)
			kind := "video"
			if item.kind == "Audio" {
				kind = "audio"
			}
			id := mediaIdentity(kind, item.src)
			payload := analyticsPayload(post)
			payload["media"] = []Row{{"id": id, "started": true, "playedMs": 9000, "progress": 90, "completed": true, "measurable": true}}
			events := parityMediaEvents(id)
			payload["mediaEvents"] = events
			analyticsSubmit(t, a, payload)
			analyticsSubmit(t, a, payload)
			assertParityMediaReport(t, a, kind, events)
		})
	}
}

func parityMediaEvents(id string) []Row {
	var events []Row
	at := time.Now().UTC().Truncate(time.Second).Add(-time.Minute)
	for index, kind := range []string{"play", "pause", "resume", "seek", "ended"} {
		events = append(events, Row{"id": uuid(), "mediaId": id, "kind": kind, "occurredAt": at.Add(time.Duration(index) * time.Second).Format(time.RFC3339Nano), "positionMs": index * 1000})
	}
	return events
}

func assertParityMediaReport(t *testing.T, a *App, kind string, events []Row) {
	t.Helper()
	rows := mediaReport(t, a, "")
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	row := object(rows[0])
	if row.str("media_type") != kind || row.str("media_title") != "Recording" {
		t.Fatal(row)
	}
	for field, want := range map[string]float64{"views": 1, "starts": 1, "played_ms": 9000, "progress": 90, "completed": 1, "timeline_available": 1} {
		assertAnalyticsNumber(t, row, field, want)
	}
	history := mediaEventReport(t, a, "")
	if len(history) != len(events) {
		t.Fatal(history)
	}
	for index, value := range history {
		actual, expected := object(value), events[len(events)-index-1]
		assertParityMediaEvent(t, actual, expected, kind)
	}
}

func assertParityMediaEvent(t *testing.T, actual, expected Row, kind string) {
	t.Helper()
	for field, want := range map[string]string{"id": expected.str("id"), "kind": expected.str("kind"), "media_type": kind, "media_title": "Recording", "title": "Media parity"} {
		if actual.str(field) != want {
			t.Fatalf("%s: got %q, want %q", field, actual.str(field), want)
		}
	}
	actualTime, err := time.Parse(time.RFC3339Nano, actual.str("occurred_at"))
	expectedTime, _ := time.Parse(time.RFC3339Nano, expected.str("occurredAt"))
	if err != nil || !actualTime.Equal(expectedTime) {
		t.Fatalf("event timestamp changed: %v", actual)
	}
	assertAnalyticsNumber(t, actual, "position_ms", float64(expected["positionMs"].(int)))
}
