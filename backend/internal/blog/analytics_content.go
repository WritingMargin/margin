package blog

import "net/http"

func (a *App) analyticsContentQueries() map[string]string {
	tags := `jsonb_array_elements_text(p.tags)`
	if a.DB.Kind == "sqlite" {
		tags = `json_each(p.tags)`
	}
	source := `FROM analytics_visits v JOIN (SELECT DISTINCT p.id,LOWER(TRIM(topic.value)) AS label FROM posts p, ` + tags + ` AS topic WHERE TRIM(topic.value)<>'') t ON t.id=v.post_id WHERE ` + analyticsFilter
	return map[string]string{
		"contentKinds":  analyticsContentSelect("v.content_kind") + `FROM analytics_visits v WHERE ` + analyticsFilter + ` AND v.post_id IS NOT NULL GROUP BY v.content_kind`,
		"tags":          analyticsContentSelect("t.label") + source + ` GROUP BY t.label`,
		"contentTypes":  analyticsClassificationQuery("content_type"),
		"writingStyles": analyticsClassificationQuery("writing_style"),
	}
}
func analyticsContentSelect(label string) string {
	return `SELECT ` + label + ` AS label,COUNT(*) AS views,COUNT(DISTINCT v.post_id) AS articles,` + analyticsTime + ` AS active_ms,` + analyticsDepth + ` AS scroll_depth `
}
func analyticsClassificationQuery(column string) string {
	label := `COALESCE(c.` + column + `,'Unclassified')`
	return analyticsContentSelect(label) + `FROM analytics_visits v LEFT JOIN analytics_classifications c ON c.post_id=v.post_id AND c.revision=v.revision WHERE ` + analyticsFilter + ` AND v.post_id IS NOT NULL GROUP BY ` + label
}
func (a *App) analyticsContentCoverage(r *http.Request, period analyticsRange) Row {
	return first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS views,COUNT(c.post_id) AS classified_views FROM analytics_visits v LEFT JOIN analytics_classifications c ON c.post_id=v.post_id AND c.revision=v.revision WHERE `+analyticsFilter+` AND v.post_id IS NOT NULL`, period.From, period.To, period.Page, period.ContentType))
}
