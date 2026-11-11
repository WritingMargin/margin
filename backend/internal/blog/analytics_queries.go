package blog

import (
	"net/http"
	"strconv"
)

// SQL expressions explicitly cast PostgreSQL numeric aggregates so both
// supported databases emit JSON numbers, never numeric strings.
const analyticsTime = `CAST(COALESCE(SUM(v.active_ms),0) AS BIGINT)`
const analyticsDepth = `CAST(COALESCE(AVG(v.scroll_depth),0) AS DOUBLE PRECISION)`

var analyticsBreakdowns = map[string]string{
	"media":        analyticsMediaQuery,
	"mediaEvents":  analyticsMediaEventsQuery,
	"countries":    `SELECT CASE WHEN v.country LIKE 'ip:%' THEN 'Unknown' ELSE v.country END AS country,COUNT(*) AS views,` + analyticsTime + ` AS active_ms FROM analytics_visits v WHERE ` + analyticsFilter + ` GROUP BY CASE WHEN v.country LIKE 'ip:%' THEN 'Unknown' ELSE v.country END`,
	"pages":        `SELECT COALESCE(v.post_id,'home') AS id,COALESCE(p.title,'Homepage') AS title,COUNT(*) AS views,` + analyticsTime + ` AS active_ms,` + analyticsDepth + ` AS scroll_depth FROM analytics_visits v LEFT JOIN posts p ON p.id=v.post_id WHERE ` + analyticsFilter + ` GROUP BY v.post_id,p.title`,
	"sections":     `SELECT v.post_id,p.title,v.revision,s.section_id,s.label,COUNT(*) AS views,CAST(SUM(s.active_ms) AS BIGINT) AS active_ms FROM analytics_sections s JOIN analytics_visits v ON v.id=s.visit_id JOIN posts p ON p.id=v.post_id WHERE ` + analyticsFilter + ` AND s.active_ms>0 GROUP BY v.post_id,p.title,v.revision,s.section_id,s.label`,
	"passages":     `SELECT v.post_id,p.title,v.revision,e.target,e.section_id,SUM(CASE WHEN e.kind='highlight' THEN 1 ELSE 0 END) AS highlights,SUM(CASE WHEN e.kind='copy' THEN 1 ELSE 0 END) AS copies FROM analytics_events e JOIN analytics_visits v ON v.id=e.visit_id JOIN posts p ON p.id=v.post_id WHERE ` + analyticsFilter + ` AND e.kind IN ('highlight','copy') GROUP BY v.post_id,p.title,v.revision,e.target,e.section_id`,
	"clicks":       `SELECT e.target,COUNT(*) AS clicks FROM analytics_events e JOIN analytics_visits v ON v.id=e.visit_id WHERE ` + analyticsFilter + ` AND e.kind='click' GROUP BY e.target`,
	"commentPages": `SELECT p.id,p.title,COUNT(*) AS comments,SUM(CASE WHEN c.approved=TRUE THEN 1 ELSE 0 END) AS approved_count,SUM(CASE WHEN q.comment_id IS NOT NULL THEN 1 ELSE 0 END) AS questions FROM comments c JOIN posts p ON p.id=c.post_id LEFT JOIN passage_questions q ON q.comment_id=c.id WHERE c.created_at>=$1 AND c.created_at<$2 AND ($3='' OR c.post_id=$3) AND ($4='' OR p.content_type=$4) GROUP BY p.id,p.title`,
}
var analyticsSort = map[string]string{
	"media":        "starts DESC,played_ms DESC,post_id,media_id,media_title,media_type,provider",
	"mediaEvents":  "occurred_at DESC,id",
	"contentKinds": "active_ms DESC,label", "tags": "active_ms DESC,label", "contentTypes": "active_ms DESC,label", "writingStyles": "active_ms DESC,label",
	"countries": "views DESC,country", "pages": "views DESC,title,id",
	"sections": "active_ms DESC,post_id,revision,section_id,label",
	"passages": "highlights DESC,copies DESC,post_id,revision,section_id,target",
	"clicks":   "clicks DESC,target", "commentPages": "comments DESC,title,id",
}

func analyticsPageNumber(r *http.Request, key string, fallback, min, max int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	number, err := strconv.Atoi(raw)
	if err != nil || number < min || number > max {
		fail(400, "Invalid analytics pagination: "+key)
	}
	return number
}
func (a *App) analyticsBreakdownPages(r *http.Request, period analyticsRange, result Row) {
	pagination := Row{}
	size := analyticsPageNumber(r, "pageSize", 10, 1, 50)
	queries := a.analyticsContentQueries()
	for key, sql := range analyticsBreakdowns {
		queries[key] = sql
	}
	for key, sql := range queries {
		end := period.To
		if key == "commentPages" || key == "mediaEvents" {
			end = analyticsNextDay(end)
		}
		args := []any{period.From, end, period.Page, period.ContentType}
		total := first(a.DB.Must(r.Context(), "SELECT COUNT(*) AS total FROM ("+sql+") analytics_rows", args...))["total"].(int64)
		offset := analyticsPageNumber(r, key+"Offset", 0, 0, 10000000)
		last := max(0, (int(total)-1)/size*size)
		offset = min(offset, last)
		result[key] = a.DB.Must(r.Context(), "SELECT * FROM ("+sql+") analytics_rows ORDER BY "+analyticsSort[key]+" LIMIT $5 OFFSET $6", append(args, size, offset)...)
		pagination[key] = Row{"total": total, "offset": offset, "pageSize": size}
	}
	result["pagination"] = pagination
}
