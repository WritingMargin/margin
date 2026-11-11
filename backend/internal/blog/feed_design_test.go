package blog

import (
	"strings"
	"testing"
)

func TestFeedDesignPatchPersistsRendersAndResets(t *testing.T) {
	app, _, post := publicFixture(t)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "tags": []string{"Go"}}, true), 200)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	current := responseRow(t, request(t, app, "GET", "/blog/api/settings/design", nil, true), 200)
	changes := Row{"homepage": Row{
		"feedHeader":  Row{"title": "Latest <writing>", "showArrow": false, "border": "none", "paddingBlock": 0},
		"feedFilters": Row{"layout": "stacked", "mobileLayout": "stacked", "gap": 24, "topics": Row{"allLabel": "Everything", "labels": Row{"Go": "Golang"}}, "search": Row{"placeholder": "Search our writing", "position": "start", "maxWidth": 240}},
	}}
	saved := responseRow(t, request(t, app, "PUT", "/blog/api/settings/design", Row{"revision": current["revision"], "changes": changes}, true), 200)
	html := request(t, app, "GET", "/blog/", nil, false).Body.String()
	containsHTML(t, html, "Latest &lt;writing&gt;", "Everything", "Search our writing", "max-width:240px", "--feed-padding:0px", `data-feed-layout="stacked"`, `maxlength="200"`)
	excludesHTML(t, html, "Latest <writing>")
	if strings.Index(html, `class="journal-search"`) > strings.Index(html, `class="journal-tag-filters"`) {
		t.Fatal("configured search order was ignored")
	}
	// Exact tag keys remain the filter values even when their labels change.
	containsHTML(t, html, "Golang", "tag=Go", "1 POST")
	filtered := request(t, app, "GET", "/blog/?tag=Go", nil, false).Body.String()
	containsHTML(t, filtered, "Crawlable story", "1 POST", `name="tag" value="Go"`)
	missing := request(t, app, "GET", "/blog/?tag=missing", nil, false).Body.String()
	containsHTML(t, missing, "0 POSTS", "No matching posts")
	reset := Row{"homepage": Row{"feedHeader": nil, "feedFilters": nil}}
	responseRow(t, request(t, app, "PUT", "/blog/api/settings/design", Row{"revision": saved["revision"], "changes": reset}, true), 200)
	html = request(t, app, "GET", "/blog/", nil, false).Body.String()
	containsHTML(t, html, "THE BLOG", "All posts", "Find a post…")
	excludesHTML(t, html, "Latest &lt;writing&gt;", "Search our writing", "max-width:240px")
}

func TestFeedDesignRejectsInvalidNestedValues(t *testing.T) {
	app, _ := coreFixture(t)
	cases := []Row{
		{"feedHeader": nil}, {"feedHeader": Row{"gap": -1}}, {"feedHeader": Row{"paddingBlock": 81}}, {"feedHeader": Row{"title": strings.Repeat("x", 151)}}, {"feedHeader": Row{"showArrow": "false"}}, {"feedHeader": Row{"extra": true}},
		{"feedFilters": Row{"layout": "absolute"}}, {"feedFilters": Row{"mobileLayout": "hidden"}}, {"feedFilters": Row{"topics": nil}}, {"feedFilters": Row{"topics": Row{"labels": Row{"": "Empty"}}}}, {"feedFilters": Row{"topics": Row{"labels": Row{"topic": 1}}}}, {"feedFilters": Row{"search": Row{"maxWidth": 801}}}, {"feedFilters": Row{"search": Row{"maxWidth": 159}}}, {"feedFilters": Row{"search": Row{"position": "outside"}}},
	}
	for _, patch := range cases {
		theme := defaultTheme()
		for key, value := range patch {
			object(theme["homepage"])[key] = value
		}
		expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
	}
}
