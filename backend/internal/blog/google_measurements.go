package blog

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

// Google's sitemap resource reports processing separately from the submission receipt.
func (a *App) googleSitemapStatus(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "property")
	property, origin, token := a.googleTarget(r, input)
	address := googleWebmasters + "/" + url.PathEscape(property) + "/sitemaps/" + url.PathEscape(origin+"/sitemap.xml")
	var result Row
	a.publishingRequest(r.Context(), token, "GET", address, nil, &result)
	send(w, 200, result)
}

func (a *App) recordGoogleMeasurement(ctx context.Context, postID, property, canonical, kind string, result Row) {
	now := time.Now().UTC()
	a.DB.Must(ctx, `INSERT INTO google_article_measurements(post_id,property,url,day,kind,recorded_at,snapshot)
 VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(post_id,property,url,day,kind) DO UPDATE SET recorded_at=excluded.recorded_at,snapshot=excluded.snapshot`,
		postID, property, canonical, now.Format(time.DateOnly), kind, now.Format(time.RFC3339Nano), encode(result))
}

func (a *App) googleArticleHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	post := a.readablePost(ctx, r.URL.Query().Get("slug"))
	property := r.URL.Query().Get("property")
	origin := a.searchOrigin(ctx)
	if !coversPublication(property, origin) {
		fail(400, "Choose a property covering the publication.")
	}
	rows := a.DB.Must(ctx, `SELECT recorded_at,kind,snapshot FROM google_article_measurements
 WHERE post_id=$1 AND property=$2 AND url=$3 ORDER BY recorded_at DESC,kind LIMIT 60`, post.str("id"), property, readableLinks(post, origin).str("canonical"))
	send(w, 200, Row{"records": rows})
}

type googleTrafficRow struct {
	Keys        []string `json:"keys,omitempty"`
	Clicks      float64  `json:"clicks"`
	Impressions float64  `json:"impressions"`
}

func (a *App) measureGoogleArticle(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "property", "slug")
	ctx := r.Context()
	post := a.readablePost(ctx, stringField(input, "slug", 1, 200, true))
	property, origin, token := a.googleTarget(r, input)
	canonical := readableLinks(post, origin).str("canonical")
	address := googleWebmasters + "/" + url.PathEscape(property) + "/searchAnalytics/query"
	end := time.Now().UTC().AddDate(0, 0, -3)
	query := Row{"startDate": end.AddDate(0, 0, -27).Format(time.DateOnly), "endDate": end.Format(time.DateOnly), "dataState": "final", "type": "web",
		"dimensionFilterGroups": []Row{{"filters": []Row{{"dimension": "page", "operator": "equals", "expression": canonical}}}}}
	var totals struct{ Rows []googleTrafficRow }
	a.publishingRequest(ctx, token, "POST", address, query, &totals)
	// Query rows omit anonymized searches. Use the ungrouped response for the page totals.
	query["dimensions"] = []string{"query"}
	query["rowLimit"] = 10
	var top struct{ Rows []googleTrafficRow }
	a.publishingRequest(ctx, token, "POST", address, query, &top)
	result := Row{"url": canonical, "startDate": query["startDate"], "endDate": query["endDate"], "totals": nil, "queries": top.Rows}
	if len(totals.Rows) > 0 {
		result["totals"] = totals.Rows[0]
	}
	a.recordGoogleMeasurement(ctx, post.str("id"), property, canonical, "performance", result)
	send(w, 200, result)
}
