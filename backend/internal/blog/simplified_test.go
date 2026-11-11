package blog

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestSimplifiedMarkdownStaysStatic(t *testing.T) {
	markup := simplifiedMarkdown(":::poll\nAgree?\n:::\n\n```poll\n{\"question\":\"Agree?\"}\n```\n\n<script>alert(1)</script>", "https://example.com/post/example")
	if strings.Contains(markup, "<script") || strings.Contains(markup, "<div") || !strings.Contains(markup, "language-poll") {
		t.Fatalf("simplified content was interpreted as a rich block: %s", markup)
	}
}

func TestSimplifiedArticleLifecycle(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "A careful article", "slug": "careful", "content": "The original article has a specific point.", "status": "published"}, true), 201)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/careful/simplified", nil, false), 404)
	a.saveSiteSetting(context.Background(), "simplified", Row{"enabled": true})
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/generations/simplified" {
			t.Fatalf("unexpected Central route: %s", r.URL.Path)
		}
		calls++
		return fixtureResponse(Row{"content": "The article makes one careful point."}), nil
	})
	postRow := first(a.DB.Must(context.Background(), "SELECT * FROM posts WHERE id=$1", post["id"]))
	a.queueSimplified(postRow.str("id"), postRow.str("revision"))
	a.resumeSimplifiedJobs()
	if calls != 1 {
		t.Fatalf("generation calls = %d", calls)
	}
	version := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/simplified", nil, true), 200)
	if version.str("status") != "ready" || version.str("content") != "The article makes one careful point." {
		t.Fatal(version)
	}
	checkSimplifiedPublication(t, a, version)
	checkSimplifiedWriterHistory(t, a, post, version)
}

func checkSimplifiedPublication(t *testing.T, a *App, version Row) {
	t.Helper()
	public := responseRow(t, request(t, a, "GET", "/api/public/posts/careful/simplified", nil, false), 200)
	if public.str("content") != version.str("content") || !public.yes("simplified") {
		t.Fatal(public)
	}
	page := request(t, a, "GET", "/post/careful/simplified", nil, false)
	html := page.Body.String()
	containsHTML(t, html, `<link rel="canonical" href="http://blog.test/post/careful">`, "AI-generated simplified version", "The article makes one careful point.")
	if !strings.Contains(page.Header().Get("Set-Cookie"), "margin_reading_view=simplified") {
		t.Fatal("direct simplified URL did not remember the reader's choice")
	}
	standard := request(t, a, "GET", "/post/careful?view=standard", nil, false)
	if !strings.Contains(standard.Header().Get("Set-Cookie"), "margin_reading_view=standard") {
		t.Fatal("standard switch did not remember the reader's choice")
	}
	a.saveSiteSetting(context.Background(), "simplified", Row{"enabled": false})
	expectStatus(t, request(t, a, "GET", "/post/careful/simplified", nil, false), 200)
	a.saveSiteSetting(context.Background(), "simplified", Row{"enabled": true})
}

func checkSimplifiedWriterHistory(t *testing.T, a *App, post, version Row) {
	t.Helper()
	updated := responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id")+"/simplified", Row{"sourceRevision": post["revision"], "writerRevision": version["writerRevision"], "content": "An edited concise point.", "reviewed": true, "hidden": true}, true), 200)
	if updated.str("status") != "hidden" || !updated.yes("reviewed") {
		t.Fatal(updated)
	}
	history := responseRows(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/simplified/history", nil, true))
	if len(history) != 2 || history[0].str("status") != "hidden" || history[1].str("content") != version.str("content") {
		t.Fatalf("writer history = %v", history)
	}
	expectStatus(t, request(t, a, "PUT", "/api/posts/"+post.str("id")+"/simplified", Row{"sourceRevision": post["revision"], "writerRevision": version["writerRevision"], "content": "Stale edit", "reviewed": false, "hidden": false}, true), 409)
	if rows := responseRows(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/simplified/history", nil, true)); len(rows) != 2 {
		t.Fatalf("stale edit changed history: %v", rows)
	}
	expectStatus(t, request(t, a, "GET", "/post/careful/simplified", nil, false), 404)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/careful/simplified", nil, false), 404)
}

func TestSimplifiedExplicitGenerationForOlderArticle(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Older article", "slug": "older", "content": "A clear source article.", "status": "published"}, true), 201)
	a.saveSiteSetting(context.Background(), "simplified", Row{"enabled": true})
	expectStatus(t, request(t, a, "GET", "/api/public/posts/older/simplified", nil, false), 404)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"content": "A short older article."}), nil
	})
	expectStatus(t, request(t, a, "POST", "/api/posts/"+post.str("id")+"/simplified/generate", Row{}, true), 202)
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
		version := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/simplified", nil, true), 200)
		if version.str("status") == "ready" {
			expectStatus(t, request(t, a, "POST", "/api/posts/"+post.str("id")+"/simplified/generate", Row{}, true), 409)
			return
		}
	}
	t.Fatal("explicit Simplified generation did not complete")
}
