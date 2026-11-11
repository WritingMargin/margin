package blog

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

var templateTextVariables = []string{"blog.title", "blog.description", "homepage.title", "homepage.description", "content.title", "content.description"}
var templateImageVariables = []string{"blog.logo", "homepage.image", "content.cover"}
var templateLinkVariables = []string{"blog.url", "content.url"}
var templateImagePath = regexp.MustCompile(`^/api/(public/(covers|logos)/|assets/)[a-zA-Z0-9.-]+$`)
var templateAnchor = regexp.MustCompile(`^#[a-zA-Z][\w-]*$`)

func safeTemplateURL(value string, image bool) bool {
	if value == "" {
		return true
	}
	if strings.ContainsRune(value, '\\') || strings.IndexFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r < 32 }) >= 0 {
		return false
	}
	return localTemplateURL(value, image) || httpTemplateURL(value)
}
func localTemplateURL(value string, image bool) bool {
	if image {
		return templateImagePath.MatchString(previewMediaBase(value))
	}
	return (strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//")) || templateAnchor.MatchString(value)
}
func httpTemplateURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != "" && parsed.User == nil
}

func validHomepageSections(design Row) {
	value, exists := design["sections"]
	if !exists {
		return
	}
	sections, ok := value.([]any)
	if !ok || len(sections) < 1 || len(sections) > 3 {
		fail(400, "sections: choose one to three components")
	}
	ids, components := map[string]bool{}, map[string]bool{}
	for _, value := range sections {
		section := object(value)
		id, component := section.str("id"), section.str("component")
		if !templateID.MatchString(id) || ids[id] || components[component] {
			fail(400, "sections: use unique IDs and one of each component")
		}
		ids[id], components[component] = true, true
		validHomepageComponent(section)
	}
	if !components["post-feed"] {
		fail(400, "sections: keep one post feed")
	}
}

func validHomepageComponent(section Row) {
	enumField(section, "component", "hero", "featured-posts", "post-feed")
	if section.str("component") != "hero" {
		strict(section, "id", "component")
		return
	}
	strict(section, "id", "component", "variant", "props")
	enumField(section, "variant", "split", "centered", "image-background")
	props := objectField(section, "props")
	strict(props, "source", "title", "description", "image", "buttonLabel", "buttonHref", "mediaType", "video")
	if _, exists := props["mediaType"]; exists {
		enumField(props, "mediaType", "image", "video")
	}
	if _, exists := props["video"]; exists {
		validHeroVideo(stringField(props, "video", 0, 2048, false))
	}
	enumField(props, "source", "latest", "featured")
	validTemplateValue(props["title"], templateTextVariables, 200, "text")
	validTemplateValue(props["description"], templateTextVariables, 1000, "text")
	validTemplateValue(props["buttonLabel"], templateTextVariables, 80, "text")
	validTemplateValue(props["image"], templateImageVariables, 2048, "image")
	validTemplateValue(props["buttonHref"], templateLinkVariables, 2048, "link")
}

func validTemplateValue(value any, variables []string, max int, kind string) {
	if literal, ok := value.(string); ok {
		validTemplateLiteral(literal, max, kind)
		return
	}
	binding := object(value)
	strict(binding, "bind", "fallback")
	enumField(binding, "bind", variables...)
	if _, exists := binding["fallback"]; exists {
		validTemplateLiteral(stringField(binding, "fallback", 0, max, false), max, kind)
	}
}
func validTemplateLiteral(value string, max int, kind string) {
	stringField(Row{"value": value}, "value", 0, max, false)
	if kind != "text" && !safeTemplateURL(value, kind == "image") {
		fail(400, "Invalid template URL")
	}
}

func selectTemplatePost(posts []Row, source string) Row {
	// homepageHeroPosts fetches these two slots in SQL: latest, then latest featured.
	if source == "featured" && len(posts) > 1 {
		if posts[1].str("status") == "published" {
			return posts[1]
		}
		return nil
	}
	if len(posts) > 0 && posts[0].str("status") == "published" {
		return posts[0]
	}
	return nil
}

func resolveTemplateValue(value any, theme, post Row) string {
	if literal, ok := value.(string); ok {
		return literal
	}
	binding, home := object(value), object(theme["homepage"])
	if post.str("status") != "published" {
		post = nil
	}
	variables := map[string]string{
		"blog.title": theme.str("name"), "blog.description": theme.str("description"), "blog.logo": theme.str("logo"), "blog.url": "/",
		"homepage.title": home.str("title"), "homepage.description": home.str("description"), "homepage.image": home.str("artworkImage"),
		"content.title": post.str("title"), "content.description": post.str("excerpt"), "content.cover": coverImage(post.str("cover")),
	}
	if post != nil {
		variables["content.url"] = "/post/" + url.PathEscape(post.str("slug"))
	}
	if result := variables[binding.str("bind")]; result != "" {
		return result
	}
	return binding.str("fallback")
}

type resolvedTemplateHero struct{ Title, Description, Image, Video, ButtonLabel, Href, Variant string }

func resolveTemplateHero(section, theme Row, posts []Row) resolvedTemplateHero {
	props := object(section["props"])
	post := selectTemplatePost(posts, props.str("source"))
	value := func(key string) string { return resolveTemplateValue(props[key], theme, post) }
	hero := resolvedTemplateHero{Title: value("title"), Description: value("description"), Image: value("image"), ButtonLabel: value("buttonLabel"), Href: value("buttonHref"), Variant: section.str("variant")}
	hero.Video = templateHeroVideo(props, object(theme["homepage"]))
	if hero.Video != "" {
		hero.Image = ""
		if hero.Variant == "image-background" {
			hero.Variant = "split"
		}
	}
	if !safeTemplateURL(hero.Image, true) {
		hero.Image = ""
	}
	if !safeTemplateURL(hero.Href, false) {
		hero.Href = ""
	}
	if strings.HasPrefix(hero.Href, "/") {
		hero.Href = sitePath(hero.Href)
	}
	return hero
}

type publicHomepageSection struct {
	Component string
	Hero      resolvedTemplateHero
	Page      publicPage
}

func publicHomepageSections(page publicPage) []publicHomepageSection {
	sections, _ := object(page.Theme["homepage"])["sections"].([]any)
	result := []publicHomepageSection{}
	for _, value := range sections {
		section := object(value)
		item := publicHomepageSection{Component: section.str("component"), Page: page}
		if item.Component == "hero" {
			item.Hero = resolveTemplateHero(section, page.Theme, page.Home.HeroPosts)
		}
		result = append(result, item)
	}
	return result
}
