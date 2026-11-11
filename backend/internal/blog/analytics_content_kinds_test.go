package blog

import "testing"

func testAnalyticsContentKinds(t *testing.T, app *App) {
	t.Helper()
	items := map[string]Row{}
	for _, kind := range []string{"article", "guide"} {
		items[kind] = responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": kind, "slug": "analytics-" + kind, "content": "A useful passage for readers.", "contentType": kind, "status": "published", "tags": []string{"shared"}}, true), 201)
		batch := analyticsPayload(items[kind])
		batch["sections"] = []Row{{"id": "intro", "label": "Introduction", "activeMs": 1000}}
		batch["events"] = []Row{{"id": uuid(), "kind": "copy", "target": "A useful passage", "sectionId": "intro"}}
		analyticsSubmit(t, app, batch)
	}
	analyticsSubmit(t, app, analyticsPayload(nil))
	report := responseRow(t, request(t, app, "GET", "/api/analytics", nil, true), 200)
	assertAnalyticsNumber(t, object(report["summary"]), "views", 3)
	if len(report["contentKinds"].([]any)) != 2 {
		t.Fatal("content types missing", report["contentKinds"])
	}
	for _, kind := range []string{"article", "guide"} {
		filtered := responseRow(t, request(t, app, "GET", "/api/analytics?contentType="+kind, nil, true), 200)
		assertAnalyticsNumber(t, object(filtered["summary"]), "views", 1)
		assertAnalyticsNumber(t, object(filtered["classificationCoverage"]), "views", 1)
		for _, key := range []string{"pages", "sections", "passages", "tags", "contentKinds", "daily"} {
			if len(filtered[key].([]any)) != 1 {
				t.Fatal("filter not applied to", key, filtered[key])
			}
		}
		if object(filtered["contentKinds"].([]any)[0]).str("label") != kind {
			t.Fatal(filtered["contentKinds"])
		}
	}
	guide := items["guide"]
	changed := responseRow(t, request(t, app, "PUT", "/api/posts/"+guide.str("id"), Row{"revision": guide["revision"], "contentType": "article"}, true), 200)
	analyticsSubmit(t, app, analyticsPayload(changed))
	assertAnalyticsNumber(t, analyticsSummary(t, app, "?contentType=guide"), "views", 1)
	assertAnalyticsNumber(t, analyticsSummary(t, app, "?contentType=article"), "views", 2)
	assertAnalyticsNumber(t, analyticsSummary(t, app, "?contentType=guide&page=home"), "views", 0)
	expectStatus(t, request(t, app, "GET", "/api/analytics?contentType=unknown", nil, true), 400)
	spoof := analyticsPayload(changed)
	spoof["contentType"] = "guide"
	expectStatus(t, request(t, app, "POST", "/api/public/analytics", spoof, false), 400)
}
func TestAnalyticsContentKinds(t *testing.T) {
	app, _ := coreFixture(t)
	testAnalyticsContentKinds(t, app)
}
func TestAnalyticsPostgresContentKinds(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	app, _ := postgresApp(t, db)
	testAnalyticsContentKinds(t, app)
}

func TestAnalyticsClassificationRespectsContentTypeFilter(t *testing.T) {
	app, _ := coreFixture(t)
	items := map[string]Row{}
	for _, kind := range []string{"article", "guide"} {
		items[kind] = responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": kind, "slug": "classify-" + kind, "content": "Useful content.", "contentType": kind, "status": "published"}, true), 201)
	}
	for _, kind := range []string{"article", "guide"} {
		result := responseRow(t, request(t, app, "GET", "/api/analytics/classification?contentType="+kind, nil, true), 200)
		assertAnalyticsNumber(t, result, "pending", 1)
		assertAnalyticsNumber(t, result, "published", 1)
		queue := result["queue"].([]any)
		if len(queue) != 1 || object(queue[0])["id"] != items[kind]["id"] {
			t.Fatal("classification queue ignores selected type", result)
		}
	}
	mismatch := responseRow(t, request(t, app, "GET", "/api/analytics/classification?contentType=guide&page="+items["article"].str("id"), nil, true), 200)
	assertAnalyticsNumber(t, mismatch, "pending", 0)
	expectStatus(t, request(t, app, "GET", "/api/analytics/classification?contentType=unknown", nil, true), 400)
}
