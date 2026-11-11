package blog

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type analyticsSection struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	ActiveMS int64  `json:"activeMs"`
}
type analyticsEvent struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Target    string `json:"target"`
	SectionID string `json:"sectionId"`
}
type analyticsBatch struct {
	ViewID      string                `json:"viewId"`
	SessionID   string                `json:"sessionId"`
	PostID      string                `json:"postId"`
	Revision    string                `json:"revision"`
	ActiveMS    int64                 `json:"activeMs"`
	ScrollDepth int                   `json:"scrollDepth"`
	Sections    []analyticsSection    `json:"sections"`
	Events      []analyticsEvent      `json:"events"`
	Media       []analyticsMedia      `json:"media"`
	MediaEvents []analyticsMediaEvent `json:"mediaEvents"`
}

func (a *App) analyticsRoutes() {
	a.mux.HandleFunc("POST /api/public/analytics", a.collectAnalytics)
	a.mux.HandleFunc("GET /api/analytics", a.analyticsReport)
	a.mux.HandleFunc("GET /api/analytics/reaction-map", a.reactionMap)
	a.mux.HandleFunc("GET /api/analytics/classification", a.analyticsClassificationConfig)
	a.mux.HandleFunc("POST /api/analytics/classification", a.classifyAnalytics)
}

func (a *App) skipAnalytics(r *http.Request) bool {
	if r.Header.Get("DNT") == "1" || r.Header.Get("Sec-GPC") == "1" {
		return true
	}
	agent := strings.ToLower(r.UserAgent())
	for _, word := range []string{"bot", "crawler", "spider", "headless"} {
		if strings.Contains(agent, word) {
			return true
		}
	}
	return a.authenticated(r)
}

