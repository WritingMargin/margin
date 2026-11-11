package blog

import (
	"bytes"
	"regexp"
	"sort"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

var rssSourceDirective = regexp.MustCompile(`:([a-zA-Z][a-zA-Z0-9-]*)`)

type rssSourceRange struct{ start, end int }

func rssTextRanges(source string, markdown goldmark.Markdown) []rssSourceRange {
	document := markdown.Parser().Parse(text.NewReader([]byte(source)))
	ranges := []rssSourceRange{}
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if node.Kind() == ast.KindCodeSpan {
			return ast.WalkSkipChildren, nil
		}
		if n, ok := node.(*ast.Text); ok && entering {
			ranges = append(ranges, rssSourceRange{n.Segment.Start, n.Segment.Stop})
		}
		return ast.WalkContinue, nil
	})
	return ranges
}
func rssRangeContains(ranges []rssSourceRange, offset int) bool {
	index := sort.Search(len(ranges), func(i int) bool { return ranges[i].end > offset })
	return index < len(ranges) && ranges[index].start <= offset
}
func rssCanStartDirective(source string, offset int, ranges []rssSourceRange) bool {
	lineStart := strings.LastIndex(source[:offset], "\n") + 1
	if strings.HasPrefix(strings.TrimLeft(source[lineStart:], " "), "::") {
		return false
	}
	if offset > 0 && source[offset-1] == ':' {
		return false
	}
	return rssRangeContains(ranges, offset) && !rssEscaped(source, offset)
}
func (m *rssMarkup) inlineDirectives(source string, markdown goldmark.Markdown) string {
	ranges := rssTextRanges(source, markdown)
	var out strings.Builder
	cursor := 0
	for _, match := range rssSourceDirective.FindAllStringSubmatchIndex(source, -1) {
		if match[0] < cursor || !rssCanStartDirective(source, match[0], ranges) {
			continue
		}
		marker, end := rssReadInline(source, match)
		if marker == nil {
			continue
		}
		out.WriteString(source[cursor:match[0]])
		out.WriteString(m.token(m.inlineMarkup(marker), false))
		cursor = end
	}
	out.WriteString(source[cursor:])
	return out.String()
}
func rssReadInline(source string, match []int) (*rssMarker, int) {
	marker := &rssMarker{name: source[match[2]:match[3]], attrs: map[string]string{}}
	end := match[1]
	if end < len(source) && source[end] == '[' {
		labelEnd := rssBalancedLabel(source, end)
		if labelEnd < 0 {
			return nil, end
		}
		marker.label = source[end+1 : labelEnd]
		end = labelEnd + 1
	}
	if end < len(source) && source[end] == '{' {
		attrsEnd := strings.IndexByte(source[end:], '}')
		if attrsEnd < 0 {
			return nil, end
		}
		attrs := source[end+1 : end+attrsEnd]
		if !rssValidDirectiveAttrs(attrs) {
			return nil, end
		}
		marker.attrs = rssDirectiveAttrs(attrs)
		end += attrsEnd + 1
	}
	return marker, end
}
func rssBalancedLabel(source string, start int) int {
	level := 1
	for i := start + 1; i < len(source); i++ {
		if source[i] == '\n' {
			return -1
		}
		if rssEscaped(source, i) {
			continue
		}
		if source[i] == '[' {
			level++
		}
		if source[i] == ']' {
			level--
			if level == 0 {
				return i
			}
		}
	}
	return -1
}
func rssInlineMarkup(marker *rssMarker, depth int) string {
	if marker.name == "image" || (marker.name == "video" || audioMarker(marker.name)) || marker.name == "divider" {
		return rssDirectiveLeaf(marker)
	}
	open, close := rssDirectiveContainer(marker)
	return open + rssInlineLabelDepth(marker.label, depth+1) + close
}
func rssInlineLabel(label string) string { return rssInlineLabelDepth(label, 0) }
func rssInlineLabelDepth(label string, depth int) string {
	var output bytes.Buffer
	markdown := rssMarkdownEngine()
	m := newRSSMarkup(label)
	m.depth = depth
	if depth < 32 {
		label = m.inlineDirectives(label, markdown)
	}
	label = m.escapedFonts(label, markdown)
	must(markdown.Convert([]byte(label), &output))
	content := strings.TrimSpace(output.String())
	content = strings.TrimSuffix(strings.TrimPrefix(content, "<p>"), "</p>")
	return m.restore(rssFonts(content))
}

func (m *rssMarkup) inlineMarkup(marker *rssMarker) string {
	if marker.name == "image" || (marker.name == "video" || audioMarker(marker.name)) {
		return m.directiveLeaf(marker)
	}
	return rssInlineMarkup(marker, m.depth)
}
