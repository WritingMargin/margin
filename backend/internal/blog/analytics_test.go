package blog

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func analyticsPayload(post Row) Row {
	id, revision := "", ""
	if post != nil {
		id, revision = post.str("id"), post.str("revision")
	}
	return Row{"viewId": uuid(), "sessionId": uuid(), "postId": id, "revision": revision, "activeMs": 12000, "scrollDepth": 60, "sections": []Row{}, "events": []Row{}}
}
func analyticsSubmit(t *testing.T, a *App, payload Row) {
	t.Helper()
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 204)
}
func analyticsSummary(t *testing.T, a *App, query string) Row {
	t.Helper()
	return object(responseRow(t, request(t, a, "GET", "/api/analytics"+query, nil, true), 200)["summary"])
}
func assertAnalyticsNumber(t *testing.T, row Row, key string, want float64) {
	t.Helper()
	if row[key] != want {
		t.Fatalf("%s: got %v, want %v", key, row[key], want)
	}
}
func TestAnalyticsRetriesAndReport(t *testing.T) {
	a, post := interactionFixture(t)
	testAnalyticsReport(t, a, post)
}
func testAnalyticsReport(t *testing.T, a *App, post Row) {
	t.Helper()
	payload := analyticsPayload(post)
	event := Row{"id": uuid(), "kind": "highlight", "target": "A little room for ideas.", "sectionId": "intro"}
	payload["sections"] = []Row{{"id": "intro", "label": "Introduction", "activeMs": 9000}}
	payload["events"] = []Row{event}
	analyticsSubmit(t, a, payload)
	analyticsSubmit(t, a, payload)
	payload["activeMs"], payload["scrollDepth"] = 8000, 25
	payload["sections"] = []Row{{"id": "intro", "label": "Introduction", "activeMs": 6000}}
	analyticsSubmit(t, a, payload)
	report := responseRow(t, request(t, a, "GET", "/api/analytics", nil, true), 200)
	summary := object(report["summary"])
	assertAnalyticsNumber(t, summary, "views", 1)
	assertAnalyticsNumber(t, summary, "active_ms", 12000)
	assertAnalyticsNumber(t, summary, "scroll_depth", 60)
	sections := report["sections"].([]any)
	assertAnalyticsNumber(t, object(sections[0]), "active_ms", 9000)
	passages := report["passages"].([]any)
	assertAnalyticsNumber(t, object(passages[0]), "highlights", 1)
	assertAnalyticsNumber(t, object(passages[0]), "copies", 0)
	payload["events"] = []Row{{"id": uuid(), "kind": "copy", "target": event["target"], "sectionId": "intro"}, {"id": uuid(), "kind": "click", "target": "https://example.test/story?email=private#token", "sectionId": ""}}
	analyticsSubmit(t, a, payload)
	report = responseRow(t, request(t, a, "GET", "/api/analytics", nil, true), 200)
	assertAnalyticsNumber(t, object(report["passages"].([]any)[0]), "copies", 1)
	if got := object(report["clicks"].([]any)[0]).str("target"); got != "https://example.test/story" {
		t.Fatal(got)
	}
	payload["sessionId"] = uuid()
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
}
func TestAnalyticsFiltersAndComments(t *testing.T) {
	a, post := interactionFixture(t)
	analyticsSubmit(t, a, analyticsPayload(nil))
	analyticsSubmit(t, a, analyticsPayload(post))
	askPassage(t, a, post)
	summary := analyticsSummary(t, a, "")
	assertAnalyticsNumber(t, summary, "views", 2)
	assertAnalyticsNumber(t, summary, "comments", 1)
	assertAnalyticsNumber(t, summary, "approved_comments", 0)
	home := analyticsSummary(t, a, "?page=home")
	assertAnalyticsNumber(t, home, "views", 1)
	assertAnalyticsNumber(t, home, "comments", 0)
	article := analyticsSummary(t, a, "?page="+post.str("id"))
	assertAnalyticsNumber(t, article, "views", 1)
	assertAnalyticsNumber(t, article, "comments", 1)
	a.DB.Must(context.Background(), "UPDATE comments SET approved=TRUE")
	assertAnalyticsNumber(t, analyticsSummary(t, a, ""), "approved_comments", 1)
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	assertAnalyticsNumber(t, analyticsSummary(t, a, "?from="+yesterday+"&to="+yesterday), "views", 0)
}
func TestAnalyticsValidationIsAtomic(t *testing.T) {
	a, post := interactionFixture(t)
	cases := []Row{
		{"activeMs": -1}, {"activeMs": 1.5}, {"scrollDepth": 101}, {"viewId": "invalid"}, {"unknown": "field"},
		{"sections": []Row{{"id": "intro", "label": "Intro", "activeMs": 15000}}},
		{"sections": []Row{{"id": "intro", "label": "Intro", "activeMs": 1}, {"id": "intro", "label": "Intro", "activeMs": 1}}},
		{"events": []Row{{"id": uuid(), "kind": "highlight", "target": "PRIVATE NOTE NOT IN ARTICLE"}}},
		{"events": []Row{{"id": uuid(), "kind": "click", "target": "javascript:alert(1)"}}},
		{"events": []Row{{"id": uuid(), "kind": "unknown", "target": "text"}}},
	}
	for _, change := range cases {
		payload := analyticsPayload(post)
		for key, value := range change {
			payload[key] = value
		}
		expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	}
	assertAnalyticsNumber(t, analyticsSummary(t, a, ""), "views", 0)
	payload := analyticsPayload(post)
	payload["revision"] = "stale"
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 409)
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", analyticsPayload(post), false), 404)
}
func TestAnalyticsAuthenticationPrivacyAndOrigin(t *testing.T) {
	a, _ := coreFixture(t)
	expectStatus(t, request(t, a, "GET", "/api/analytics", nil, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", analyticsPayload(nil), true), 204)
	for key, value := range map[string]string{"DNT": "1", "Sec-GPC": "1", "User-Agent": "Example crawler"} {
		r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", strings.NewReader(encode(analyticsPayload(nil))))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set(key, value)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 204)
	}
	assertAnalyticsNumber(t, analyticsSummary(t, a, ""), "views", 0)
	r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", strings.NewReader(encode(analyticsPayload(nil))))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://attacker.example")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 403)
	if tokenRouteAllowed("reader", "GET /api/analytics") {
		t.Fatal("restricted token gained analytics access")
	}
}
func TestAnalyticsIPTrustAndRetention(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	t.Setenv("MARGIN_ANALYTICS_COUNTRY_HEADER", "X-Visitor-Country")
	t.Setenv("TRUST_PROXY", "0")
	r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", nil)
	r.RemoteAddr = "8.8.8.8:1234"
	r.Header.Set("X-Visitor-Country", "pt")
	r.Header.Set("X-Forwarded-For", "1.1.1.1")
	if a.ip(r) != "8.8.8.8" || a.analyticsLocation(r) != "Unknown" {
		t.Fatal("untrusted forwarded IP affected analytics")
	}
	t.Setenv("TRUST_PROXY", "1")
	if a.ip(r) != "1.1.1.1" || a.analyticsLocation(r) != "Unknown" {
		t.Fatal("trusted forwarded IP affected stored analytics")
	}
	payload := analyticsPayload(nil)
	analyticsSubmit(t, a, payload)
	a.DB.Must(context.Background(), "UPDATE analytics_visits SET day='2000-01-01'")
	analyticsSubmit(t, a, analyticsPayload(nil))
	rows := a.DB.Must(context.Background(), "SELECT id FROM analytics_visits")
	if len(rows) != 1 || rows[0].str("id") == payload.str("viewId") {
		t.Fatal(rows)
	}
}
func TestAnalyticsInvalidDatesAndBodyLimit(t *testing.T) {
	a, _ := coreFixture(t)
	for _, query := range []string{"?from=bad", "?from=2020-01-01&to=2021-01-01", "?from=2020-02-01&to=2020-01-01", "?page=bad", "?to=2999-01-01"} {
		expectStatus(t, request(t, a, "GET", "/api/analytics"+query, nil, true), 400)
	}
	payload := analyticsPayload(nil)
	payload["extra"] = strings.Repeat("x", 70<<10)
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 413)
}
func TestAnalyticsPostgres(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Analytics article", "slug": "analytics-article", "content": "A little room for ideas.", "status": "published"}, true), 201)
	testAnalyticsReport(t, a, post)
}

