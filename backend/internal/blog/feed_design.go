package blog

import (
	"fmt"
	"html/template"
	"strings"
)

func validFeedDesign(home Row) {
	if _, exists := home["feedHeader"]; exists {
		row := objectField(home, "feedHeader")
		strict(row, "title", "showArrow", "border", "paddingBlock", "gap")
		validFeedRow(row)
		optionalFeedText(row, "title", 150)
		if _, exists := row["showArrow"]; exists {
			booleanField(row, "showArrow")
		}
	}
	if _, exists := home["feedFilters"]; exists {
		validFeedFilters(objectField(home, "feedFilters"))
	}
}
func validFeedRow(row Row) {
	optionalEnum(row, "border", "none", "top", "bottom", "top-and-bottom")
	validContentsNumber(row, "paddingBlock", 0, 80)
	validContentsNumber(row, "gap", 0, 64)
}
func optionalFeedText(row Row, key string, max int) {
	if _, exists := row[key]; exists {
		stringField(row, key, 0, max, false)
	}
}
func validFeedFilters(row Row) {
	strict(row, "border", "paddingBlock", "gap", "layout", "mobileLayout", "topics", "search")
	validFeedRow(row)
	optionalEnum(row, "layout", "inline", "stacked")
	optionalEnum(row, "mobileLayout", "wrap", "stacked")
	if _, exists := row["topics"]; exists {
		validFeedTopics(objectField(row, "topics"))
	}
	if _, exists := row["search"]; exists {
		search := objectField(row, "search")
		strict(search, "placeholder", "position", "maxWidth")
		optionalFeedText(search, "placeholder", 150)
		optionalEnum(search, "position", "start", "end")
		validContentsNumber(search, "maxWidth", 160, 800)
	}
}
func validFeedTopics(row Row) {
	strict(row, "allLabel", "labels")
	optionalFeedText(row, "allLabel", 100)
	if _, exists := row["labels"]; !exists {
		return
	}
	labels := objectField(row, "labels")
	for key := range labels {
		if textLength(key) < 1 || textLength(key) > 100 {
			fail(400, "Invalid topic label key")
		}
		stringField(labels, key, 1, 100, false)
	}
}

func feedText(raw any, key, fallback string) string {
	if text, ok := object(raw)[key].(string); ok {
		return text
	}
	return fallback
}
func feedSearchFirst(home Row) bool {
	switch home.str("searchPosition") {
	case "above":
		return true
	case "below":
		return false
	}
	return object(object(home["feedFilters"])["search"]).str("position") == "start"
}
func feedRowStyle(raw any) template.CSS {
	row := object(raw)
	values := []string{}
	for _, field := range []struct{ key, property string }{{"paddingBlock", "padding"}, {"gap", "gap"}} {
		if value, ok := row[field.key].(float64); ok {
			values = append(values, fmt.Sprintf("--feed-%s:%gpx", field.property, value))
		}
	}
	return template.CSS(strings.Join(values, ";")) // #nosec G203 -- CSS property names are fixed and values are formatted float64 numbers.
}
func feedSearchStyle(raw any) template.CSS {
	if value, ok := object(raw)["maxWidth"].(float64); ok {
		return template.CSS(fmt.Sprintf("max-width:%gpx", value)) // #nosec G203 -- Only a formatted float64 supplies max-width; no author strings enter CSS.
	}
	return ""
}
