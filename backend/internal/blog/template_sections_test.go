package blog

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func componentTheme(t *testing.T) Row {
	t.Helper()
	theme := defaultTheme()
	var sections []any
	must(json.Unmarshal([]byte(`[{"id":"hero","component":"hero","variant":"image-background","props":{"source":"featured","title":{"bind":"content.title","fallback":"Coming soon"},"description":{"bind":"blog.description"},"image":{"bind":"content.cover"},"buttonLabel":"Read story","buttonHref":{"bind":"content.url","fallback":"#posts"}}},{"id":"stories","component":"post-feed"}]`), &sections))
	object(theme["homepage"])["sections"] = sections
	return theme
}

func TestTemplateSectionsRenderBindingsEscapedAndPreserveOrder(t *testing.T) {
	theme := validTheme(componentTheme(t))
	featured := Row{"id": "p", "title": "<script>title</script>", "slug": "story", "status": "published", "createdAt": "2026-10-01", "featured": true, "tags": []string{}}
	secret := Row{"id": "d", "title": "PRIVATE", "status": "draft", "createdAt": "2026-10-23", "featured": true}
	page := publicPage{Theme: theme, Home: &homepageResult{HeroPosts: []Row{secret, featured}, Posts: []Row{featured}, Page: 1, PageSize: 10, Pages: 1}, Posts: []Row{featured}}
	var output strings.Builder
	if err := publicTemplate.ExecuteTemplate(&output, "home", page); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{"template-hero-image-background", "&lt;script&gt;title&lt;/script&gt;", `href="/post/story"`, "Read story", `id="posts"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %s: %s", want, html)
		}
	}
	if strings.Contains(html, "PRIVATE") || strings.Contains(html, "<script>title") {
		t.Fatal("unsafe or private content rendered")
	}
	if strings.Index(html, "template-hero") > strings.Index(html, `id="posts"`) {
		t.Fatal("component order changed")
	}
	page.Home.HeroPosts = []Row{secret}
	sections := publicHomepageSections(page)
	if sections[0].Hero.Title != "Coming soon" || sections[0].Hero.Href != "#posts" {
		t.Fatal("empty publication fallback missing")
	}
}

func TestTemplateSectionsValidationAndMountedLinks(t *testing.T) {
	for _, value := range []string{"javascript:alert(1)", "//evil.test", "/\\evil.test", "https://user:secret@example.test", "https://good.test/\nunsafe"} {
		if safeTemplateURL(value, false) {
			t.Fatalf("unsafe link accepted: %q", value)
		}
	}
	a, _ := coreFixture(t)
	theme := componentTheme(t)
	response := request(t, a, "PUT", "/api/settings", theme, true)
	expectStatus(t, response, 200)
	for _, mutate := range []func(Row){
		func(section Row) { section["component"] = "remote-script" },
		func(section Row) { object(section["props"])["title"] = Row{"bind": "owner.email"} },
		func(section Row) { object(section["props"])["buttonHref"] = "javascript:alert(1)" },
	} {
		invalid := componentTheme(t)
		mutate(object(object(invalid["homepage"])["sections"].([]any)[0]))
		expectStatus(t, request(t, a, "PUT", "/api/settings", invalid, true), 400)
	}
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	section := object(object(theme["homepage"])["sections"].([]any)[0])
	hero := resolveTemplateHero(section, theme, []Row{{"status": "published", "title": "Story", "slug": "story"}})
	if hero.Href != "/blog/post/story" {
		t.Fatalf("unmounted CTA: %s", hero.Href)
	}
}

func TestTemplateHeroSelectionIndependentOfFeedFilters(t *testing.T) {
	a, _ := coreFixture(t)
	for _, item := range []Row{{"title": "Older featured", "featured": true, "status": "published"}, {"title": "Latest published", "status": "published"}, {"title": "PRIVATE", "status": "draft"}} {
		item["content"] = "Test body"
		item["slug"] = strings.ToLower(strings.ReplaceAll(item.str("title"), " ", "-"))
		result := request(t, a, "POST", "/api/posts", item, true)
		expectStatus(t, result, 201)
	}
	h := a.homepageData(httptest.NewRequest("GET", "/?page=99&tag=missing", nil), componentTheme(t))
	if h.Total != 0 || len(h.HeroPosts) == 0 {
		t.Fatal("hero content was lost with filtered feed")
	}
	for _, row := range h.HeroPosts {
		if row.str("status") != "published" {
			t.Fatal("draft in hero data")
		}
	}
}
