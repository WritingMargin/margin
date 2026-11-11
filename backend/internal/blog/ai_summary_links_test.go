package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestSummaryLinksPreserveCopyAndAvoidDuplicates(t *testing.T) {
	link := "https://stories.example/blog/post/room"
	for _, text := range []string{"A thoughtful summary.", "Read " + link, "Read [the post](" + link + ").", "Another story: " + link + "-two", ""} {
		got := summariesWithPostURL([]any{Row{"platform": "x", "text": text}}, link)[0]
		want := text
		if text == "A thoughtful summary." || text == "" || strings.HasSuffix(text, "-two") {
			want = strings.TrimSpace(text + "\n\n" + link)
		}
		if got.str("text") != want || got.str("platform") != "x" {
			t.Fatalf("got %#v, want %q", got, want)
		}
	}
}

func TestGeneratedSummaryPersistsCanonicalPostURL(t *testing.T) {
	for _, domain := range []string{"", "https://stories.example.com"} {
		t.Run(domain, func(t *testing.T) { testGeneratedSummaryPostURL(t, domain) })
	}
}

func testGeneratedSummaryPostURL(t *testing.T, domain string) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	platforms := []string{"x", "linkedin", "instagram", "facebook", "threads", "devto", "substack", "medium"}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		var sent Row
		must(json.NewDecoder(r.Body).Decode(&sent))
		if encode(sent["platforms"]) != encode(platforms) {
			t.Fatal("generation lost selected platforms", sent["platforms"])
		}
		items := []Row{}
		for _, platform := range platforms {
			items = append(items, Row{"platform": platform, "text": "A thoughtful summary."})
		}
		return fixtureResponse(Row{"summaries": items}), nil
	})
	if domain != "" {
		expectStatus(t, request(t, a, "PUT", "/blog/api/settings/domain", Row{"url": domain}, true), 200)
	}
	post := responseRow(t, request(t, a, "POST", "/blog/api/posts", Row{"title": "Article", "slug": "old-slug", "content": "Body", "status": "published"}, true), 201)
	a.DB.Must(context.Background(), "UPDATE posts SET slug='current-slug' WHERE id=$1", post["id"])
	input := Row{"postId": post["id"], "title": "Article", "content": "Body", "tone": "natural", "platforms": platforms, "url": "https://wrong.example/not-this-post"}
	generated := responseRow(t, request(t, a, "POST", "/blog/api/ai/summaries", input, true), 201)
	origin := "https://usefused.com"
	if domain != "" {
		origin = domain
	}
	link := origin + "/blog/post/current-slug"
	for _, value := range arrayValue(generated, "summaries") {
		text := object(value).str("text")
		if !strings.HasSuffix(text, "\n\n"+link) || strings.Contains(text, "wrong.example") {
			t.Fatal("summary missing its server-owned post URL", text)
		}
	}
	history := responseRow(t, request(t, a, "GET", "/blog/api/ai/history?postId="+post.str("id"), nil, true), 200)
	saved := object(arrayValue(history, "summaries")[0])
	if encode(saved["summaries"]) != encode(generated["summaries"]) {
		t.Fatal("history lost the post links", saved)
	}
}
