package blog

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublishedPostLinkLifecycleAndRoles(t *testing.T) {
	app, _, post := publicFixture(t)
	path := "/api/posts/" + post.str("id") + "/link"
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		link := responseRow(t, tokenRequest(app, roleToken(t, app, role), "GET", path, nil), 200)
		if link.str("url") != "http://blog.test/post/crawlable" || link["id"] != post["id"] {
			t.Fatal(link)
		}
	}
	expectStatus(t, request(t, app, "GET", path, nil, false), 401)
	expectStatus(t, request(t, app, "GET", "/api/posts/missing/link", nil, true), 404)
	post = responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "slug": "renamed-story"}, true), 200)
	link := responseRow(t, request(t, app, "GET", path, nil, true), 200)
	if link.str("url") != "http://blog.test/post/renamed-story" {
		t.Fatal("link used an old slug", link)
	}
	containsHTML(t, request(t, app, "GET", "/post/renamed-story", nil, false).Body.String(), `rel="canonical" href="`+link.str("url")+`"`)
	for _, status := range []string{"draft", "archived"} {
		post = responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": status}, true), 200)
		failure := responseRow(t, request(t, app, "GET", path, nil, true), 409)
		if failure.str("code") != "POST_NOT_PUBLISHED" || failure["url"] != nil {
			t.Fatal("private content got a public URL", failure)
		}
	}
}

func TestPublishedPostLinkDomainAndMount(t *testing.T) {
	app, _, post := publicFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	t.Setenv("PUBLIC_URL", "https://deployment.example.test/journal")
	path := "/journal/api/posts/" + post.str("id") + "/link"
	link := responseRow(t, request(t, app, "GET", path, nil, true), 200)
	if link.str("url") != "https://deployment.example.test/journal/post/crawlable" {
		t.Fatal(link)
	}
	expectStatus(t, request(t, app, "PUT", "/journal/api/settings/domain", Row{"url": "stories.example.com"}, true), 200)
	link = responseRow(t, request(t, app, "GET", path, nil, true), 200)
	if link.str("url") != "https://stories.example.com/journal/post/crawlable" {
		t.Fatal(link)
	}
}

func TestMCPPublishedPostLink(t *testing.T) {
	app, _, post := publicFixture(t)
	reader := roleToken(t, app, "reader")
	t.Setenv("PUBLIC_URL", "https://stories.example.com/journal")
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	session := mcpTestSession(t, app, reader)
	link := mcpCall(t, session, "get_post", Row{"id": post["id"], "view": "link"}, 200)
	if link.str("url") != "https://stories.example.com/journal/post/crawlable" {
		t.Fatal(link)
	}
	draft := responseRow(t, request(t, app, "POST", "/journal/api/posts", draftInput("private-draft"), true), 201)
	failure := mcpCall(t, session, "get_post", Row{"id": draft["id"], "view": "link"}, 409)
	if failure.str("code") != "POST_NOT_PUBLISHED" {
		t.Fatal(failure)
	}
}

func TestMCPPostLinkPreservesTransportScheme(t *testing.T) {
	app, _, post := publicFixture(t)
	for _, tc := range []struct{ target, forwarded, trust, expected string }{
		{"https://blog.test/mcp", "", "0", "https://blog.test"},
		{"http://blog.test/mcp", "https", "1", "https://blog.test"},
		{"http://blog.test/mcp", "https", "0", "http://blog.test"},
	} {
		t.Setenv("TRUST_PROXY", tc.trust)
		payload := Row{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": Row{"name": "get_post", "arguments": Row{"id": post["id"], "view": "link"}}}
		r := httptest.NewRequest("POST", tc.target, strings.NewReader(encode(payload)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Accept", "application/json, text/event-stream")
		r.Header.Set("MCP-Protocol-Version", "2025-06-18")
		r.Header.Set("Authorization", "Bearer owner")
		r.Header.Set("X-Forwarded-Proto", tc.forwarded)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		expectStatus(t, w, 200)
		var response Row
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		result := object(object(response["result"])["structuredContent"])
		if object(result["data"]).str("url") != tc.expected+"/post/crawlable" {
			t.Fatal(w.Body.String())
		}
	}
}
