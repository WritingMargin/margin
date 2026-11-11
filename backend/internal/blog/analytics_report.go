package blog

import (
	"net/http"
	"time"
)

type analyticsRange struct{ From, To, Page, ContentType string }

func analyticsDates(r *http.Request) analyticsRange {
	now := time.Now().UTC()
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if from == "" {
		from = now.AddDate(0, 0, -29).Format("2006-01-02")
	}
	if to == "" {
		to = now.Format("2006-01-02")
	}
	start, e1 := time.Parse("2006-01-02", from)
	end, e2 := time.Parse("2006-01-02", to)
	if e1 != nil || e2 != nil || !validAnalyticsDates(start, end, now) {
		fail(400, "Choose a valid date range of up to 90 days.")
	}
	page := r.URL.Query().Get("page")
	if page != "" && page != "home" && !uuidRE.MatchString(page) {
		fail(400, "Invalid analytics page filter.")
	}
	return analyticsRange{from, to, page, analyticsTypeFilter(r)}
}

func validAnalyticsDates(start, end, now time.Time) bool {
	return !end.Before(start) && end.Sub(start) <= 89*24*time.Hour && !end.After(now)
}

const analyticsFilter = `v.day>=$1 AND v.day<=$2 AND ($3='' OR ($3='home' AND v.post_id IS NULL) OR v.post_id=$3) AND ($4='' OR v.content_kind=$4)`

func (a *App) analyticsReport(w http.ResponseWriter, r *http.Request) {
	period := analyticsDates(r)
	args := []any{period.From, period.To, period.Page, period.ContentType}
	query := func(sql string) []Row { return a.DB.Must(r.Context(), sql, args...) }
	summary := first(query(`SELECT COUNT(*) AS views,COUNT(DISTINCT v.session_id) AS sessions,` + analyticsTime + ` AS active_ms,` + analyticsDepth + ` AS scroll_depth FROM analytics_visits v WHERE ` + analyticsFilter))
	summary["events"] = query(`SELECT e.kind,COUNT(*) AS count FROM analytics_events e JOIN analytics_visits v ON v.id=e.visit_id WHERE ` + analyticsFilter + ` GROUP BY e.kind`)
	comments := a.analyticsComments(r, period)
	summary["comments"] = comments["total"]
	summary["approved_comments"] = comments["approved_count"]
	result := Row{"from": period.From, "to": period.To, "summary": summary}
	result["daily"] = query(`SELECT v.day,COUNT(*) AS views,` + analyticsTime + ` AS active_ms FROM analytics_visits v WHERE ` + analyticsFilter + ` GROUP BY v.day ORDER BY v.day`)
	a.analyticsBreakdownPages(r, period, result)
	analyticsReplayReport(result["media"].([]Row))
	result["pageOptions"] = a.DB.Must(r.Context(), `SELECT id,title,slug,content_type AS "contentType" FROM posts WHERE status='published' OR id IN (SELECT post_id FROM analytics_visits) OR id IN (SELECT post_id FROM comments) ORDER BY title,id`)
	result["classificationCoverage"] = a.analyticsContentCoverage(r, period)
	source := a.analyticsLocationSource()
	result["countryConfigured"] = source == "local"
	result["countrySource"] = source
	send(w, 200, result)
}
func (a *App) analyticsComments(r *http.Request, period analyticsRange) Row {
	return first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN approved=TRUE THEN 1 ELSE 0 END),0) AS approved_count FROM comments WHERE created_at>=$1 AND created_at<$2 AND ($3='' OR post_id=$3) AND ($4='' OR post_id IN (SELECT id FROM posts WHERE content_type=$4))`, period.From, analyticsNextDay(period.To), period.Page, period.ContentType))
}
func analyticsNextDay(day string) string {
	date, _ := time.Parse("2006-01-02", day)
	return date.AddDate(0, 0, 1).Format("2006-01-02")
}

func analyticsTypeFilter(r *http.Request) string {
	value := r.URL.Query().Get("contentType")
	switch value {
	case "", "article", "guide":
		return value
	}
	fail(400, "Invalid analytics content type.")
	return ""
}
