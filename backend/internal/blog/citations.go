package blog

import (
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

var citationPair = regexp.MustCompile(`(?i)\[Citation((?:\s+[a-z][a-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))*)\s*\]([^\r\n]*?)\[/Citation\]`)
var citationDocument = regexp.MustCompile(`^/api/public/documents/([a-f0-9-]{36})$`)

type citationMatch struct {
	start, end int
	label      string
	attrs      map[string]string
}

func citationMatches(source string) []citationMatch {
	if !strings.Contains(strings.ToLower(source), "[citation") {
		return nil
	}
	markdown := rssMarkdownEngine()
	document := markdown.Parser().Parse(text.NewReader([]byte(source)))
	ranges := []rssSourceRange{}
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		switch node.Kind() {
		case ast.KindCodeSpan, ast.KindLink, ast.KindImage, ast.KindAutoLink:
			return ast.WalkSkipChildren, nil
		}
		if n, ok := node.(*ast.Text); ok && entering {
			ranges = append(ranges, rssSourceRange{n.Segment.Start, n.Segment.Stop})
		}
		return ast.WalkContinue, nil
	})
	result := []citationMatch{}
	for _, match := range citationPair.FindAllStringSubmatchIndex(source, -1) {
		if !citationBoundary(source, ranges, match[0], match[1]) {
			continue
		}
		attrs, ok := rssBracketAttrs(source[match[2]:match[3]])
		label := source[match[4]:match[5]]
		if !ok || !validCitationLabel(attrs, label) {
			continue
		}
		if attrs["quote"] == "" {
			attrs["quote"] = citationPlain(label)
		}
		result = append(result, citationMatch{match[0], match[1], label, attrs})
	}
	return result
}
func citationPlain(source string) string {
	document := rssMarkdownEngine().Parser().Parse(text.NewReader([]byte(source)))
	var out strings.Builder
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if n, ok := node.(*ast.Text); ok && entering {
			out.Write(n.Segment.Value([]byte(source)))
		}
		return ast.WalkContinue, nil
	})
	return html.UnescapeString(out.String())
}
func citationSourceURL(raw string) string {
	if citationDocument.MatchString(raw) {
		return raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return parsed.String()
}
func citationPage(raw string) int {
	page, err := strconv.Atoi(raw)
	if err != nil || page < 1 || page > 100000 {
		return 1
	}
	return page
}
func citationTarget(attrs map[string]string) string {
	raw := citationSourceURL(attrs["url"])
	if raw == "" {
		return ""
	}
	if match := citationDocument.FindStringSubmatch(raw); match != nil {
		query := url.Values{"page": {strconv.Itoa(citationPage(attrs["page"]))}}
		if attrs["rect"] != "" {
			query.Set("rect", attrs["rect"])
		}
		return sitePath("/sources/"+match[1]) + "?" + query.Encode()
	}
	parsed, _ := url.Parse(raw)
	parsed.Fragment = ""
	parsed.RawFragment = ""
	if attrs["page"] != "" || strings.HasSuffix(strings.ToLower(parsed.Path), ".pdf") {
		return parsed.String() + "#page=" + strconv.Itoa(citationPage(attrs["page"]))
	}
	if attrs["quote"] != "" {
		return parsed.String() + "#:~:text=" + strings.NewReplacer("+", "%20", "-", "%2D").Replace(url.QueryEscape(attrs["quote"]))
	}
	return raw
}
func (m *rssMarkup) citations(source string) string {
	var out strings.Builder
	cursor := 0
	for _, citation := range citationMatches(source) {
		out.WriteString(source[cursor:citation.start])
		attrs := citation.attrs
		title := attrs["title"]
		if title == "" {
			title = attrs["url"]
		}
		markup := `<a class="citation-mark" href="` + html.EscapeString(citationTarget(attrs)) + `" title="` + html.EscapeString(title) + `" target="_blank" rel="noopener noreferrer">` + citationLabelHTML(citation.label) + `<sup>↗</sup></a>`
		markup += ` <small class="citation-print-source">(` + html.EscapeString(title) + `)</small>`
		out.WriteString(m.token(markup, false))
		cursor = citation.end
	}
	out.WriteString(source[cursor:])
	return out.String()
}
func citationDocumentIDs(content string) []string {
	ids := []string{}
	seen := map[string]bool{}
	for _, citation := range citationMatches(content) {
		match := citationDocument.FindStringSubmatch(citation.attrs["url"])
		if match != nil && !seen[match[1]] {
			ids = append(ids, match[1])
			seen[match[1]] = true
		}
	}
	return ids
}

func validCitationLabel(attrs map[string]string, label string) bool {
	return citationSourceURL(attrs["url"]) != "" && !strings.Contains(strings.ToLower(label), "[citation")
}

func citationBoundary(source string, ranges []rssSourceRange, start, end int) bool {
	return rssRangeContains(ranges, start) && rssRangeContains(ranges, end-11) && !rssEscaped(source, start) && !rssEscaped(source, end-11)
}

var citationInnerLink = regexp.MustCompile(`<a[^>]*>|</a>|<img[^>]*>`)

func citationLabelHTML(label string) string {
	return citationInnerLink.ReplaceAllString(rssInlineLabel(label), "")
}
