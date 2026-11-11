package blog

import (
	"context"
	"testing"
)

func TestGuideProgressBelongsToReaderAndPublishedGuide(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("reading-guide")
	input["contentType"], input["status"], input["content"] = "guide", "published", "## First\n\nRead this.\n\n## Next step\n\nContinue here."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/guide-progress"
	one := commentCookie(t, a, "reader-one", "email", "one@example.test")
	two := commentCookie(t, a, "reader-two", "email", "two@example.test")
	data := Row{"section": "section-next-step", "revision": post["revision"]}
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	expectStatus(t, request(t, a, "PUT", path, data, false), 401)
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, ""), 403)
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, "https://evil.test"), 403)
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, "http://blog.test"), 200)
	get := commentAuthRequest(a, "GET", path, nil, one, "")
	if get.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("progress must not be cached")
	}
	if responseRow(t, get, 200).str("section") != "section-next-step" {
		t.Fatal("place not restored")
	}
	if responseRow(t, commentAuthRequest(a, "GET", path, nil, two, ""), 200).str("section") != "" {
		t.Fatal("reader progress leaked")
	}
	// A fresh session for the same identity must resume on another device.
	fresh := commentCookie(t, a, "reader-one", "email", "one@example.test")
	if responseRow(t, commentAuthRequest(a, "GET", path, nil, fresh, ""), 200).str("section") != "section-next-step" {
		t.Fatal("progress tied to session instead of identity")
	}
	data["section"] = "section-missing"
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, "http://blog.test"), 400)
	data["section"], data["revision"] = "section-first", "old-revision"
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, "http://blog.test"), 409)
	// Renamed/removed sections are not returned as stale destinations.
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "## Changed"}, true), 200)
	if responseRow(t, commentAuthRequest(a, "GET", path, nil, one, ""), 200).str("section") != "" {
		t.Fatal("removed section returned")
	}
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	expectStatus(t, commentAuthRequest(a, "GET", path, nil, one, ""), 404)
	expectStatus(t, commentAuthRequest(a, "PUT", path, data, one, "http://blog.test"), 404)
}
