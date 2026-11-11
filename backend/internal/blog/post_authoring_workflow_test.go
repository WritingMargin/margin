package blog

import (
	"context"
	"net/url"
	"strings"
	"testing"
)

func TestMCPExactEditsAndCompactSaves(t *testing.T) {
	a, _ := coreFixture(t)
	session := mcpTestSession(t, a, "owner")
	input := draftInput("edits")
	input["content"] = "Before [link](https://old.test). After."
	post := mcpCall(t, session, "create_post", Row{"input": input}, 201)
	if post["content"] != nil || post.str("publicationState") != "never_published" {
		t.Fatal(post)
	}
	edit := []Row{{"oldText": "https://old.test", "newText": "https://new.test"}}
	updated := mcpCall(t, session, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "edits": edit}}, 200)
	if updated["content"] != nil || updated["revision"] == post["revision"] {
		t.Fatal(updated)
	}
	mcpCall(t, session, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "edits": edit}}, 409)
	read := mcpCall(t, session, "get_post", Row{"id": post["id"]}, 200)
	if read.str("content") != "Before [link](https://new.test). After." {
		t.Fatal(read)
	}
	updated = mcpCall(t, session, "update_post", Row{"id": post["id"], "fields": []string{"content", "revision"}, "input": Row{"revision": updated["revision"], "edits": []Row{{"oldText": "After.", "newText": ""}}}}, 200)
	if updated.str("content") != "Before [link](https://new.test). " || updated["title"] != nil {
		t.Fatal(updated)
	}
}

func TestPostEditsAreAtomicAndDraftScoped(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("atomic-edits")
	input["content"], input["status"] = "one two two", "published"
	live := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	path := "/api/posts/" + live.str("id")
	for _, edits := range [][]Row{
		{{"oldText": "one", "newText": "changed"}, {"oldText": "missing", "newText": "x"}},
		{{"oldText": "two", "newText": "x"}},
	} {
		response := request(t, a, "PUT", path, Row{"revision": live["revision"], "title": "Should not save", "edits": edits}, true)
		expectStatus(t, response, 409)
	}
	current := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if current["revision"] != live["revision"] || current.str("content") != "one two two" {
		t.Fatal(current)
	}
	edits := []Row{{"oldText": "one", "newText": "staged"}}
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": live["revision"], "content": "replace", "edits": edits}, true), 400)
	writer := roleToken(t, a, "writer")
	expectStatus(t, tokenRequest(a, writer, "PUT", path, Row{"revision": live["revision"], "edits": edits}), 403)
	draft := responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": live["revision"], "edits": edits}), 200)
	draft = responseRow(t, tokenRequest(a, writer, "PUT", path+"/draft", Row{"revision": draft["revision"], "edits": []Row{{"oldText": "staged", "newText": "reviewed"}}}), 200)
	if draft.str("content") != "reviewed two two" || draft.str("publicationState") != "published" {
		t.Fatal(draft)
	}
	current = responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if current.str("content") != "one two two" {
		t.Fatal(current)
	}
}

func TestSharedDraftPreviewAccessAndMediaScope(t *testing.T) {
	a, _, _ := publicFixture(t)
	reader := roleToken(t, a, "reader")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	upload := responseRow(t, request(t, a, "POST", "/blog/api/media/images", imageAPIInput(), true), 201)
	other := responseRow(t, request(t, a, "POST", "/blog/api/media/images", imageAPIInput(), true), 201)
	input := draftInput("shared-preview")
	input["cover"] = upload["url"]
	input["content"] = "PRIVATE DRAFT\n\n[Tabs]\n[Tab title=\"First\"]\nHello\n[/Tab]\n[/Tabs]"
	post := responseRow(t, request(t, a, "POST", "/blog/api/posts", input, true), 201)
	path := "/blog/api/posts/" + post.str("id")
	expectStatus(t, request(t, a, "GET", path+"/preview", nil, false), 401)
	preview := responseRow(t, tokenRequest(a, reader, "GET", path+"/preview", nil), 200)
	parsed, err := url.Parse(preview.str("previewUrl"))
	if err != nil {
		t.Fatal(err)
	}
	response := request(t, a, "GET", parsed.Path, nil, false)
	expectStatus(t, response, 200)
	containsHTML(t, response.Body.String(), "PRIVATE DRAFT", "Draft preview", "?preview=", `"preview":true`)
	if response.Header().Get("Referrer-Policy") != "no-referrer" || response.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
		t.Fatal(response.Header())
	}
	value := parsed.Path[strings.LastIndex(parsed.Path, "/")+1:]
	media := "/blog" + upload.str("url") + "?preview=" + value
	containsHTML(t, response.Body.String(), `src="`+media+`"`)
	expectStatus(t, request(t, a, "GET", media, nil, false), 200)
	expectStatus(t, request(t, a, "GET", "/blog"+other.str("url")+"?preview="+value, nil, false), 404)
	expectStatus(t, request(t, a, "GET", "/blog"+upload.str("url"), nil, false), 404)
	expectStatus(t, request(t, a, "GET", "/blog/post/shared-preview", nil, false), 404)
	responseRow(t, request(t, a, "PUT", path, Row{"revision": post["revision"], "title": "Changed"}, true), 200)
	expectStatus(t, request(t, a, "GET", parsed.Path, nil, false), 404)
	expectStatus(t, request(t, a, "GET", media, nil, false), 404)
	preview = responseRow(t, request(t, a, "GET", path+"/preview", nil, true), 200)
	parsed, _ = url.Parse(preview.str("previewUrl"))
	a.DB.Must(context.Background(), "UPDATE post_previews SET expires_at=$1", "2000-01-01T00:00:00Z")
	expectStatus(t, request(t, a, "GET", parsed.Path, nil, false), 404)
}

