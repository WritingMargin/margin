package blog

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const analyticsReplayBins = 20

func validateMediaReplay(media analyticsMedia) {
	if media.DurationMS == nil && media.ReplayMS == nil {
		return
	}
	if media.DurationMS == nil || len(media.ReplayMS) != analyticsReplayBins {
		fail(400, "Replay measurements require a duration and 20 timeline bins.")
	}
	if *media.DurationMS < 1 || *media.DurationMS > 86400000 {
		fail(400, "Invalid media duration.")
	}
	if validatedReplayTotal(media.ReplayMS) > media.PlayedMS {
		fail(400, "Replay time cannot exceed measured playback.")
	}
}

func validatedReplayTotal(bins []int64) int64 {
	var total int64
	for _, value := range bins {
		if value < 0 || value > 86400000 {
			fail(400, "Invalid replay measurement.")
		}
		total += value
	}
	return total
}

func validateMediaStint(event analyticsMediaEvent, media analyticsMedia) {
	if event.PlayedMS == nil {
		return
	}
	if event.Kind != "pause" && event.Kind != "ended" && event.Kind != "exit" {
		fail(400, "Playback duration requires a pause, finish, or exit event.")
	}
	if *event.PlayedMS < 0 || *event.PlayedMS > media.PlayedMS {
		fail(400, "Event playback duration exceeds measured playback.")
	}
}

func (a *App) storeAnalyticsReplay(ctx context.Context, tx *sql.Tx, visit string, media analyticsMedia) {
	if media.DurationMS == nil {
		return
	}
	// The media upsert already holds this row's write lock. Freeze its duration
	// before merging cumulative bins, so delayed packets cannot mix timelines.
	a.execInteraction(ctx, tx, `UPDATE analytics_media SET duration_ms=$3 WHERE visit_id=$1 AND media_id=$2 AND duration_ms IS NULL`, visit, media.ID, *media.DurationMS)
	query, args := a.DB.adapt(`SELECT duration_ms,played_ms FROM analytics_media WHERE visit_id=$1 AND media_id=$2`, []any{visit, media.ID})
	var duration, played int64
	must(tx.QueryRowContext(ctx, query, args...).Scan(&duration, &played))
	if duration != *media.DurationMS {
		return
	}
	total := a.analyticsReplayMergedTotal(ctx, tx, visit, media)
	// Valid cumulative packets cannot inflate the merged total above playback.
	if total > played {
		return
	}
	for bin, value := range media.ReplayMS {
		a.execInteraction(ctx, tx, `INSERT INTO analytics_media_replay(visit_id,media_id,bin,replay_ms) VALUES($1,$2,$3,$4)
 ON CONFLICT(visit_id,media_id,bin) DO UPDATE SET replay_ms=CASE WHEN excluded.replay_ms>analytics_media_replay.replay_ms THEN excluded.replay_ms ELSE analytics_media_replay.replay_ms END`, visit, media.ID, bin, value)
	}
}

func (a *App) analyticsReplayMergedTotal(ctx context.Context, tx *sql.Tx, visit string, media analyticsMedia) int64 {
	args := []any{visit, media.ID}
	values := make([]string, len(media.ReplayMS))
	for bin, value := range media.ReplayMS {
		args = append(args, bin, value)
		// PostgreSQL otherwise infers text for untyped VALUES parameters and
		// cannot compare incoming.bin with the integer column below.
		values[bin] = fmt.Sprintf("(CAST($%d AS INTEGER),CAST($%d AS BIGINT))", len(args)-1, len(args))
	}
	query := `WITH incoming(bin,replay_ms) AS (VALUES ` + strings.Join(values, ",") + `)
 SELECT CAST(COALESCE(SUM(CASE WHEN stored.replay_ms>incoming.replay_ms THEN stored.replay_ms ELSE incoming.replay_ms END),0) AS BIGINT)
 FROM incoming LEFT JOIN analytics_media_replay stored ON stored.visit_id=$1 AND stored.media_id=$2 AND stored.bin=incoming.bin`
	query, args = a.DB.adapt(query, args)
	var total int64
	must(tx.QueryRowContext(ctx, query, args...).Scan(&total))
	return total
}

func analyticsReplayColumns() string {
	columns := make([]string, analyticsReplayBins)
	for bin := range columns {
		columns[bin] = fmt.Sprintf("CAST(SUM(replay.bin_%d) AS BIGINT) AS replay_%d", bin, bin)
	}
	return strings.Join(columns, ",")
}

func analyticsReplayPivot() string {
	columns := make([]string, analyticsReplayBins)
	for bin := range columns {
		columns[bin] = fmt.Sprintf("MAX(CASE WHEN bin=%d THEN replay_ms END) AS bin_%d", bin, bin)
	}
	return "SELECT visit_id,media_id," + strings.Join(columns, ",") + " FROM analytics_media_replay GROUP BY visit_id,media_id"
}

func analyticsReplayReport(rows []Row) {
	for _, row := range rows {
		var bins []int64
		if measured, ok := row["replay_measured_views"].(int64); ok && measured > 0 {
			bins = make([]int64, analyticsReplayBins)
		}
		for bin := 0; bin < analyticsReplayBins; bin++ {
			key := fmt.Sprintf("replay_%d", bin)
			if value, ok := row[key].(int64); ok && bins != nil {
				bins[bin] = value
			}
			delete(row, key)
		}
		row["replay_ms"] = bins
	}
}
