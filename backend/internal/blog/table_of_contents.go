package blog

import (
	"bytes"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type contentsHeading struct {
	id, title string
	level     int
}

// Mark authored headings before rich-component fallbacks introduce their own headings.
func sectionedArticle(source, canonical string, styled bool, placement string, design Row, permalinkBase string) string {
	body := markdownMarkup(source, canonical, styled, true)
	return articleContents(body, placement, design, permalinkBase)
}

func articleContents(body, placement string, design Row, permalinkBase string) string {
	if !strings.Contains(body, "data-margin-heading") {
		return body
	}
	root := contentsElement("div", "")
	root.DataAtom = atom.Div
	nodes, err := html.ParseFragment(strings.NewReader(body), root)
	if err != nil {
		return body
	}
	for _, node := range nodes {
		root.AppendChild(node)
	}
	headings := []contentsHeading{}
	ids := sectionIDs{}
	collectContents(root, &headings, ids, permalinkBase)
	included := filterContentsHeadings(headings, design)
	var output bytes.Buffer
	if placement == "off" || placement == "" || len(included) == 0 {
		for child := root.FirstChild; child != nil; child = child.NextSibling {
			must(html.Render(&output, child))
		}
		return output.String()
	}
	layout := contentsElement("div", "article-toc-layout article-toc-"+placement)
	setHTMLAttribute(layout, "style", contentsDesignStyle(design))
	layout.AppendChild(contentsNavigation(included, design))
	setHTMLAttribute(root, "class", "article-prose")
	layout.AppendChild(root)
	must(html.Render(&output, layout))
	return output.String()
}

// Keep the Go and React slug rules identical, including collision handling.
type sectionIDs map[string]int

func (used sectionIDs) next(title string) string {
	words := strings.FieldsFunc(title, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsMark(r)
	})
	base := "section-" + strings.Join(words, "-")
	if len(words) == 0 {
		base = "section"
	}
	base = strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + ('a' - 'A')
		}
		return r
	}, base)
	id := base
	for used[id] > 0 {
		used[base]++
		id = base + "-" + strconv.Itoa(used[base])
	}
	used[id] = 1
	return id
}

func collectContents(root *html.Node, headings *[]contentsHeading, ids sectionIDs, permalinkBase string) {
	for node := range root.Descendants() {
		if !takeHeadingMarker(node) {
			continue
		}
		title := strings.Join(strings.Fields(contentsText(node)), " ")
		if title == "" {
			continue
		}
		id := ids.next(title)
		setHTMLAttribute(node, "id", id)
		*headings = append(*headings, contentsHeading{id, title, int(node.Data[1] - '0')})
		link := contentsElement("a", "section-permalink")
		// Old table-of-contents links used numeric destinations.
		setHTMLAttribute(link, "id", "article-section-"+strconv.Itoa(len(*headings)))
		setHTMLAttribute(link, "href", permalinkBase+"#"+id)
		setHTMLAttribute(link, "aria-label", "Link to section: "+title)
		if permalinkBase != "" {
			link.AppendChild(&html.Node{Type: html.TextNode, Data: "#"})
		}
		node.AppendChild(link)
	}
}

func takeHeadingMarker(node *html.Node) bool {
	for i, attr := range node.Attr {
		if attr.Key == "data-margin-heading" {
			node.Attr = append(node.Attr[:i], node.Attr[i+1:]...)
			return true
		}
	}
	return false
}

func contentsText(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}
	if node.Data == "img" {
		for _, attr := range node.Attr {
			if attr.Key == "alt" {
				return attr.Val
			}
		}
	}
	var text strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		text.WriteString(contentsText(child))
	}
	return text.String()
}

func contentsNavigation(headings []contentsHeading, design Row) *html.Node {
	nav := contentsElement("nav", "article-toc")
	nav.Attr = append(nav.Attr, html.Attribute{Key: "aria-label", Val: "Table of contents"})
	setHTMLAttribute(nav, "data-style", lookString(design, "style", "outlined"))
	setHTMLAttribute(nav, "data-numbered", contentsBool(design, "numbered", false))
	setHTMLAttribute(nav, "data-sticky", contentsBool(design, "sticky", true))
	contentsTitle(nav, design)
	list := contentsElement("ol", "")
	level := 6
	for _, heading := range headings {
		level = min(level, heading.level)
	}
	for _, heading := range headings {
		item := contentsElement("li", "toc-depth-"+strconv.Itoa(heading.level-level))
		link := contentsElement("a", "")
		link.Attr = append(link.Attr, html.Attribute{Key: "href", Val: "#" + heading.id})
		link.AppendChild(&html.Node{Type: html.TextNode, Data: heading.title})
		item.AppendChild(link)
		list.AppendChild(item)
	}
	nav.AppendChild(list)
	return nav
}

func contentsElement(tag, class string) *html.Node {
	node := &html.Node{Type: html.ElementNode, Data: tag}
	if class != "" {
		node.Attr = []html.Attribute{{Key: "class", Val: class}}
	}
	return node
}

func setHTMLAttribute(node *html.Node, key, value string) {
	for i := range node.Attr {
		if node.Attr[i].Key == key {
			node.Attr[i].Val = value
			return
		}
	}
	node.Attr = append(node.Attr, html.Attribute{Key: key, Val: value})
}

func contentsTitle(nav *html.Node, design Row) {
	label, exists := design["title"].(string)
	if !exists {
		label = "On this page"
	}
	if label == "" {
		return
	}
	title := contentsElement("strong", "")
	title.AppendChild(&html.Node{Type: html.TextNode, Data: label})
	nav.AppendChild(title)
}

func filterContentsHeadings(headings []contentsHeading, design Row) []contentsHeading {
	depth, exists := design["maxDepth"].(float64)
	if !exists {
		return headings
	}
	included := []contentsHeading{}
	for _, heading := range headings {
		if heading.level <= int(depth) {
			included = append(included, heading)
		}
	}
	return included
}
