package blog

import (
	"context"
	"database/sql"
	"time"
)

type analyticsMediaEvent struct {
	ID         string `json:"id"`
	MediaID    string `json:"mediaId"`
	Kind       string `json:"kind"`
	OccurredAt string `json:"occurredAt"`
	PositionMS int64  `json:"positionMs"`
	PlayedMS   *int64 `json:"playedMs,omitempty"`
}

var analyticsMediaEventKinds = map[string]bool{"play": true, "pause": true, "resume": true, "seek": true, "ended": true, "exit": true}

func validateAnalyticsMediaEvents(value *analyticsBatch) {
	if len(value.MediaEvents) > 30 {
		fail(400, "Too many media events.")
	}
	snapshots := map[string]analyticsMedia{}
	for _, media := range value.Media {
		snapshots[media.ID] = media
	}
	for i := range value.MediaEvents {
		event := &value.MediaEvents[i]
		validateAnalyticsMediaEvent(event)
		media, ok := snapshots[event.MediaID]
		if !ok || !media.Measurable {
			fail(400, "Media events require a matching measurable media snapshot.")
		}
		validateMediaStint(*event, media)
	}
}
func validateAnalyticsMediaEvent(event *analyticsMediaEvent) {
	if !uuidRE.MatchString(event.ID) || !analyticsMediaID.MatchString(event.MediaID) {
		fail(400, "Invalid media event identity.")
	}
	if !analyticsMediaEventKinds[event.Kind] {
		fail(400, "Invalid media event kind.")
	}
	if event.PositionMS < 0 || event.PositionMS > 86400000 {
		fail(400, "Invalid media event position.")
	}
	timestamp, err := time.Parse(time.RFC3339Nano, event.OccurredAt)
	if err != nil {
		fail(400, "Invalid media event timestamp.")
	}
	_, offset := timestamp.Zone()
	now := time.Now().UTC()
	if offset != 0 || timestamp.Before(now.AddDate(0, 0, -89).Truncate(24*time.Hour)) || timestamp.After(now.Add(5*time.Minute)) {
		fail(400, "Media event timestamp must be UTC within the retention period.")
	}
	// Fixed precision is necessary for stable lexical ordering in both databases.
	event.OccurredAt = timestamp.UTC().Format("2006-01-02T15:04:05.000000000Z")
}
func (a *App) storeAnalyticsMediaEvents(ctx context.Context, tx *sql.Tx, value analyticsBatch) {
	for _, event := range value.MediaEvents {
		query, args := a.DB.adapt(`INSERT INTO analytics_media_events(id,visit_id,media_id,kind,occurred_at,position_ms,played_ms) VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(id) DO UPDATE SET id=excluded.id
 WHERE analytics_media_events.visit_id=excluded.visit_id AND analytics_media_events.media_id=excluded.media_id
 AND analytics_media_events.kind=excluded.kind AND analytics_media_events.occurred_at=excluded.occurred_at AND analytics_media_events.position_ms=excluded.position_ms
 AND (analytics_media_events.played_ms=excluded.played_ms OR (analytics_media_events.played_ms IS NULL AND excluded.played_ms IS NULL))
 RETURNING id`, []any{event.ID, value.ViewID, event.MediaID, event.Kind, event.OccurredAt, event.PositionMS, event.PlayedMS})
		var id string
		if err := tx.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
			fail(409, "Media event identity changed.")
		}
	}
}

const analyticsMediaEventsQuery = `SELECT e.id,COALESCE(v.post_id,'home') AS post_id,COALESCE(p.title,'Homepage') AS title,m.media_id,m.media_title,m.media_type,m.provider,e.kind,e.occurred_at,e.position_ms,e.played_ms
 FROM analytics_media_events e JOIN analytics_media m ON m.visit_id=e.visit_id AND m.media_id=e.media_id
 JOIN analytics_visits v ON v.id=e.visit_id LEFT JOIN posts p ON p.id=v.post_id
 WHERE e.occurred_at>=$1 AND e.occurred_at<$2 AND ($3='' OR ($3='home' AND v.post_id IS NULL) OR v.post_id=$3) AND ($4='' OR v.content_kind=$4)`
