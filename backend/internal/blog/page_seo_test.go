package blog

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func TestHomepageStructuredDataUsesPublicMetadata(t *testing.T) {
	app, _, _ := publicFixture(t)
	t.Setenv("PUBLIC_URL", "https://publication.example/blog")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	seo := defaultSEO()
	seo["title"], seo["description"] = "A publication homepage", "Stories & ideas </script><script>unsafe()</script>"
	seo["image"] = "https://images.example/share.png"
	expectStatus(t, request(t, app, "PUT", "/blog/api/settings/seo", seo, true), 200)
	page := request(t, app, "GET", "/blog/", nil, false)
	expectStatus(t, page, 200)
	graph := homepageGraph(t, page.Body.String())
	website, homepage := graph[0], graph[1]
	if website.str("@type") != "WebSite" || homepage.str("@type") != "CollectionPage" || homepage.str("name") != seo.str("title") {
		t.Fatal("wrong homepage entities", graph)
	}
	for _, entity := range graph {
		if entity.str("url") != "https://publication.example/blog/" || entity.str("description") != seo.str("description") || entity.str("image") != seo.str("image") {
			t.Fatal("public metadata was not used", entity)
		}
	}
	if object(homepage["isPartOf"]).str("@id") != website.str("@id") {
		t.Fatal("homepage must reference its website")
	}
	excludesHTML(t, page.Body.String(), "</script><script>unsafe()")
}

func homepageGraph(t *testing.T, markup string) []Row {
	t.Helper()
	pattern := regexp.MustCompile(`<script type="application/ld\+json"[^>]*>(.*?)</script>`)
	match := pattern.FindStringSubmatch(markup)
	if len(match) != 2 {
		t.Fatal("homepage JSON-LD missing")
	}
	var data struct {
		Context string `json:"@context"`
		Graph   []Row  `json:"@graph"`
	}
	if err := json.Unmarshal([]byte(match[1]), &data); err != nil {
		t.Fatal(err)
	}
	if data.Context != "https://schema.org" || len(data.Graph) != 2 {
		t.Fatal("invalid homepage graph", data)
	}
	return data.Graph
}

func TestPostIndexingCombinationsAndPublicCopies(t *testing.T) {
	for _, test := range []struct {
		name              string
		noindex, nofollow bool
		want              string
	}{
		{"default", false, false, ""},
		{"noindex", true, false, "noindex, follow"},
		{"nofollow", false, true, "index, nofollow"},
		{"both", true, true, "noindex, nofollow"},
	} {
		t.Run(test.name, func(t *testing.T) {
			app, _, item := publicFixture(t)
			seo := defaultPostSEO()
			seo["noindex"], seo["nofollow"] = test.noindex, test.nofollow
			item = responseRow(t, request(t, app, "PUT", "/api/posts/"+item.str("id"), Row{"revision": item["revision"], "seo": seo}, true), 200)
			if encode(item["seo"]) != encode(seo) {
				t.Fatal("indexing settings were not saved")
			}
			for _, path := range []string{"/post/crawlable", "/read/crawlable", "/posts/crawlable.md", "/rss.xml", "/llms.txt", "/llms-full.txt"} {
				for _, method := range []string{"GET", "HEAD"} {
					response := request(t, app, method, path, nil, false)
					expectStatus(t, response, 200)
					if response.Header().Get("X-Robots-Tag") != test.want {
						t.Fatalf("%s %s: %q", method, path, response.Header().Get("X-Robots-Tag"))
					}
				}
			}
			assertPostRobotsHTML(t, app, test.want)
			print := request(t, app, "GET", "/post/crawlable/print", nil, false)
			if print.Header().Get("X-Robots-Tag") != robotsDirective(true, test.nofollow) {
				t.Fatal("print directives differ")
			}
			sitemap := request(t, app, "GET", "/sitemap.xml", nil, false).Body.String()
			if strings.Contains(sitemap, "/post/crawlable") == test.noindex {
				t.Fatal("sitemap did not respect noindex")
			}
			containsHTML(t, request(t, app, "GET", "/", nil, false).Body.String(), "Crawlable story")
		})
	}
}

func assertPostRobotsHTML(t *testing.T, app *App, want string) {
	t.Helper()
	for _, path := range []string{"/post/crawlable", "/read/crawlable"} {
		page := request(t, app, "GET", path, nil, false).Body.String()
		if want == "" {
			excludesHTML(t, page, `name="robots"`)
		} else {
			containsHTML(t, page, `name="robots" content="`+want+`"`)
		}
	}
}

func TestBlogIndexingOverridesPostAndOldPostsRemainIndexable(t *testing.T) {
	app, _, item := publicFixture(t)
	assertPostRobotsHTML(t, app, "")
	seo := defaultPostSEO()
	seo["noindex"], seo["nofollow"] = false, false
	responseRow(t, request(t, app, "PUT", "/api/posts/"+item.str("id"), Row{"revision": item["revision"], "seo": seo}, true), 200)
	site := defaultSEO()
	site["indexing"] = false
	expectStatus(t, request(t, app, "PUT", "/api/settings/seo", site, true), 200)
	assertPostRobotsHTML(t, app, "noindex, nofollow")
	for _, path := range []string{"/", "/post/crawlable", "/read/crawlable", "/posts/crawlable.md", "/post/crawlable/print"} {
		if request(t, app, "GET", path, nil, false).Header().Get("X-Robots-Tag") != "noindex, nofollow" {
			t.Fatal(path)
		}
	}
	excludesHTML(t, request(t, app, "GET", "/sitemap.xml", nil, false).Body.String(), "<url>")
}

func TestPostIndexingValidationAndContentEdits(t *testing.T) {
	app, _, item := publicFixture(t)
	path := "/api/posts/" + item.str("id")
	for _, field := range []string{"noindex", "nofollow"} {
		for _, value := range []any{"false", nil, 1} {
			seo := defaultPostSEO()
			seo[field] = value
			expectStatus(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": seo}, true), 400)
		}
	}
	seo := defaultPostSEO()
	seo["noindex"], seo["nofollow"] = true, true
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": seo}, true), 200)
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "content": "A new paragraph"}, true), 200)
	if encode(item["seo"]) != encode(seo) {
		t.Fatal("content edits lost indexing preferences")
	}
	item = responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "seo": defaultPostSEO()}, true), 200)
	assertPostRobotsHTML(t, app, "")
	containsHTML(t, request(t, app, "GET", "/sitemap.xml", nil, false).Body.String(), "/post/crawlable")
	responseRow(t, request(t, app, "PUT", path, Row{"revision": item["revision"], "status": "draft"}, true), 200)
	expectStatus(t, request(t, app, "GET", "/post/crawlable", nil, false), 404)
}
