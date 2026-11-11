package blog

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func homepageFixture(t *testing.T) (*App, *testStorage) {
	t.Helper()
	a, s := coreFixture(t)
	for i := 1; i <= 100; i++ {
		status := "published"
		topic := "Writing"
		if i%2 == 0 {
			topic = "Design"
		}
		post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": fmt.Sprintf("Story %03d", i), "slug": fmt.Sprintf("story-%03d", i), "content": "A unique body-only search phrase: moonstone.", "status": status, "tags": []string{topic}}, true), 201)
		a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1 WHERE id=$2", fmt.Sprintf("2026-10-15T09:%02d:%02d.000Z", i/60, i%60), post["id"])
	}
	responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Secret draft", "slug": "secret-draft", "content": "moonstone", "tags": []string{"Secret"}}, true), 201)
	return a, s
}
func TestHomepagePagination(t *testing.T) {
	a, s := homepageFixture(t)
	s.onGet = func(string) { t.Fatal("homepage fetched an article body") }
	first := responseRow(t, request(t, a, "GET", "/api/public/homepage", nil, false), 200)
	assertHomepagePage(t, first, 1, 10, 100, 10)
	if object(first["posts"].([]any)[0]).str("slug") != "story-100" {
		t.Fatal(first)
	}
	second := responseRow(t, request(t, a, "GET", "/api/public/homepage?page=2", nil, false), 200)
	assertHomepagePage(t, second, 2, 10, 100, 10)
	if object(second["posts"].([]any)[0]).str("slug") != "story-090" {
		t.Fatal(second)
	}
	last := responseRow(t, request(t, a, "GET", "/api/public/homepage?page=999", nil, false), 200)
	assertHomepagePage(t, last, 10, 10, 100, 10)
	excludesHTML(t, encode(first), "Secret draft", "Secret", "moonstone", "story-001")
	html := request(t, a, "GET", "/?page=2", nil, false)
	expectStatus(t, html, 200)
	containsHTML(t, html.Body.String(), "Story 090", "Story 081", `href="/?page=3"`, ">11</span>", `rel="canonical" href="http://blog.test/?page=2"`)
	excludesHTML(t, html.Body.String(), "Story 100", "Story 080", "Secret draft")
}
func assertHomepagePage(t *testing.T, row Row, page, size, total, count int) {
	t.Helper()
	if row["page"] != float64(page) || row["pageSize"] != float64(size) || row["total"] != float64(total) || len(row["posts"].([]any)) != count {
		t.Fatal(row)
	}
}
func TestHomepageSearchAndTopicsPaginateAcrossCollection(t *testing.T) {
	a, _ := homepageFixture(t)
	result := responseRow(t, request(t, a, "GET", "/api/public/homepage?q=moonstone&tag=Design&page=2", nil, false), 200)
	assertHomepagePage(t, result, 2, 10, 50, 10)
	containsHTML(t, encode(result), "searchSnippet", "moonstone")
	for _, p := range result["posts"].([]any) {
		if !containsTopic(rssTags(object(p)["tags"]), "Design") {
			t.Fatal(p)
		}
	}
	empty := responseRow(t, request(t, a, "GET", "/api/public/homepage?tag=Missing&page=5", nil, false), 200)
	assertHomepagePage(t, empty, 1, 10, 0, 0)
	for _, query := range []string{"page=0", "page=-1", "page=abc", "page=1.5", "q=" + strings.Repeat("x", 201)} {
		expectStatus(t, request(t, a, "GET", "/api/public/homepage?"+query, nil, false), 400)
	}
}
func TestHomepageMultipleTopicsAndTopTen(t *testing.T) {
	a, _ := homepageFixture(t)
	result := responseRow(t, request(t, a, "GET", "/api/public/homepage?tag=Writing&tag=Design&page=2", nil, false), 200)
	assertHomepagePage(t, result, 2, 10, 100, 10)
	selected := result["selectedTags"].([]any)
	if len(selected) != 2 || selected[0] != "Design" || selected[1] != "Writing" {
		t.Fatal(selected)
	}
	for _, post := range result["posts"].([]any) {
		tags := rssTags(object(post)["tags"])
		if !containsAnyTopic(tags, []string{"Design", "Writing"}) {
			t.Fatal(post)
		}
	}
	counts := object(result["tagCounts"])
	if counts["Design"] != float64(50) || counts["Writing"] != float64(50) {
		t.Fatal(counts)
	}
	searched := responseRow(t, request(t, a, "GET", "/api/public/homepage?q=moonstone&tag=Writing&tag=Design", nil, false), 200)
	assertHomepagePage(t, searched, 1, 10, 100, 10)
	html := request(t, a, "GET", "/?tag=Writing&tag=Design", nil, false)
	expectStatus(t, html, 200)
	containsHTML(t, html.Body.String(), `type="checkbox" name="tag" value="Design" checked`, `type="checkbox" name="tag" value="Writing" checked`, `Topics (2)`)
}

