package blog

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestArticleAuditIndexIntent(t *testing.T) {
	a, _, _ := publicFixture(t)
	article := Row{"title": "Private link", "slug": "private-link", "content": "A deliberate test.", "seo": Row{"noindex": true}}
	input := Row{"article": article}
	read := func() map[string]string {
		t.Helper()
		resp := request(t, a, "POST", "/api/posts/audit", input, true)
		expectStatus(t, resp, 200)
		var report articleAuditReport
		must(json.Unmarshal(resp.Body.Bytes(), &report))
		result := map[string]string{}
		for _, f := range report.Findings {
			result[f.Code] = f.Severity
			if f.Field == "" || f.Why == "" || f.Fix == "" {
				t.Fatal(f)
			}
		}
		return result
	}
	if findings := read(); findings["article.index_intent"] != "" || findings["article.image"] != "warning" || findings["author.name"] != "warning" {
		t.Fatal(findings)
	}
	input["intent"] = "index"
	article["slug"] = "BAD path"
	if findings := read(); findings["article.index_intent"] != "warning" || findings["article.slug"] != "error" {
		t.Fatal(findings)
	}
	input["mode"] = "public"
	expectStatus(t, request(t, a, "POST", "/api/posts/audit", input, true), 400)
}

func TestArticleAuditVerifiesDeliveredHTML(t *testing.T) {
	a, _, saved := publishingFixture(t)
	origin := "https://publisher.example.com/journal"
	profile := Row{"name": "Test Writer", "website": "https://example.com/author", "image": "", "links": []any{}, "bio": ""}
	expectStatus(t, request(t, a, "PUT", "/journal/api/settings/profile", profile, true), 200)
	theme := a.settings(context.Background())
	theme["seo"] = a.seoSettings(context.Background())
	theme["authorProfile"] = profile
	item := a.postContent(context.Background(), a.getPost(context.Background(), saved.str("id")))
	report := articleAuditReport{URL: origin + "/post/crawlable", Intent: "index"}
	body := request(t, a, "GET", "/journal/post/crawlable", nil, false)
	expectStatus(t, body, 200)
	html := body.Body.String()
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != report.URL || r.Header.Get("Authorization") != "" {
			t.Fatal("unsafe public request")
		}
		resp := fixtureResponse(Row{})
		resp.Body = io.NopCloser(strings.NewReader(html))
		resp.Header.Set("Content-Type", "text/html; charset=utf-8")
		return resp, nil
	})}
	report.fetchPublic(context.Background(), client, item, theme)
	if len(report.Findings) != 0 {
		t.Fatalf("Correct HTML reported as stale: %+v", report.Findings)
	}
	html = strings.Replace(html, "og:url", "og:wrong", 1)
	report.fetchPublic(context.Background(), client, item, theme)
	if len(report.Findings) != 1 || report.Findings[0].Code != "public.canonical" {
		t.Fatal(report.Findings)
	}
}
