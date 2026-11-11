package blog

import (
	"encoding/json"
	"html"
	"regexp"
	"strings"
)

type rssMarker struct {
	name, kind     string
	close, bracket bool
	fence          int
	attrs          map[string]string
	label          string
}

var rssBracket = regexp.MustCompile(`^ {0,3}\[(/?)([a-zA-Z]+)([^\r\n]*)\][ \t]*$`)
var rssDirective = regexp.MustCompile(`^ {0,3}(:{2,})([a-zA-Z][a-zA-Z0-9-]*)(?:\[([^\]]*)\])?(?:\{(.*)\})?[ \t]*$`)
var rssAttribute = regexp.MustCompile(`^\s+([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`)
var rssDirectiveAttribute = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))`)
var rssTagKinds = map[string]string{
	"diagram": "raw", "mermaid": "raw", "chart": "raw", "scene": "raw", "illustration": "raw",
	"checklist": "container", "callout": "container", "carousel": "container", "tabs": "container", "tab": "container", "widget": "container", "widgets": "container", "columns": "container", "column": "container",
	"model": "leaf", "figma": "leaf", "social": "leaf", "image": "leaf", "video": "leaf", "audio": "leaf", "spotify": "leaf", "soundcloud": "leaf", "link": "leaf", "linkcard": "leaf", "divider": "leaf", "clear": "leaf",
}

func rssBlockMarker(line string) *rssMarker {
	if match := rssBracket.FindStringSubmatch(line); match != nil {
		return rssBracketMarker(match)
	}
	match := rssDirective.FindStringSubmatch(line)
	if match == nil || !rssValidDirectiveAttrs(match[4]) {
		return nil
	}
	kind := "container"
	if len(match[1]) == 2 {
		kind = "leaf"
	}
	return &rssMarker{name: strings.ToLower(match[2]), kind: kind, fence: len(match[1]), attrs: rssDirectiveAttrs(match[4]), label: match[3]}
}
func rssBracketMarker(match []string) *rssMarker {
	name := strings.ToLower(match[2])
	kind := rssTagKinds[name]
	if kind == "" {
		return nil
	}
	if match[1] != "" {
		if strings.TrimSpace(match[3]) != "" {
			return nil
		}
		return &rssMarker{name: name, kind: kind, close: true, bracket: true}
	}
	attrs, ok := rssBracketAttrs(strings.TrimSuffix(strings.TrimRight(match[3], " \t"), "/"))
	if !ok {
		return nil
	}
	return &rssMarker{name: name, kind: kind, bracket: true, attrs: attrs}
}
func rssBracketAttrs(raw string) (map[string]string, bool) {
	attrs := map[string]string{}
	for strings.TrimSpace(raw) != "" {
		match := rssAttribute.FindStringSubmatch(raw)
		if match == nil {
			return nil, false
		}
		value := match[2][1 : len(match[2])-1]
		if match[2][0] == '"' {
			if json.Unmarshal([]byte(match[2]), &value) != nil {
				return nil, false
			}
		} else {
			value = strings.NewReplacer(`\'`, `'`, `\\`, `\`).Replace(value)
		}
		attrs[strings.ToLower(match[1])] = value
		raw = raw[len(match[0]):]
	}
	return attrs, true
}
func rssDirectiveAttrs(raw string) map[string]string {
	attrs := map[string]string{}
	for _, match := range rssDirectiveAttribute.FindAllStringSubmatch(raw, -1) {
		attrs[strings.ToLower(match[1])] = html.UnescapeString(match[2] + match[3] + match[4])
	}
	return attrs
}
func rssBlockEnd(lines []string, start int, marker *rssMarker) int {
	if marker.kind == "raw" {
		return rssRawEnd(lines, start, marker.name)
	}
	nested := 0
	for i := start + 1; i < len(lines); i++ {
		if rssFence.MatchString(lines[i]) {
			i = rssFenceEnd(lines, i)
			continue
		}
		if !marker.bracket {
			if rssClosingFence(lines[i], marker.fence) {
				return i
			}
			continue
		}
		next := rssBlockMarker(lines[i])
		if next == nil || next.name != marker.name {
			continue
		}
		if !next.close {
			nested++
			continue
		}
		if nested == 0 {
			return i
		}
		nested--
	}
	return rssBlockEOF(marker, len(lines))
}
func rssClosingFence(line string, length int) bool {
	trimmed := strings.TrimSpace(line)
	return len(trimmed) >= length && strings.Trim(trimmed, ":") == ""
}
func rssDirectiveContainer(marker *rssMarker) (string, string) {
	tag := map[string]string{"checklist": "section", "tabs": "section", "tab": "section", "callout": "blockquote", "mark": "mark"}[marker.name]
	if tag == "" {
		tag = "div"
	}
	open := "<" + tag + ">"
	if marker.name == "tab" || marker.name == "checklist" {
		title := marker.attrs["title"]
		if title == "" {
			title = "Tab"
			if marker.name == "checklist" {
				title = "Checklist"
			}
		}
		open += "<h3>" + html.EscapeString(title) + "</h3>"
	}
	return open, "</" + tag + ">"
}
func rssDirectiveLeaf(marker *rssMarker) string {
	switch marker.name {
	case "model":
		title := firstPreviewValue(marker.attrs["title"], "3D model")
		scene, _ := json.Marshal(Row{"title": title, "description": marker.attrs["description"], "objects": []Row{{"label": title}}})
		return rssScene(string(scene))
	case "figma":
		return linkCardHTML(map[string]string{"url": marker.attrs["url"], "title": marker.attrs["title"], "mode": "link"}, false)
	case "social":
		return socialPostHTML(marker.attrs["url"], marker.attrs["title"])
	case "divider":
		return "<hr/>"
	case "image":
		return rssFigure(`<img src="`+html.EscapeString(marker.attrs["src"])+`" alt="`+html.EscapeString(marker.attrs["alt"])+`"/>`, marker.attrs["caption"])
	case "link", "linkcard":
		return linkCardHTML(marker.attrs, false)
	case "audio", "spotify", "soundcloud":
		return audioFigure(marker.attrs, false)
	case "video":
		return rssVideoFigure(marker.attrs)
	default:
		open, close := rssDirectiveContainer(marker)
		return open + rssInlineLabel(marker.label) + close
	}
}
func rssFigure(content, caption string) string {
	if caption != "" {
		content += "<figcaption>" + html.EscapeString(caption) + "</figcaption>"
	}
	return "<figure>" + content + "</figure>"
}

func rssBlockEOF(marker *rssMarker, length int) int {
	if !marker.bracket {
		return length
	}
	return -1
}

func rssRawEnd(lines []string, start int, name string) int {
	for i := start + 1; i < len(lines); i++ {
		marker := rssBlockMarker(lines[i])
		if marker != nil && marker.close && marker.name == name {
			return i
		}
	}
	return -1
}

var rssDirectiveAttrToken = regexp.MustCompile("^(?:[#.][a-zA-Z0-9_-]+|[a-zA-Z_:][a-zA-Z0-9_:.-]*(?:[ \t]*=[ \t]*(?:\"[^\"]*\"|'[^']*'|[^ \t\"'=<>`{}]+))?)")

func rssValidDirectiveAttrs(raw string) bool {
	raw = strings.TrimSpace(raw)
	for raw != "" {
		token := rssDirectiveAttrToken.FindString(raw)
		if token == "" {
			return false
		}
		raw = raw[len(token):]
		if raw != "" && raw[0] != ' ' && raw[0] != '\t' {
			return false
		}
		raw = strings.TrimSpace(raw)
	}
	return true
}
