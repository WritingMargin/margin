package blog

import (
	"bytes"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/renderer"
	htmlrenderer "github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// Only renderer-owned placeholders may introduce HTML; author HTML stays disabled.
type rssFragment struct {
	markup string
	block  bool
}
type rssMarkup struct {
	styled    bool
	depth     int
	prefix    string
	fragments []rssFragment
}

func newRSSMarkup(source string) *rssMarkup {
	prefix := "MARGINRSS" + hash(source)[:16] + "TOKEN"
	for strings.Contains(source, prefix) {
		prefix += "X"
	}
	return &rssMarkup{prefix: prefix}
}
func (m *rssMarkup) token(markup string, block bool) string {
	result := fmt.Sprintf("%s%dEND", m.prefix, len(m.fragments))
	m.fragments = append(m.fragments, rssFragment{markup, block})
	if block {
		return "\n\n" + result + "\n\n"
	}
	return result
}
func (m *rssMarkup) restore(content string) string {
	pattern := regexp.MustCompile(regexp.QuoteMeta(m.prefix) + `([0-9]+)END`)
	paragraph := regexp.MustCompile(`<p>` + pattern.String() + `</p>`)
	content = paragraph.ReplaceAllStringFunc(content, func(value string) string {
		token := pattern.FindString(value)
		if m.fragment(token).block {
			return token
		}
		return value
	})
	return pattern.ReplaceAllStringFunc(content, func(token string) string { return m.fragment(token).markup })
}
func (m *rssMarkup) fragment(token string) rssFragment {
	index, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(token, m.prefix), "END"))
	if err != nil || index < 0 || index >= len(m.fragments) {
		return rssFragment{markup: token}
	}
	return m.fragments[index]
}
func rssMarkdown(source, link string) string {
	return renderMarkdown(source, link, false)
}
func renderMarkdown(source, link string, styled bool) string {
	return markdownMarkup(source, link, styled, false)
}

func markdownMarkup(source, link string, styled, markHeadings bool) string {
	m := newRSSMarkup(source)
	m.styled = styled
	content := m.blocks(strings.Split(strings.ReplaceAll(source, "\r\n", "\n"), "\n"), 0)
	var output bytes.Buffer
	markdown := rssMarkdownEngine()
	content = m.citations(content)
	content = m.inlineDirectives(content, markdown)
	content = m.escapedFonts(content, markdown)
	document := markdown.Parser().Parse(text.NewReader([]byte(content)))
	if markHeadings {
		_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
			if entering && node.Kind() == ast.KindHeading {
				node.SetAttributeString("data-margin-heading", "")
			}
			return ast.WalkContinue, nil
		})
	}
	rssTaskLists(document)
	m.socialPosts(document, []byte(content))
	must(markdown.Renderer().Render(&output, []byte(content), document))
	rendered := rssFonts(output.String())
	return strings.TrimSpace(rssURLs(m.restore(rendered), link))
}

type rssSkipHTML struct{}

func (rssSkipHTML) RegisterFuncs(r renderer.NodeRendererFuncRegisterer) {
	r.Register(ast.KindHTMLBlock, rssIgnoreHTML)
	r.Register(ast.KindRawHTML, rssIgnoreHTML)
	r.Register(extast.KindTaskCheckBox, rssCheckbox)
}
func rssIgnoreHTML(util.BufWriter, []byte, ast.Node, bool) (ast.WalkStatus, error) {
	return ast.WalkSkipChildren, nil
}

var rssURLAttribute = regexp.MustCompile(` (href|src)="([^"]*)"`)

func rssURLs(content, link string) string {
	base, _ := url.Parse(link)
	return rssURLAttribute.ReplaceAllStringFunc(content, func(attribute string) string {
		match := rssURLAttribute.FindStringSubmatch(attribute)
		parsed, err := url.Parse(mediaPath(html.UnescapeString(match[2])))
		if err != nil {
			return ""
		}
		resolved := base.ResolveReference(parsed)
		if resolved.Host != "" && resolved.Path == "" {
			resolved.Path = "/"
		}
		if resolved.User != nil {
			return ""
		}
		if resolved.Scheme != "http" && resolved.Scheme != "https" && resolved.Scheme != "mailto" {
			return ""
		}
		return " " + match[1] + `="` + html.EscapeString(resolved.String()) + `"`
	})
}

var rssFence = regexp.MustCompile("^ {0,3}(`{3,}|~{3,})(.*)$")

