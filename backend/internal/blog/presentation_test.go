package blog

import (
	"strings"
	"testing"
)

func TestHomepageCompositionPersistsAndRenders(t *testing.T) {
	app, _, post := publicFixture(t)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "featured": true}, true), 200)
	theme := defaultTheme()
	home := object(theme["homepage"])
	for _, key := range []string{"showHero", "showSearch", "showTopicFilters", "showPostCount", "showFeedHeading", "showFeatured", "showNumbers"} {
		home[key] = false
	}
	home["cardStyle"], home["imageRatio"], home["gridColumns"] = "filled", "portrait", "three"
	home["sectionSpacing"] = "none"
	saved := responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	if object(saved["homepage"])["showSearch"] != false || object(saved["homepage"])["sectionSpacing"] != "none" {
		t.Fatal("visibility not persisted")
	}
	page := request(t, app, "GET", "/", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), "Crawlable story", `data-section-spacing="none"`, `data-card-style="filled"`, `data-show-numbers="false"`)
	excludesHTML(t, page.Body.String(), `class="journal-hero`, `class="journal-search`, `class="journal-section-title`, `class="featured-posts`, `class="journal-tag-filters`)
	data := responseRow(t, request(t, app, "GET", "/api/public/homepage", nil, false), 200)
	if data["total"] != float64(1) || len(data["posts"].([]any)) != 1 {
		t.Fatal("hidden featured section must retain its posts in the feed", data)
	}
	home["showSearch"], home["showTopicFilters"], home["showFeatured"] = true, true, true
	home["searchPosition"], home["featuredPosition"] = "above", "after"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	html := request(t, app, "GET", "/", nil, false).Body.String()
	containsHTML(t, html, "search-position-above", `name="q"`, "journal-tag-filters")
	if strings.Index(html, `class="journal-search"`) > strings.Index(html, `class="journal-tag-filters"`) {
		t.Fatal("search reading order must match placement")
	}
	if strings.Index(html, `class="featured-posts"`) < strings.Index(html, `id="posts"`) {
		t.Fatal("featured section must follow the feed")
	}
}

func TestArticlePresentationPersistsAndRenders(t *testing.T) {
	app, _, _ := publicFixture(t)
	theme := defaultTheme()
	article := object(theme["article"])
	for key, value := range (Row{"headingFont": "plex-mono", "headingScale": "display", "spacing": "airy", "bodySize": "large", "lineSpacing": "compact", "measure": "focused", "headingStyle": "ruled", "quoteStyle": "pull"}) {
		article[key] = value
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), `data-heading-scale="display"`, `data-measure="focused"`, `data-quote-style="pull"`, "--body-size:20px", "--body-leading:1.6", "--heading-font:&#39;IBM Plex Mono&#39;")
}

func TestPresentationRejectsInvalidValues(t *testing.T) {
	app, _ := coreFixture(t)
	cases := map[string]Row{
		"homepage": {"sectionSpacing": "-1", "headingFont": "missing", "headingScale": "huge", "spacing": "-1", "cardStyle": "custom", "imageRatio": "url(x)", "gridColumns": 3, "showNumbers": "false", "showSearch": nil, "showTopicFilters": 0, "showPostCount": "no", "showFeedHeading": []any{}, "showFeatured": "false", "searchPosition": "outside", "featuredPosition": "anywhere"},
		"article":  {"headingFont": "serif; color:red", "bodySize": "100px", "lineSpacing": 0, "measure": "200vw", "headingStyle": "custom", "quoteStyle": "custom"},
	}
	for section, fields := range cases {
		for key, value := range fields {
			theme := defaultTheme()
			object(theme[section])[key] = value
			expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
		}
	}
}

func TestCatalogAcceptsPresentationControls(t *testing.T) {
	catalog := templateCatalogFixture(t)
	home := object(object(catalog["homepage"].([]any)[0])["design"])
	home["showSearch"], home["showPostCount"], home["showFeatured"] = false, false, false
	home["sectionSpacing"] = "compact"
	home["searchPosition"], home["cardStyle"], home["headingFont"] = "below", "filled", "oswald"
	article := object(object(catalog["article"].([]any)[0])["design"])
	article["measure"], article["quoteStyle"], article["bodySize"] = "reading", "pull", "large"
	if !validTemplateCatalog(catalog) {
		t.Fatal("presentation controls rejected")
	}
	home["searchPosition"] = "unknown"
	if validTemplateCatalog(catalog) {
		t.Fatal("invalid layout accepted")
	}
}
