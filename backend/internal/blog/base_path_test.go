package blog

import (
	"context"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

func TestMountedPublication(t *testing.T) {
	a, _, item := publicFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	home := request(t, a, "GET", "/blog/", nil, false)
	expectStatus(t, home, 200)
	containsHTML(t, home.Body.String(), `href="/blog/post/crawlable"`, `href="/blog/rss.xml"`, `src="/blog/public-assets/entry.js"`, `href="https://usefused.com/blog/"`)
	article := request(t, a, "GET", "/blog/post/crawlable", nil, false)
	expectStatus(t, article, 200)
	containsHTML(t, article.Body.String(), `Readable <strong>without JavaScript</strong>`, `href="/blog/posts/crawlable.md"`, `https://usefused.com/blog/post/crawlable`)
	if !strings.HasPrefix(article.Header().Get("Link"), "</blog/posts/") {
		t.Fatal("alternate link escaped mount")
	}
	for _, path := range []string{"/blog/admin/pricing", "/blog/public-assets/entry.js", "/blog/api/health", "/blog/posts/crawlable.md", "/blog/read/crawlable", "/blog/llms.txt", "/blog/llms-full.txt"} {
		expectStatus(t, request(t, a, "GET", path, nil, false), 200)
	}
	containsHTML(t, request(t, a, "GET", "/blog/rss.xml", nil, false).Body.String(), "https://usefused.com/blog/post/crawlable")
	containsHTML(t, request(t, a, "GET", "/blog/sitemap.xml", nil, false).Body.String(), "https://usefused.com/blog/post/crawlable")
	responseRow(t, request(t, a, "PUT", "/blog/api/posts/"+item.str("id"), Row{"revision": item["revision"], "status": "draft"}, true), 200)
	expectStatus(t, request(t, a, "GET", "/blog/post/crawlable", nil, true), 404)
	expectStatus(t, request(t, a, "GET", "/blog/posts/crawlable.md", nil, true), 404)
}
func TestMountedBoundaryAndCookies(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	for _, path := range []string{"/", "/api/health", "/blog-other/api/health", "/blogger/"} {
		expectStatus(t, request(t, a, "GET", path, nil, false), 404)
	}
	redirect := request(t, a, "GET", "/blog?x=1", nil, false)
	expectStatus(t, redirect, 308)
	if redirect.Header().Get("Location") != "/blog/?x=1" {
		t.Fatal(redirect.Header())
	}
	expectStatus(t, request(t, a, "GET", "/blog/api/posts", nil, false), 401)
	t.Setenv("MARGIN_ENV", "production")
	w := httptest.NewRecorder()
	a.startSession(w, httptest.NewRequest("GET", "https://usefused.com/blog/", nil))
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Path != "/blog/" || !cookies[0].Secure {
		t.Fatal(cookies)
	}
	if got := a.newsletterOrigin(context.Background()); got != "" {
		t.Fatal(got)
	}
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	if got := a.newsletterOrigin(context.Background()); got != "https://usefused.com/blog" {
		t.Fatal(got)
	}
}
func TestMountedAssetReferences(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	id := "00000000-0000-4000-8000-000000000001"
	if mediaPath("https://images.example/a.png") != "https://images.example/a.png" {
		t.Fatal("external media changed")
	}
	if blogIconURL(Row{}) != "/blog/api/public/brand.svg" {
		t.Fatal("icon escaped mount")
	}
	html := rssMarkdown("![Image](/api/assets/"+id+".png)", "https://usefused.com/blog/post/test")
	containsHTML(t, html, "https://usefused.com/blog/api/assets/"+id+".png")
	p := publicPage{Canonical: "https://usefused.com/blog/post/test", ShareImage: "/api/public/covers/" + id}
	resolveShareImage(&p)
	if p.ShareImage != "https://usefused.com/blog/api/public/covers/"+id {
		t.Fatal(p.ShareImage)
	}
}
func TestMountedBundleMismatch(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	validateWebBase(fstest.MapFS{"margin-base-path.txt": {Data: []byte("/blog")}})
	defer func() {
		if recover() == nil {
			t.Fatal("accepted root frontend for /blog")
		}
	}()
	validateWebBase(fstest.MapFS{"margin-base-path.txt": {Data: []byte("")}})
}

func TestRuntimeBundleSupportsEveryMount(t *testing.T) {
	for _, base := range []string{"", "/blog", "/company/journal"} {
		t.Run(base, func(t *testing.T) {
			a, _ := coreFixture(t)
			t.Setenv("MARGIN_BASE_PATH", base)
			a.Web = fstest.MapFS{
				"margin-base-path.txt": {Data: []byte(runtimeWebBase)},
				"index.html":           {Data: []byte(`<html><script nonce="__MARGIN_NONCE__">window.config={"basename":"` + runtimeWebBase + `"}</script><script src="` + runtimeWebBase + `/assets/app.js"></script></html>`)},
				"assets/app.js":        {Data: []byte(`import "` + runtimeWebBase + `/assets/lazy.js";fetch("` + runtimeWebBase + `/api/session")`)},
				"assets/app.css":       {Data: []byte(`@font-face{src:url(` + runtimeWebBase + `/assets/font.woff2)}`)},
			}
			validateWebBase(a.Web)
			html := request(t, a, "GET", base+"/admin/posts/new", nil, false)
			expectStatus(t, html, 200)
			containsHTML(t, html.Body.String(), `src="`+base+`/assets/app.js"`)
			if strings.Contains(html.Body.String(), runtimeWebBase) {
				t.Fatal("runtime marker leaked into workspace HTML")
			}
			js := request(t, a, "GET", base+"/assets/app.js", nil, false)
			expectStatus(t, js, 200)
			containsHTML(t, js.Body.String(), `import "`+base+`/assets/lazy.js"`, `fetch("`+base+`/api/session")`)
			css := request(t, a, "GET", base+"/assets/app.css", nil, false)
			expectStatus(t, css, 200)
			containsHTML(t, css.Body.String(), `url(`+base+`/assets/font.woff2)`)
		})
	}
}

func TestRuntimeAssetFormats(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	for _, name := range []string{"index.html", "app.js", "worker.mjs", "style.css", "manifest.json"} {
		if got := string(mountedWebData(name, []byte(runtimeWebBase+"/assets/test"))); got != "/blog/assets/test" {
			t.Fatalf("%s: %s", name, got)
		}
	}
	data := []byte(runtimeWebBase)
	for _, name := range []string{"image.png", "font.woff2", "decoder.wasm", "sample.pdf"} {
		if string(mountedWebData(name, data)) != runtimeWebBase {
			t.Fatalf("rewrote binary asset %s", name)
		}
	}
	t.Setenv("MARGIN_BASE_PATH", "")
	if got := string(mountedWebData("index.html", []byte(`{"basename":"`+runtimeWebBase+`"}`))); got != `{"basename":"/"}` {
		t.Fatal(got)
	}
}

func TestRuntimeMountFromPublicURL(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "")
	os.Unsetenv("MARGIN_BASE_PATH")
	for _, base := range []string{"", "/blog", "/company/journal"} {
		t.Setenv("PUBLIC_URL", "https://example.test"+base+"/")
		if BasePath() != base {
			t.Fatalf("wrong mount for %s", base)
		}
	}
	t.Setenv("MARGIN_BASE_PATH", "/override")
	if BasePath() != "/override" {
		t.Fatal("explicit mount was ignored")
	}
	t.Setenv("MARGIN_BASE_PATH", "")
	if BasePath() != "" {
		t.Fatal("explicit root mount was ignored")
	}
}

func TestRuntimeMountRejectsUnsafePublicPath(t *testing.T) {
	for _, suffix := range []string{"/../admin", "/%22%3E", "/blog//nested", "/blog space"} {
		t.Run(suffix, func(t *testing.T) {
			t.Setenv("MARGIN_BASE_PATH", "")
			os.Unsetenv("MARGIN_BASE_PATH")
			t.Setenv("PUBLIC_URL", "https://example.test"+suffix)
			defer func() {
				if recover() == nil {
					t.Fatal("accepted unsafe runtime path")
				}
			}()
			BasePath()
		})
	}
}
