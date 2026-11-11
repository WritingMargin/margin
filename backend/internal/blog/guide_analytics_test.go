package blog

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestGuideAnalyticsCountsExplicitCurrentStepsAndProtectsReaderData(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("guide-analytics")
	input["contentType"], input["status"], input["content"] = "guide", "published", "# Title\n\n## Start\n\nFirst.\n\n### Detail\n\nDetails.\n\n## Finish\n\nDone."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	reader := commentCookie(t, a, "guide-analytics-reader", "email", "private@example.test")
	other := commentCookie(t, a, "guide-analytics-other", "email", "other@example.test")
	base := "/api/public/posts/" + post.str("id")
	save := Row{"section": "section-detail", "revision": post["revision"]}
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-progress", save, other, "http://blog.test"), 200)
	for _, section := range []string{"section-start", "section-finish", "section-detail"} {
		save["section"], save["completed"] = section, true
		expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, "http://blog.test"), 200)
	}
	report := Row{"section": "section-start", "revision": post["revision"], "body": "The first command fails."}
	expectStatus(t, commentAuthRequest(a, "POST", base+"/guide-reports", report, other, "http://blog.test"), 201)
	path := "/api/readers/guides/" + post.str("id")
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	expectStatus(t, commentAuthRequest(a, "GET", path, nil, reader, ""), 401)
	expectStatus(t, tokenRequest(a, roleToken(t, a, "reader"), "GET", path, nil), 403)
	response := request(t, a, "GET", path, nil, true)
	page := responseRow(t, response, 200)
	if !strings.Contains(response.Header().Get("Cache-Control"), "no-store") {
		t.Fatal("reader analytics must not be cached")
	}
	if encode(page["summary"]) != `{"finished":1,"readers":2,"reports":1}` {
		t.Fatal(page)
	}
	if len(page["steps"].([]any)) != 2 || strings.Contains(encode(page), "@example.test") {
		t.Fatal("wrong steps or leaked email", page)
	}
	assertGuideReaderResponses(t, a, path, page)
	// Deleting a heading must remove its completion from current totals.
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "## Replacement\n\nNew instructions."}, true), 200)
	page = responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if object(page["summary"])["finished"].(float64) != 0 || object(page["steps"].([]any)[0])["completed"].(float64) != 0 {
		t.Fatal("removed steps counted", page)
	}
}

func assertGuideReaderResponses(t *testing.T, a *App, path string, page Row) {
	t.Helper()
	for _, value := range page["readers"].([]any) {
		row := object(value)
		if row["reports"].(float64) == 1 {
			if len(row["completed"].([]any)) != 0 || row.str("section") != "Start / Detail" {
				t.Fatal("reading or reporting was counted as completion", row)
			}
			reports := responseRow(t, request(t, a, "GET", path+"/readers/"+row.str("id"), nil, true), 200)
			if object(reports["reports"].([]any)[0]).str("body") != "The first command fails." {
				t.Fatal(reports)
			}
		} else if len(row["completed"].([]any)) != 2 {
			t.Fatal("subheadings counted as steps", row)
		}
	}
}

func TestGuideAnalyticsPaginationAndGuideIsolation(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("guide-pages")
	input["contentType"], input["content"] = "guide", "## Start\n\nFirst."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	ctx := context.Background()
	for i := range 21 {
		id := fmt.Sprintf("analytics-reader-%02d", i)
		a.DB.Must(ctx, "INSERT INTO comment_readers(id,identity,provider,email,name) VALUES($1,$1,'email','', $1)", id)
		a.DB.Must(ctx, "INSERT INTO reader_guide_steps(reader_id,post_id,section) VALUES($1,$2,'section-start')", id, post["id"])
		a.DB.Must(ctx, "INSERT INTO section_flags(id,post_id,reader_id,source_revision,quote,occurrence,position,kind,body,display_name) VALUES($1,$2,'analytics-reader-00',$3,'Start',0,0,'unclear',$1,'Reader')", id, post["id"], post["revision"])
		a.DB.Must(ctx, "INSERT INTO guide_step_flags(flag_id,section) VALUES($1,'section-start')", id)
	}
	path := "/api/readers/guides/" + post.str("id")
	firstPage := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	next := responseRow(t, request(t, a, "GET", path+"?offset=20", nil, true), 200)
	if !firstPage.yes("hasMore") || next.yes("hasMore") || len(next["readers"].([]any)) != 1 {
		t.Fatal(firstPage, next)
	}
	if encode(firstPage["summary"]) != encode(next["summary"]) {
		t.Fatal("totals changed with pagination")
	}
	reports := responseRow(t, request(t, a, "GET", path+"/readers/analytics-reader-00?offset=20", nil, true), 200)
	if reports.yes("hasMore") || len(reports["reports"].([]any)) != 1 {
		t.Fatal(reports)
	}
	input["slug"] = "other-guide"
	other := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	isolated := responseRow(t, request(t, a, "GET", "/api/readers/guides/"+other.str("id")+"/readers/analytics-reader-00", nil, true), 200)
	if len(isolated["reports"].([]any)) != 0 {
		t.Fatal("reports leaked across guides")
	}
	expectStatus(t, request(t, a, "GET", path+"?offset=-1", nil, true), 400)
	article := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("ordinary-article"), true), 201)
	expectStatus(t, request(t, a, "GET", "/api/readers/guides/"+article.str("id"), nil, true), 404)
}
