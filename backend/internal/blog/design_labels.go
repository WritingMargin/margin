package blog

import (
	"encoding/json"
	"net/url"
	"strings"
)

func defaultDesignLabel(row Row, text, visible string) {
	if _, exists := row[text]; !exists {
		row[text] = ""
	}
	if _, exists := row[visible]; !exists {
		row[visible] = true
	}
	row[text] = stringField(row, text, 0, 150, true)
	booleanField(row, visible)
}

func validHomepageLabels(row Row) {
	defaultDesignLabel(row, "tagline", "showTagline")
}

func validFooterLabels(row Row) {
	defaultDesignLabel(row, "footerTitle", "showFooterTitle")
	defaults := defaultTheme()
	for _, key := range []string{"showFooterLogo", "footerDescription", "footerLinks", "footerLayout", "footerBackground", "footerText", "footerFont"} {
		if _, exists := row[key]; !exists { row[key] = defaults[key] }
	}
	row["footerDescription"] = stringField(row, "footerDescription", 0, 500, true)
	booleanField(row, "showFooterLogo")
	enumField(row, "footerLayout", "split", "stacked", "centered")
	for _, key := range []string{"footerBackground", "footerText"} {
		if row[key] != "" { colorField(row, key) }
	}
	var fonts []string
	must(json.Unmarshal(fontsJSON, &fonts))
	fonts = append(fonts, "inherit")
	enumField(row, "footerFont", fonts...)
	links, ok := row["footerLinks"].([]any)
	if !ok || len(links) > 8 { fail(400, "footerLinks: invalid list") }
	for _, item := range links {
		link, ok := item.(map[string]any)
		if !ok { fail(400, "footerLinks: invalid link") }
		strict(link, "label", "url")
		stringField(link, "label", 1, 60, true)
		href := stringField(link, "url", 1, 2048, true)
		if !validFooterURL(href) { fail(400, "footerLinks: use an HTTP(S) URL or a path starting with /") }
	}
}

func validFooterURL(raw string) bool {
	if strings.ContainsAny(raw, "\\\r\n\t ") { return false }
	parsed, err := url.Parse(raw)
	if err != nil { return false }
	if strings.HasPrefix(raw, "/") { return !strings.HasPrefix(raw, "//") && parsed.Host == "" && !parsed.IsAbs() }
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Hostname() != "" && parsed.User == nil
}

func footerLinkURL(raw string) string {
	if !validFooterURL(raw) { return "" }
	if strings.HasPrefix(raw, "/") { return sitePath(raw) }
	return raw
}
