package blog

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestRootSitemapDiscoveryUsesMainSiteAndReportsUnavailable(t *testing.T) {
	const origin = "https://journal.example.com/blog"
	for _, tc := range []struct {
		body, media string
		status      int
		want        string
	}{
		{"\ufeffUser-agent: *\r\nSITEMAP: https://JOURNAL.example.com/blog/sitemap.xml # article feed\r\n", "text/plain", 200, "found"},
		{"# Sitemap: " + origin + "/sitemap.xml\nSitemap: https://journal.example.com/sitemap.xml", "text/plain", 200, "missing"},
		{"Sitemap: " + origin + "/other.xml", "text/plain", 200, "missing"},
		{"", "text/plain", 404, "missing"},
		{"try again", "text/plain", 503, "unavailable"},
		{"<html>SPA</html>", "text/html", 200, "unavailable"},
	} {
		client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://journal.example.com/robots.txt" || r.Header.Get("Authorization") != "" {
				t.Fatal(r.URL, r.Header)
			}
			return &http.Response{StatusCode: tc.status, Header: http.Header{"Content-Type": []string{tc.media}}, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
		})}
		result := rootSitemapCheck(context.Background(), client, origin)
		if result.str("status") != tc.want || result.str("directive") != "Sitemap: "+origin+"/sitemap.xml" {
			t.Fatal(tc, result)
		}
	}
}

func TestSearchConsoleMeasurementsKeepIndexingSeparateFromQueries(t *testing.T) {
	a, owner, _ := publishingFixture(t)
	const prefix = "/journal/api/settings/publishing/google"
	var queries int
	a.Client.Transport = googleMeasurementProvider(t, &queries)
	connectPublishingFixture(t, a, owner, "google")
	in := Row{"slug": "crawlable", "property": "sc-domain:example.com"}
	expectStatus(t, request(t, a, "POST", prefix+"/inspect", in, true), 200)
	for range 2 {
		expectStatus(t, request(t, a, "POST", prefix+"/performance", in, true), 200)
	}
	result := responseRow(t, request(t, a, "GET", prefix+"/history?property=sc-domain:example.com&slug=crawlable", nil, true), 200)
	history := arrayValue(result, "records")
	if len(history) != 2 || queries != 4 {
		t.Fatal(result)
	}
	performance := object(object(history[0])["snapshot"])
	if object(performance["totals"])["impressions"] != float64(10) || object(arrayValue(performance, "queries")[0])["impressions"] != float64(5) {
		t.Fatal(performance)
	}
	status := responseRow(t, request(t, a, "POST", prefix+"/sitemap-status", Row{"property": in["property"]}, true), 200)
	if status.str("lastDownloaded") == "" {
		t.Fatal(status)
	}
	in["slug"] = "absent"
	expectStatus(t, request(t, a, "POST", prefix+"/performance", in, true), 404)
	expectStatus(t, request(t, a, "GET", prefix+"/history?property=sc-domain:example.com&slug=crawlable", nil, false), 401)
}

func googleMeasurementProvider(t *testing.T, queries *int) testTransport {
	return testTransport(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Path == "/token":
			return fixtureResponse(Row{"access_token": "provider-access", "token_type": "Bearer", "expires_in": 3600}), nil
		case r.URL.Path == "/v1/urlInspection/index:inspect":
			return fixtureResponse(Row{"inspectionResult": Row{"indexStatusResult": Row{"coverageState": "Indexed"}}}), nil
		case strings.HasSuffix(r.URL.Path, "/searchAnalytics/query"):
			*queries++
			return testGoogleQuery(t, r), nil
		case r.Method == "GET" && strings.Contains(r.URL.Path, "/sitemaps/"):
			return fixtureResponse(Row{"lastDownloaded": "2026-10-29T10:00:00Z", "errors": "0"}), nil
		default:
			t.Fatal("unexpected provider call", r.Method, r.URL)
			return nil, nil
		}
	})
}
func testGoogleQuery(t *testing.T, r *http.Request) *http.Response {
	const canonical = "https://publisher.example.com/journal/post/crawlable"
	var q Row
	must(json.NewDecoder(r.Body).Decode(&q))
	filter := object(arrayValue(object(arrayValue(q, "dimensionFilterGroups")[0]), "filters")[0])
	if filter.str("expression") != canonical || filter.str("operator") != "equals" || q.str("dataState") != "final" {
		t.Fatal(q)
	}
	if _, grouped := q["dimensions"]; grouped {
		return fixtureResponse(Row{"rows": []Row{{"keys": []string{"term"}, "impressions": 5, "clicks": 1}}})
	}
	return fixtureResponse(Row{"rows": []Row{{"impressions": 10, "clicks": 2}}})
}
