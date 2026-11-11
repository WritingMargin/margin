package blog

import (
	"html"
	"regexp"
	"strings"
	"unicode"
)

var rssTextBoundary = regexp.MustCompile(`</(?:p|div|li|h[1-6]|td|th|tr|blockquote|pre|figcaption|summary|section|figure)>|<br\s*/?>`)

func rssDescription(theme Row) string {
	for _, value := range []string{object(theme["seo"]).str("description"), theme.str("description"), object(theme["homepage"]).str("description")} {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	name := strings.TrimSpace(theme.str("name"))
	if name == "" {
		name = "Margin"
	}
	return "Latest writing from " + name + "."
}

var rssPermalink = regexp.MustCompile(`<a class="section-permalink"[^>]*>#</a>`)

func rssSummary(item Row, rendered string) string {
	for _, value := range []string{item.str("excerpt"), object(item["seo"]).str("description")} {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	text := rssTextBoundary.ReplaceAllString(rssPermalink.ReplaceAllString(rendered, ""), " ")
	text = html.UnescapeString(searchHTMLTags.ReplaceAllString(text, ""))
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return item.str("title")
	}
	return rssShortSummary(text)
}

func rssShortSummary(text string) string {
	runes := []rune(text)
	if len(runes) <= 320 {
		return text
	}
	end := 319
	for i := end; i >= 240; i-- {
		if unicode.IsSpace(runes[i]) {
			end = i
			break
		}
	}
	return strings.TrimSpace(string(runes[:end])) + "…"
}
