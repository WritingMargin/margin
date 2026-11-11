package blog

import (
	"context"
	"database/sql"
	"fmt"
	"hash/fnv"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

type analyticsMedia struct {
	ID                    string  `json:"id"`
	Started               bool    `json:"started"`
	PlayedMS              int64   `json:"playedMs"`
	Progress              int     `json:"progress"`
	Completed             bool    `json:"completed"`
	Measurable            bool    `json:"measurable"`
	DurationMS            *int64  `json:"durationMs,omitempty"`
	ReplayMS              []int64 `json:"replayMs,omitempty"`
	title, kind, provider string
	timelineAvailable     bool
}
type analyticsMediaAsset struct {
	title, kind, provider string
	measurable            bool
	timelineAvailable     bool
}

var analyticsMediaID = regexp.MustCompile(`^[0-9a-f]{16}$`)

func mediaIdentity(kind, src string) string {
	digest := fnv.New64a()
	_, _ = digest.Write([]byte(kind + "\n" + strings.TrimSpace(src)))
	return fmt.Sprintf("%016x", digest.Sum64())
}
func validateAnalyticsMedia(value analyticsBatch) {
	if len(value.Media) > 100 {
		fail(400, "Too many media measurements.")
	}
	seen := map[string]bool{}
	for _, media := range value.Media {
		if !analyticsMediaID.MatchString(media.ID) || seen[media.ID] {
			fail(400, "Invalid media identity.")
		}
		seen[media.ID] = true
		validateMediaMeasurement(media)
		validateMediaCompletion(media)
		validateMediaReplay(media)
	}
}
func validateMediaMeasurement(media analyticsMedia) {
	if media.PlayedMS < 0 || media.PlayedMS > 86400000 || media.Progress < 0 || media.Progress > 100 {
		fail(400, "Invalid media measurement.")
	}
	active := media.Started || mediaHasProgress(media)
	if active && !media.Measurable {
		fail(400, "Playback measurement is unavailable.")
	}
	if !media.Started && mediaHasProgress(media) {
		fail(400, "Playback must start before progress.")
	}
}
func validateMediaCompletion(media analyticsMedia) {
	if media.Completed && (media.Progress < 90 || media.PlayedMS == 0) {
		fail(400, "Complete media requires measured playback of at least 90 percent.")
	}
}
func mediaHasProgress(media analyticsMedia) bool {
	return media.PlayedMS > 0 || media.Progress > 0 || media.Completed
}
func (a *App) attributeAnalyticsMedia(r *http.Request, value *analyticsBatch, post Row) {
	if len(value.Media) == 0 {
		return
	}
	assets := a.analyticsPageMedia(r, post)
	for i := range value.Media {
		item := &value.Media[i]
		asset, ok := assets[item.ID]
		if !ok {
			fail(400, "Media is not part of the published page.")
		}
		if item.Measurable && !asset.measurable {
			fail(400, "Playback measurement is unavailable for this provider.")
		}
		item.title, item.kind, item.provider = asset.title, asset.kind, asset.provider
		item.timelineAvailable = asset.timelineAvailable
		if !item.timelineAvailable {
			item.Progress = 0
			item.Completed = false
		}
		if !item.Measurable || !item.timelineAvailable {
			item.DurationMS = nil
			item.ReplayMS = nil
		}
	}
}
func (a *App) analyticsPageMedia(r *http.Request, post Row) map[string]analyticsMediaAsset {
	if post == nil {
		assets := map[string]analyticsMediaAsset{}
		for _, src := range publishedHeroVideoSources(a.settings(r.Context())) {
			addAnalyticsMediaAsset(assets, "video", src, "Homepage hero")
		}
		return assets
	}
	content, err := a.Storage.Get(r.Context(), post.str("content_key"))
	must(err)
	return analyticsMediaAssets(string(content), post)
}
func analyticsMediaAssets(content string, post Row) map[string]analyticsMediaAsset {
	result := map[string]analyticsMediaAsset{}
	addAnalyticsMediaAsset(result, "audio", post.str("cover"), post.str("title"))
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	for i := 0; i < len(lines); i++ {
		if rssFence.MatchString(lines[i]) {
			i = rssFenceEnd(lines, i)
			continue
		}
		marker := rssBlockMarker(lines[i])
		if marker == nil || marker.close {
			continue
		}
		if marker.kind == "raw" {
			i = rssRawEnd(lines, i, marker.name)
			if i < 0 {
				break
			}
			continue
		}
		addAnalyticsMediaMarker(result, marker)
	}
	return result
}
func addAnalyticsMediaMarker(result map[string]analyticsMediaAsset, marker *rssMarker) {
	kind := marker.name
	if audioMarker(kind) {
		kind = "audio"
	}
	if kind != "audio" && kind != "video" {
		return
	}
	title := marker.attrs["title"]
	if title == "" {
		title = marker.attrs["caption"]
	}
	addAnalyticsMediaAsset(result, kind, marker.attrs["src"], title)
}
func addAnalyticsMediaAsset(result map[string]analyticsMediaAsset, kind, src, title string) {
	provider, measurable := analyticsMediaProvider(kind, src)
	if provider == "" {
		return
	}
	title = readableLine(title)
	if title == "" {
		title = provider + " " + kind
	}
	title = string([]rune(title)[:min(200, len([]rune(title)))])
	result[mediaIdentity(kind, src)] = analyticsMediaAsset{title, kind, provider, measurable, analyticsTimelineAvailable(kind, src)}
}
func analyticsMediaProvider(kind, src string) (string, bool) {
	if kind == "audio" {
		source := resolveAudio(src)
		if source == nil {
			return "", false
		}
		if source.provider != "" {
			return source.provider, source.provider == "Spotify" || source.provider == "SoundCloud"
		}
		return "Native", true
	}
	return analyticsVideoProvider(src)
}

var analyticsDirectVideo = regexp.MustCompile(`(?i)\.(mp4|webm|og[gv]|m4v|m3u8)$`)

func analyticsVideoProvider(src string) (string, bool) {
	if videoUploadRE.MatchString(src) {
		return "Native", true
	}
	target, provider := rssVideo(src)
	if target != "" {
		supported := provider == "YouTube" || provider == "Vimeo" || analyticsNativeVideoURL(target)
		return provider, supported
	}
	u, err := url.Parse(src)
	if err != nil || !rssPublicURL(u) {
		return "", false
	}
	if analyticsDirectVideo.MatchString(u.Path) {
		return analyticsDirectProvider(u.Hostname()), true
	}
	if u.Hostname() == "res.cloudinary.com" && strings.Contains(u.Path, "/video/") {
		return "Cloudinary", true
	}
	return "", false
}
func analyticsNativeVideoURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && analyticsDirectVideo.MatchString(u.Path)
}
func analyticsDirectProvider(host string) string {
	if host == "stream.mux.com" {
		return "Mux"
	}
	if host == "res.cloudinary.com" {
		return "Cloudinary"
	}
	return "Native"
}
func (a *App) storeAnalyticsMedia(ctx context.Context, tx *sql.Tx, value analyticsBatch) {
	for _, media := range value.Media {
		a.execInteraction(ctx, tx, `INSERT INTO analytics_media(visit_id,media_id,media_title,media_type,provider,started,played_ms,progress,completed,measurable,timeline_available) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
 ON CONFLICT(visit_id,media_id) DO UPDATE SET
 timeline_available=excluded.timeline_available,
 started=CASE WHEN excluded.started>analytics_media.started THEN excluded.started ELSE analytics_media.started END,
 played_ms=CASE WHEN excluded.played_ms>analytics_media.played_ms THEN excluded.played_ms ELSE analytics_media.played_ms END,
 progress=CASE WHEN excluded.progress>analytics_media.progress THEN excluded.progress ELSE analytics_media.progress END,
 completed=CASE WHEN excluded.completed>analytics_media.completed THEN excluded.completed ELSE analytics_media.completed END,
 measurable=CASE WHEN excluded.measurable>analytics_media.measurable THEN excluded.measurable ELSE analytics_media.measurable END`, value.ViewID, media.ID, media.title, media.kind, media.provider, analyticsBool(media.Started), media.PlayedMS, media.Progress, analyticsBool(media.Completed), analyticsBool(media.Measurable), analyticsBool(media.timelineAvailable))
		a.storeAnalyticsReplay(ctx, tx, value.ViewID, media)
	}
}
func analyticsBool(value bool) int {
	if value {
		return 1
	}
	return 0
}