func decodeAnalytics(input Row) analyticsBatch {
	var value analyticsBatch
	decoder := json.NewDecoder(strings.NewReader(encode(input)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&value) != nil {
		fail(400, "Invalid analytics payload.")
	}
	if !uuidRE.MatchString(value.ViewID) || !uuidRE.MatchString(value.SessionID) {
		fail(400, "Invalid analytics identity.")
	}
	if value.ActiveMS < 0 || value.ActiveMS > 86400000 || value.ScrollDepth < 0 || value.ScrollDepth > 100 {
		fail(400, "Invalid engagement measurement.")
	}
	if len(value.Sections) > 100 || len(value.Events) > 30 {
		fail(400, "Analytics batch is too large.")
	}
	validateAnalyticsSections(value)
	validateAnalyticsMedia(value)
	validateAnalyticsMediaEvents(&value)
	return value
}
func validateAnalyticsSections(value analyticsBatch) {
	seen := map[string]bool{}
	var total int64
	for _, section := range value.Sections {
		validateAnalyticsSection(section, seen[section.ID])
		seen[section.ID] = true
		total += section.ActiveMS
	}
	if total > value.ActiveMS {
		fail(400, "Section time exceeds active reading time.")
	}
	if value.PostID == "" && (value.Revision != "" || len(value.Sections) > 0) {
		fail(400, "Homepage cannot have article sections.")
	}
}
func validateAnalyticsSection(section analyticsSection, duplicate bool) {
	if !keyRE.MatchString(section.ID) || len(section.ID) > 80 || duplicate {
		fail(400, "Invalid article section.")
	}
	if textLength(section.Label) < 1 || textLength(section.Label) > 200 || section.ActiveMS < 0 || section.ActiveMS > 86400000 {
		fail(400, "Invalid section measurement.")
	}
}
func (a *App) analyticsPost(r *http.Request, value analyticsBatch) Row {
	if value.PostID == "" {
		return nil
	}
	item := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE id=$1 AND status='published'", value.PostID))
	if item == nil {
		fail(404, "Published article not found.")
	}
	if item.str("revision") != value.Revision {
		fail(409, "Article revision changed.")
	}
	return item
}
func (a *App) validateAnalyticsEvents(r *http.Request, value *analyticsBatch, post Row) {
	text := ""
	for i := range value.Events {
		event := &value.Events[i]
		if !uuidRE.MatchString(event.ID) || len(event.SectionID) > 80 {
			fail(400, "Invalid analytics event.")
		}
		if event.Kind == "click" {
			event.Target = analyticsClickTarget(event.Target)
			continue
		}
		if event.Kind != "highlight" && event.Kind != "copy" {
			fail(400, "Invalid analytics event kind.")
		}
		if post == nil {
			fail(400, "Passages require an article.")
		}
		if text == "" {
			content, err := a.Storage.Get(r.Context(), post.str("content_key"))
			must(err)
			text = passageText(string(content))
		}
		event.Target = readableLine(event.Target)
		if !validAnalyticsPassage(text, event.Target) {
			fail(400, "Select text from the published article.")
		}
	}
}
func validAnalyticsPassage(text, target string) bool {
	return textLength(target) > 0 && textLength(target) <= 500 && strings.Contains(text, target)
}
func analyticsClickTarget(raw string) string {
	if textLength(raw) > 500 {
		fail(400, "Click target is too long.")
	}
	if strings.HasPrefix(raw, "button:") && len(raw) > 7 {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.User != nil {
		fail(400, "Invalid click target.")
	}
	if u.IsAbs() {
		if u.Scheme != "https" && u.Scheme != "http" {
			fail(400, "Invalid click protocol.")
		}
		return u.Scheme + "://" + u.Host + u.EscapedPath()
	}
	if !validAnalyticsPath(raw) {
		fail(400, "Invalid click path.")
	}
	return u.EscapedPath()
}

func validAnalyticsPath(raw string) bool {
	return strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//")
}

func (a *App) collectAnalytics(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "analytics", 240, time.Minute, false)
	if a.skipAnalytics(r) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	value := decodeAnalytics(body(w, r))
	post := a.analyticsPost(r, value)
	a.validateAnalyticsEvents(r, &value, post)
	a.attributeAnalyticsMedia(r, &value, post)
	a.storeAnalytics(r, value, analyticsContentKind(post))
	w.WriteHeader(http.StatusNoContent)
}
func (a *App) storeAnalytics(r *http.Request, value analyticsBatch, contentKind string) {
	ctx := r.Context()
	location := a.analyticsLocationForVisit(r, value.ViewID)
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	now := time.Now().UTC()
	a.execInteraction(ctx, tx, "DELETE FROM analytics_visits WHERE day<$1", now.AddDate(0, 0, -89).Format("2006-01-02"))
	a.execInteraction(ctx, tx, "DELETE FROM analytics_media_events WHERE occurred_at<$1", now.AddDate(0, 0, -89).Format("2006-01-02"))
	// Cumulative snapshots and monotonic upserts make retries and late beacons safe.
	q, args := a.DB.adapt(`INSERT INTO analytics_visits(id,session_id,post_id,revision,country,day,active_ms,scroll_depth,content_kind)
 VALUES($1,$2,NULLIF($3,''),$4,$5,$6,$7,$8,$9)
 ON CONFLICT(id) DO UPDATE SET
 country=CASE WHEN analytics_visits.country LIKE 'ip:%' THEN 'Unknown' ELSE analytics_visits.country END,
 active_ms=CASE WHEN excluded.active_ms>analytics_visits.active_ms THEN excluded.active_ms ELSE analytics_visits.active_ms END,
 scroll_depth=CASE WHEN excluded.scroll_depth>analytics_visits.scroll_depth THEN excluded.scroll_depth ELSE analytics_visits.scroll_depth END
 WHERE analytics_visits.session_id=excluded.session_id AND COALESCE(analytics_visits.post_id,'')=COALESCE(excluded.post_id,'') AND analytics_visits.revision=excluded.revision
 RETURNING id`, []any{value.ViewID, value.SessionID, value.PostID, value.Revision, location, now.Format("2006-01-02"), value.ActiveMS, value.ScrollDepth, contentKind})
	var id string
	if err = tx.QueryRowContext(ctx, q, args...).Scan(&id); err != nil {
		fail(409, "Page view identity changed.")
	}
	for _, section := range value.Sections {
		a.execInteraction(ctx, tx, `INSERT INTO analytics_sections(visit_id,section_id,label,active_ms) VALUES($1,$2,$3,$4)
   ON CONFLICT(visit_id,section_id) DO UPDATE SET active_ms=CASE WHEN excluded.active_ms>analytics_sections.active_ms THEN excluded.active_ms ELSE analytics_sections.active_ms END`, value.ViewID, section.ID, section.Label, section.ActiveMS)
	}
	for _, event := range value.Events {
		a.execInteraction(ctx, tx, "INSERT INTO analytics_events(id,visit_id,kind,target,section_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING", event.ID, value.ViewID, event.Kind, event.Target, event.SectionID)
	}
	a.storeAnalyticsMedia(ctx, tx, value)
	a.storeAnalyticsMediaEvents(ctx, tx, value)
	must(tx.Commit())
}

// Attribute visits from the persisted content, never a client-supplied label.
func analyticsContentKind(post Row) string {
	if post == nil {
		return "home"
	}
	if kind := post.str("content_type"); kind != "" {
		return kind
	}
	return "article"
}
