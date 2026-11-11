package blog

import (
	"bytes"
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCitationMarkup(t *testing.T) {
	tag := `[Citation url="https://example.com/story" title="Research" quote="A quote, with a dash-here"]Some **words**[/Citation]`
	rendered := rssMarkdown(tag, "https://blog.example/post/story")
	for _, want := range []string{`class="citation-mark"`, `Some <strong>words</strong>`, `#:~:text=A%20quote%2C%20with%20a%20dash%2Dhere`, `target="_blank"`} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("missing %s in %s", want, rendered)
		}
	}
	for _, content := range []string{"`" + tag + "`", "```\n" + tag + "\n```", "    " + tag, "\\" + tag, "[" + tag + "](https://example.org)", `[Citation url="javascript:alert(1)"]unsafe[/Citation]`} {
		if strings.Contains(rssMarkdown(content, "https://blog.example"), `class="citation-mark"`) {
			t.Fatalf("literal became a citation: %s", content)
		}
	}
}
func TestCitationDocumentPublication(t *testing.T) {
	a, _ := coreFixture(t)
	upload := func(auth bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/api/media/documents?title=Research.pdf", bytes.NewBufferString("%PDF-1.7\nfixture\n%%EOF"))
		req.Header.Set("Content-Type", "application/pdf")
		if auth {
			req.Header.Set("Authorization", "Bearer owner")
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, req)
		return w
	}
	if got := upload(false).Code; got != 401 {
		t.Fatalf("unauthorized upload: %d", got)
	}
	document := responseRow(t, upload(true), 201)
	path := document.str("url")
	if got := request(t, a, "GET", path, nil, false).Code; got != 404 {
		t.Fatalf("private PDF: %d", got)
	}
	if got := request(t, a, "GET", path, nil, true).Code; got != 200 {
		t.Fatalf("owner PDF: %d", got)
	}
	content := `[Citation url="` + path + `" title="Research" page="2" rect="0.1,0.2,0.5,0.1"]A quotation[/Citation]`
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Sources", "slug": "sources", "status": "draft", "content": content}, true), 201)
	if got := request(t, a, "GET", path, nil, false).Code; got != 404 {
		t.Fatalf("draft PDF: %d", got)
	}
	post = responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "published"}, true), 200)
	if got := request(t, a, "GET", path, nil, false).Code; got != 200 {
		t.Fatalf("published PDF: %d", got)
	}
	viewer := request(t, a, "GET", "/sources/"+document.str("id"), nil, false)
	if viewer.Code != 200 || !strings.Contains(viewer.Body.String(), "Research.pdf") {
		t.Fatalf("viewer: %d %s", viewer.Code, viewer.Body.String())
	}
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": "Citation removed"}, true), 200)
	if got := request(t, a, "GET", path, nil, false).Code; got != 404 {
		t.Fatalf("removed citation PDF: %d", got)
	}
}

func TestCitationDocumentBadUploadAndRevocation(t *testing.T) {
	a, storage := coreFixture(t)
	req := httptest.NewRequest("POST", "/api/media/documents?title=not-pdf", strings.NewReader("not a PDF"))
	req.Header.Set("Content-Type", "application/pdf")
	req.Header.Set("Authorization", "Bearer owner")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("invalid PDF accepted: %d", w.Code)
	}
	id := uuid()
	key := "sources/" + id + ".pdf"
	a.DB.Must(context.Background(), "INSERT INTO source_documents(id,object_key,title) VALUES($1,$2,$3)", id, key, "Research")
	must(storage.Put(context.Background(), key, []byte("%PDF-1.7\n%%EOF")))
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Citation", "slug": "citation", "status": "published", "content": `[Citation url="/api/public/documents/` + id + `"]quote[/Citation]`}, true), 201)
	storage.onGet = func(got string) {
		if got == key {
			a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
		}
	}
	result := request(t, a, "GET", "/api/public/documents/"+id, nil, false)
	if result.Code != 404 || strings.Contains(result.Body.String(), "%PDF") {
		t.Fatalf("withdrawn document leaked: %d", result.Code)
	}
}

func TestCitationEscapingAndMountedLinks(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	source := `[Citation url="/api/public/documents/12345678-1234-1234-1234-123456789abc" title="\" onmouseover=\"bad" page="3"]A [nested link](https://other.example)[/Citation]`
	rendered := rssMarkdown(source, "https://example.com/blog/post/story")
	if strings.Count(rendered, "<a ") != 1 || !strings.Contains(rendered, "https://example.com/blog/sources/") || strings.Contains(rendered, ` onmouseover="`) {
		t.Fatalf("unsafe/misplaced citation: %s", rendered)
	}
	if ids := citationDocumentIDs("`" + source + "`"); len(ids) != 0 {
		t.Fatalf("code published a source: %v", ids)
	}
	if ids := citationDocumentIDs(source + "\n" + source); len(ids) != 1 {
		t.Fatalf("duplicate document refs: %v", ids)
	}
}