func rssFenceEnd(lines []string, start int) int {
	opening := rssFence.FindStringSubmatch(lines[start])
	for i := start + 1; i < len(lines); i++ {
		closing := rssFence.FindStringSubmatch(lines[i])
		if closing == nil {
			continue
		}
		if closing[1][0] == opening[1][0] && len(closing[1]) >= len(opening[1]) && strings.TrimSpace(closing[2]) == "" {
			return i
		}
	}
	return len(lines) - 1
}
func (m *rssMarkup) blocks(lines []string, depth int) string {
	if depth > 32 {
		return strings.Join(lines, "\n")
	}
	var out []string
	inlineTicks := 0
	for i := 0; i < len(lines); i++ {
		if inlineTicks == 0 && rssFence.MatchString(lines[i]) {
			end := rssFenceEnd(lines, i)
			out = append(out, m.fencedBlock(lines[i:end+1])...)
			i = end
			continue
		}
		marker := rssBlockMarker(lines[i])
		if inlineTicks != 0 {
			marker = nil
		}
		if marker == nil {
			out = append(out, lines[i])
			inlineTicks = rssInlineTicks(lines[i], inlineTicks)
			continue
		}
		rendered, end, ok := m.block(lines, i, marker, depth)
		if !ok {
			if rssUnclosedBracket(marker) {
				out = append(out, lines[i:]...)
				break
			}
			out = append(out, lines[i])
			continue
		}
		out = append(out, rendered)
		i = end
	}
	return strings.Join(out, "\n")
}
func (m *rssMarkup) block(lines []string, start int, marker *rssMarker, depth int) (string, int, bool) {
	if marker.close {
		return "", start, false
	}
	if marker.kind == "leaf" {
		return m.token(m.directiveLeaf(marker), true), start, true
	}
	end := rssBlockEnd(lines, start, marker)
	if end < 0 {
		return "", start, false
	}
	if rssOverridesChildren(marker.name) {
		return m.token(m.directiveLeaf(marker), true), end, true
	}
	body := lines[start+1 : end]
	if marker.kind == "raw" {
		return m.token(rssRawBlock(marker, body), true), end, true
	}
	open, close := rssDirectiveContainer(marker)
	if marker.label != "" {
		open += "<p>" + rssInlineLabel(marker.label) + "</p>"
	}
	return m.token(open, true) + m.blocks(body, depth+1) + m.token(close, true), end, true
}
func rssRawBlock(marker *rssMarker, lines []string) string {
	if render := map[string]func(string) string{"illustration": rssIllustration, "scene": rssScene}[marker.name]; render != nil {
		return render(strings.Join(lines, "\n"))
	}
	language := map[string]string{"diagram": "mermaid", "mermaid": "mermaid", "chart": "chart", "scene": "scene"}[marker.name]
	rendered := `<pre><code class="language-` + language + `">` + html.EscapeString(strings.Join(lines, "\n")) + "\n</code></pre>"
	for _, key := range []string{"width", "height", "align", "wrap"} {
		if _, ok := marker.attrs[key]; ok {
			return "<div>" + rendered + "</div>"
		}
	}
	return rendered
}

func (m *rssMarkup) escapedFonts(source string, markdown goldmark.Markdown) string {
	document := markdown.Parser().Parse(text.NewReader([]byte(source)))
	type replacement struct {
		start, end int
		value      string
	}
	var replacements []replacement
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if node.Kind() == ast.KindCodeSpan {
			return ast.WalkSkipChildren, nil
		}
		nodeText, ok := node.(*ast.Text)
		if !ok || !entering {
			return ast.WalkContinue, nil
		}
		start, end := nodeText.Segment.Start, nodeText.Segment.Stop
		for _, match := range rssEscapedMarker.FindAllStringIndex(source[start:end], -1) {
			offset := start + match[0]
			if !rssEscaped(source, offset) {
				continue
			}
			replacements = append(replacements, replacement{offset - 1, start + match[1], m.token(html.EscapeString(source[offset:start+match[1]]), false)})
		}
		return ast.WalkContinue, nil
	})
	for i := len(replacements) - 1; i >= 0; i-- {
		item := replacements[i]
		source = source[:item.start] + item.value + source[item.end:]
	}
	return source
}
func rssEscaped(source string, offset int) bool {
	count := 0
	for i := offset - 1; i >= 0 && source[i] == '\\'; i-- {
		count++
	}
	return count%2 != 0
}

var rssBackticks = regexp.MustCompile("`+")

func rssInlineTicks(line string, count int) int {
	if strings.TrimSpace(line) == "" {
		return 0
	}
	if strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t") {
		return count
	}
	for _, match := range rssBackticks.FindAllStringIndex(line, -1) {
		if rssEscaped(line, match[0]) {
			continue
		}
		length := match[1] - match[0]
		if count == 0 {
			count = length
		} else if count == length {
			count = 0
		}
	}
	return count
}

func rssUnclosedBracket(marker *rssMarker) bool { return marker.bracket && !marker.close }

func rssTaskLists(document ast.Node) {
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && node.Kind() == extast.KindTaskCheckBox {
			item := node.Parent().Parent()
			item.SetAttributeString("class", []byte("task-list-item"))
			item.Parent().SetAttributeString("class", []byte("contains-task-list"))
		}
		return ast.WalkContinue, nil
	})
}
func rssCheckbox(w util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	_, _ = w.WriteString(`<input type="checkbox" disabled=""`)
	if node.(*extast.TaskCheckBox).IsChecked {
		_, _ = w.WriteString(` checked=""`)
	}
	_, _ = w.WriteString(`/> `)
	return ast.WalkContinue, nil
}

var rssEscapedMarker = regexp.MustCompile(`(?i)\[/?(?:Font|Highlight)|:[a-zA-Z][a-zA-Z0-9-]*`)

func rssMarkdownEngine() goldmark.Markdown {
	return goldmark.New(goldmark.WithExtensions(extension.GFM), goldmark.WithRendererOptions(htmlrenderer.WithUnsafe(), renderer.WithNodeRenderers(util.Prioritized(rssSkipHTML{}, 1))))
}

func rssOverridesChildren(name string) bool {
	return name == "image" || name == "video" || name == "audio" || name == "spotify" || name == "soundcloud" || name == "divider"
}