func TestHomepageTagAggregationSQLite(t *testing.T) {
	a, _ := coreFixture(t)
	assertHomepageTagAggregation(t, a)
}

func TestHomepageTagAggregationPostgres(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	assertHomepageTagAggregation(t, a)
}

func assertHomepageTagAggregation(t *testing.T, a *App) {
	t.Helper()
	seedHomepageTagAggregation(a)
	tags, top, counts := a.homepageTags(httptest.NewRequest("GET", "http://blog.test/", nil))
	if len(tags) != 12 || len(top) != 10 || counts["Topic05"] != 2 || counts["Topic00"] != 1 || counts["Secret"] != 0 {
		t.Fatal(tags, top, counts)
	}
	for i, tag := range tags {
		if tag != fmt.Sprintf("Topic%02d", i) {
			t.Fatal("topics must be alphabetical", tags)
		}
	}
	wantTop := []string{"Topic05", "Topic00", "Topic01", "Topic02", "Topic03", "Topic04", "Topic06", "Topic07", "Topic08", "Topic09"}
	for i, tag := range top {
		if tag != wantTop[i] {
			t.Fatal("top topics must rank by distinct posts then name", top)
		}
	}
}
func seedHomepageTagAggregation(a *App) {
	ctx := context.Background()
	for i := 0; i < 12; i++ {
		a.DB.Must(ctx, `INSERT INTO posts(id,title,slug,excerpt,status,tags,content_key,revision)
			VALUES($1,$2,$3,'','published',$4,'unused',$5)`, uuid(), "Story", fmt.Sprintf("topic-%02d", i), encode([]string{fmt.Sprintf("Topic%02d", i)}), uuid())
	}
	a.DB.Must(ctx, `INSERT INTO posts(id,title,slug,excerpt,status,tags,content_key,revision)
		VALUES($1,'Repeated topic','repeat-topic','','published',$2,'unused',$3)`, uuid(), encode([]any{"Topic05", "Topic05", 42}), uuid())
	a.DB.Must(ctx, `INSERT INTO posts(id,title,slug,excerpt,status,tags,content_key,revision)
		VALUES($1,'Draft topic','draft-topic','','draft',$2,'unused',$3)`, uuid(), encode([]string{"Secret"}), uuid())
}
func TestHomepagePaginationSettingsAndBasePath(t *testing.T) {
	a, _ := homepageFixture(t)
	theme := a.settings(context.Background())
	design := object(theme["homepage"])
	design["pageSize"], design["pagination"] = float64(7), "more"
	expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
	result := responseRow(t, request(t, a, "GET", "/api/public/homepage?page=15", nil, false), 200)
	assertHomepagePage(t, result, 15, 7, 100, 2)
	for _, size := range []any{0, 101, 1.5, "ten"} {
		design["pageSize"] = size
		expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 400)
	}
	delete(design, "pageSize")
	delete(design, "pagination")
	saved := responseRow(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
	if object(saved["homepage"])["pageSize"] != float64(10) {
		t.Fatal(saved)
	}
	design["pagination"] = "infinite"
	expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 400)
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	h := a.homepageData(httptest.NewRequest("GET", "http://blog.test/journal/?page=2&tag=Design", nil), a.settings(context.Background()))
	if h.NextURL() != "/journal/?page=3&tag=Design" {
		t.Fatal(h.NextURL())
	}
}