var analyticsMediaQuery = `SELECT COALESCE(v.post_id,'home') AS post_id,COALESCE(p.title,'Homepage') AS title,m.media_id,MAX(m.media_title) AS media_title,m.media_type,m.provider,
 MAX(m.timeline_available) AS timeline_available,COUNT(*) AS views,CAST(SUM(m.measurable) AS BIGINT) AS measurable_views,
 CAST(SUM(m.started) AS BIGINT) AS starts,CAST(SUM(m.played_ms) AS BIGINT) AS played_ms,
 CAST(COALESCE(AVG(CASE WHEN m.measurable=1 AND m.started=1 AND m.timeline_available=1 THEN m.progress END),0) AS DOUBLE PRECISION) AS progress,CAST(SUM(CASE WHEN m.timeline_available=1 THEN m.completed ELSE 0 END) AS BIGINT) AS completed,
 CASE WHEN MIN(m.duration_ms)=MAX(m.duration_ms) THEN MAX(m.duration_ms) END AS duration_ms,
 COUNT(replay.visit_id) AS replay_measured_views,` + analyticsReplayColumns() + `
 FROM analytics_media m JOIN analytics_visits v ON v.id=m.visit_id LEFT JOIN posts p ON p.id=v.post_id
 LEFT JOIN (` + analyticsReplayPivot() + `) replay ON replay.visit_id=m.visit_id AND replay.media_id=m.media_id
 WHERE ` + analyticsFilter + ` GROUP BY v.post_id,p.title,m.media_id,m.media_type,m.provider`

// Collections expose playback events but no stable duration for the entire collection.
func analyticsTimelineAvailable(kind, src string) bool {
	if kind != "audio" {
		_, supported := analyticsVideoProvider(src)
		return supported
	}
	source := resolveAudio(src)
	if source == nil {
		return false
	}
	switch source.provider {
	case "":
		return true
	case "Spotify":
		return strings.Contains(source.link, "/episode/") || strings.Contains(source.link, "/track/")
	case "SoundCloud":
		target, err := url.Parse(source.link)
		return err == nil && !strings.Contains(target.Path, "/sets/") && !strings.HasPrefix(target.Path, "/playlists/")
	}
	return false
}
