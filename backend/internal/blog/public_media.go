package blog

import "strings"

func (m *rssMarkup) directiveLeaf(marker *rssMarker) string {
	if marker.name == "link" || marker.name == "linkcard" {
		return linkCardHTML(marker.attrs, m.styled)
	}
	if audioMarker(marker.name) {
		return audioFigure(marker.attrs, m.styled)
	}
	markup := rssDirectiveLeaf(marker)
	if !m.styled || (marker.name != "image" && marker.name != "video") {
		return markup
	}
	frame := marker.attrs["frame"]
	switch frame {
	case "plain", "border", "polaroid":
	default:
		frame = "auto"
	}
	// Classes come from a fixed allowlist, never arbitrary author attributes.
	class := "md-media md-frame-" + frame
	if marker.name == "video" {
		class += " md-video-figure"
	}
	return strings.Replace(markup, "<figure>", `<figure class="`+class+`">`, 1)
}