func seedAnalyticsPagination(t *testing.T, a *App) {
	t.Helper()
	countries := []string{"PT", "US", "GB", "DE", "FR", "ES", "IT", "NL", "BE", "IE", "AU", "NZ"}
	for i, country := range countries {
		title := fmt.Sprintf("Field notes %02d", i+1)
		post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": title, "slug": fmt.Sprintf("field-notes-%02d", i+1), "content": "A little room for ideas.\n\n[Audio src=\"https://example.test/episode.mp3\"]", "status": "published"}, true), 201)
		payload := analyticsPayload(post)
		payload["media"] = []Row{{"id": mediaIdentity("audio", "https://example.test/episode.mp3"), "started": true, "playedMs": 1000, "progress": 10, "completed": false, "measurable": true}}
		payload["mediaEvents"] = []Row{{"id": uuid(), "mediaId": mediaIdentity("audio", "https://example.test/episode.mp3"), "kind": "play", "occurredAt": time.Now().UTC().Format(time.RFC3339Nano), "positionMs": 0}}
		payload["sections"] = []Row{{"id": "intro", "label": "Introduction", "activeMs": 9000}}
		payload["events"] = []Row{{"id": uuid(), "kind": "highlight", "target": "A little room for ideas.", "sectionId": "intro"}, {"id": uuid(), "kind": "click", "target": "/post/" + post.str("slug"), "sectionId": ""}}
		analyticsSubmit(t, a, payload)
		a.DB.Must(context.Background(), "UPDATE analytics_visits SET country=$1 WHERE id=$2", country, payload["viewId"])
		a.DB.Must(context.Background(), "INSERT INTO comments(id,post_id,name,email,body) VALUES($1,$2,'Reader','reader@example.test','A thought')", uuid(), post["id"])
	}
}
func TestAnalyticsPagination(t *testing.T) {
	a, _ := coreFixture(t)
	testAnalyticsPagination(t, a)
}
func testAnalyticsPagination(t *testing.T, a *App) {
	t.Helper()
	seedAnalyticsPagination(t, a)
	first := responseRow(t, request(t, a, "GET", "/api/analytics?pageSize=5", nil, true), 200)
	nextQuery, lastQuery := "?pageSize=5", "?pageSize=5"
	for key := range analyticsBreakdowns {
		nextQuery += "&" + key + "Offset=5"
		lastQuery += "&" + key + "Offset=100"
	}
	next := responseRow(t, request(t, a, "GET", "/api/analytics"+nextQuery, nil, true), 200)
	last := responseRow(t, request(t, a, "GET", "/api/analytics"+lastQuery, nil, true), 200)
	for key := range analyticsBreakdowns {
		assertAnalyticsPagination(t, key, first, next, last)
	}
	assertAnalyticsNumber(t, object(first["summary"]), "views", 12)
}
func assertAnalyticsPagination(t *testing.T, key string, first, next, last Row) {
	t.Helper()
	firstRows, nextRows, lastRows := first[key].([]any), next[key].([]any), last[key].([]any)
	if len(firstRows) != 5 || len(nextRows) != 5 || len(lastRows) != 2 {
		t.Fatalf("%s page sizes: %d %d %d", key, len(firstRows), len(nextRows), len(lastRows))
	}
	seen := map[string]bool{}
	for _, row := range firstRows {
		seen[encode(row)] = true
	}
	for _, row := range nextRows {
		if seen[encode(row)] {
			t.Fatalf("%s repeated a row across pages", key)
		}
	}
	info := object(object(last["pagination"])[key])
	assertAnalyticsNumber(t, info, "total", 12)
	assertAnalyticsNumber(t, info, "offset", 10)
}
func TestAnalyticsPaginationValidation(t *testing.T) {
	a, _ := coreFixture(t)
	for _, query := range []string{"pageSize=0", "pageSize=51", "pagesOffset=-1", "passagesOffset=1.5", "clicksOffset=lots"} {
		expectStatus(t, request(t, a, "GET", "/api/analytics?"+query, nil, true), 400)
	}
}
func TestAnalyticsPostgresPagination(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testAnalyticsPagination(t, a)
}
