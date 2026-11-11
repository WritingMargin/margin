package blog

import (
	"fmt"
	"strings"
)

func postAuthoringWarnings(post Row) []string {
	warnings := []string{}
	if post.str("cover") == "" && object(post["seo"]).str("image") != "" {
		warnings = append(warnings, "A sharing image does not appear as a page cover. Set cover to display it on the page; an empty seo.image automatically uses an image cover for sharing.")
	}
	return append(warnings, blockWarnings(strings.Split(post.str("content"), "\n"), 0, 0)...)
}

// These diagnostics check block structure, not visual rendering or every
// renderer-specific semantic constraint. The preview remains the visual check.
func blockWarnings(lines []string, offset, depth int) []string {
	warnings := []string{}
	if depth > 32 {
		return []string{"Block nesting exceeds the renderer limit."}
	}
	inlineTicks := 0
	for i := 0; i < len(lines); i++ {
		if inlineTicks == 0 && rssFence.MatchString(lines[i]) {
			i = rssFenceEnd(lines, i)
			continue
		}
		marker := rssBlockMarker(lines[i])
		if inlineTicks != 0 || marker == nil {
			if inlineTicks == 0 {
				warnings = append(warnings, malformedBlockWarnings(lines[i], offset+i+1)...)
			}
			inlineTicks = rssInlineTicks(lines[i], inlineTicks)
			continue
		}
		messages, end := checkAuthoringBlock(lines, i, marker, offset, depth)
		warnings = append(warnings, messages...)
		i = end
	}
	return warnings
}

func checkAuthoringBlock(lines []string, start int, marker *rssMarker, offset, depth int) ([]string, int) {
	prefix := fmt.Sprintf("Line %d (%s): ", offset+start+1, marker.name)
	if marker.close {
		return []string{prefix + "unexpected closing tag."}, start
	}
	if marker.kind == "leaf" {
		return nil, start
	}
	end := rssBlockEnd(lines, start, marker)
	if end < 0 {
		return []string{prefix + "missing closing tag."}, start
	}
	if marker.kind == "raw" {
		return nil, end
	}
	warnings := blockWarnings(lines[start+1:end], offset+start+1, depth+1)
	if marker.name == "tabs" {
		warnings = append(warnings, tabsWarnings(lines[start+1:end], prefix)...)
	}
	if marker.name == "tab" && strings.TrimSpace(marker.attrs["title"]) == "" {
		warnings = append(warnings, prefix+"Tab needs a non-empty title attribute.")
	}
	return warnings, end
}

func tabsWarnings(lines []string, prefix string) []string {
	panels := 0
	for i := 0; i < len(lines); i++ {
		marker := rssBlockMarker(lines[i])
		if marker == nil || marker.name != "tab" || marker.close {
			if strings.TrimSpace(lines[i]) != "" {
				return []string{prefix + "Tabs must contain Tab panels, each with a title attribute."}
			}
			continue
		}
		panels++
		if end := rssBlockEnd(lines, i, marker); end >= 0 {
			i = end
		}
	}
	if panels == 0 {
		return []string{prefix + "Tabs needs at least one Tab panel."}
	}
	return nil
}

func malformedBlockWarnings(line string, number int) []string {
	match := rssBracket.FindStringSubmatch(line)
	if match != nil && rssTagKinds[strings.ToLower(match[2])] != "" {
		return []string{fmt.Sprintf("Line %d (%s): invalid tag attributes; use quoted attribute values.", number, match[2])}
	}
	return nil
}
