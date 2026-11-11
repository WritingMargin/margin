package blog

import (
	"context"
	"fmt"
	"testing"
)

func TestWorkspacePagination(t *testing.T) {
	a, s := homepageFixture(t)
	for i := 1; i <= 100; i++ {
		a.DB.Must(context.Background(), "UPDATE posts SET updated_at=$1 WHERE slug=$2", fmt.Sprintf("2026-10-15T09:%02d:%02d.000Z", i/60, i%60), fmt.Sprintf("story-%03d", i))
	}
	s.onGet = func(string) { t.Fatal("Post list should not read article bodies") }
	expectStatus(t, request(t, a, "GET", "/api/posts/page", nil, false), 401)
	first := responseRow(t, request(t, a, "GET", "/api/posts/page?status=published", nil, true), 200)
	assertHomepagePage(t, first, 1, 10, 100, 10)
	if object(first["posts"].([]any)[0]).str("slug") != "story-100" {
		t.Fatal(first)
	}
	second := responseRow(t, request(t, a, "GET", "/api/posts/page?page=2&pageSize=25&status=published", nil, true), 200)
	assertHomepagePage(t, second, 2, 25, 100, 25)
	if object(second["posts"].([]any)[0]).str("slug") != "story-075" {
		t.Fatal(second)
	}
	last := responseRow(t, request(t, a, "GET", "/api/posts/page?page=999&pageSize=10", nil, true), 200)
	assertHomepagePage(t, last, 11, 10, 101, 1)
	all := responseRow(t, request(t, a, "GET", "/api/posts/page", nil, true), 200)
	assertHomepagePage(t, all, 1, 10, 101, 10)
	for _, q := range []string{"page=0", "page=-1", "page=x", "pageSize=0", "pageSize=-1", "pageSize=101", "pageSize=1.5", "pageSize=x", "pageSize=10&pageSize=25", "status=nope"} {
		expectStatus(t, request(t, a, "GET", "/api/posts/page?"+q, nil, true), 400)
	}
}
func TestWorkspaceSearchPagination(t *testing.T) {
	a, _ := homepageFixture(t)
	page := responseRow(t, request(t, a, "GET", "/api/posts/page?q=moonstone&page=2&pageSize=25", nil, true), 200)
	assertHomepagePage(t, page, 2, 25, 101, 25)
	containsHTML(t, encode(page), "searchSnippet", "moonstone")
	draft := responseRow(t, request(t, a, "GET", "/api/posts/page?q=moonstone&status=draft", nil, true), 200)
	assertHomepagePage(t, draft, 1, 10, 1, 1)
	containsHTML(t, encode(draft), "Secret draft")
	empty := responseRow(t, request(t, a, "GET", "/api/posts/page?q=nonexistent&page=9", nil, true), 200)
	assertHomepagePage(t, empty, 1, 10, 0, 0)
	// A deleted final-page item clamps the next response to the previous page.
	a.DB.Must(context.Background(), "DELETE FROM posts WHERE status='draft'")
	last := responseRow(t, request(t, a, "GET", "/api/posts/page?page=11", nil, true), 200)
	assertHomepagePage(t, last, 10, 10, 100, 10)
}

func TestWorkspacePagesReflectSavedPosts(t *testing.T) {
	a, _ := coreFixture(t)
	created := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "New draft", "slug": "new-draft", "content": "first draft"}, true), 201)
	first := responseRow(t, request(t, a, "GET", "/api/posts/page", nil, true), 200)
	assertHomepagePage(t, first, 1, 10, 1, 1)
	updated := responseRow(t, request(t, a, "PUT", "/api/posts/"+created.str("id"), Row{"revision": created.str("revision"), "title": "Revised draft", "content": "bodytokenafteredit"}, true), 200)
	page := responseRow(t, request(t, a, "GET", "/api/posts/page?q=bodytokenafteredit", nil, true), 200)
	assertHomepagePage(t, page, 1, 10, 1, 1)
	if object(page["posts"].([]any)[0]).str("revision") != updated.str("revision") {
		t.Fatal(page)
	}
}