func TestPreviewDoesNotSendGrantToExternalURLs(t *testing.T) {
	path := "/api/public/covers/00000000-0000-4000-8000-000000000000"
	for _, host := range []string{"https://evil.test", "http://evil.test", "//evil.test", "ftp://evil.test"} {
		input := "![external](" + host + path + ")"
		if got := previewMediaURLs(input, "secret"); got != input {
			t.Fatal(got)
		}
	}
	if got := previewMediaURLs("![local]("+path+")", "secret"); !strings.Contains(got, "?preview=secret") {
		t.Fatal(got)
	}
}

func TestPostWarningsAndPublicationState(t *testing.T) {
	a, _ := coreFixture(t)
	session := mcpTestSession(t, a, "owner")
	input := draftInput("warnings")
	input["content"] = "[Tabs]\nText without panels\n[/Tabs]"
	post := mcpCall(t, session, "create_post", Row{"input": input}, 201)
	if !strings.Contains(encode(post["warnings"]), "Tab panels") {
		t.Fatal(post)
	}
	preview := mcpCall(t, session, "get_post", Row{"id": post["id"], "view": "preview"}, 200)
	if preview.str("previewUrl") == "" {
		t.Fatal(preview)
	}
	live := mcpCall(t, session, "update_post", Row{"id": post["id"], "action": "publish", "input": Row{"revision": post["revision"]}}, 200)
	private := mcpCall(t, session, "update_post", Row{"id": post["id"], "action": "unpublish", "input": Row{"revision": live["revision"]}}, 200)
	if private.str("publicationState") != "unpublished" || private.str("status") != "draft" {
		t.Fatal(private)
	}
	link := mcpCall(t, session, "get_post", Row{"id": post["id"], "view": "link"}, 409)
	if link.str("publicationState") != "unpublished" {
		t.Fatal(link)
	}
	for _, content := range []string{"[Tabs]\n[Tab title=\"OK\"]\nText\n[/Tab]\n[/Tabs]", "```md\n[Tabs]\n```", "`[Tabs]`"} {
		if warnings := postAuthoringWarnings(Row{"content": content}); len(warnings) != 0 {
			t.Fatal(content, warnings)
		}
	}
}

func TestPreviewMediaRevocationDuringStorageRead(t *testing.T) {
	a, storage := coreFixture(t)
	upload := responseRow(t, request(t, a, "POST", "/api/media/images", imageAPIInput(), true), 201)
	input := draftInput("revoke-preview")
	input["cover"] = upload["url"]
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	preview := responseRow(t, request(t, a, "GET", "/api/posts/"+post.str("id")+"/preview", nil, true), 200)
	parsed, _ := url.Parse(preview.str("previewUrl"))
	value := parsed.Path[strings.LastIndex(parsed.Path, "/")+1:]
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "assets/covers/") {
			a.DB.Must(context.Background(), "DELETE FROM post_previews")
		}
	}
	response := request(t, a, "GET", upload.str("url")+"?preview="+value, nil, false)
	expectStatus(t, response, 404)
}
