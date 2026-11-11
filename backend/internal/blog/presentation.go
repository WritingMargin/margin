package blog

import "encoding/json"

var typographyKeys = []string{"headingFont", "headingScale", "spacing"}
var homePresentationKeys = []string{"feedHeader", "feedFilters", "sectionSpacing", "cardStyle", "imageRatio", "gridColumns", "showNumbers", "showSearch", "showTopicFilters", "showPostCount", "showFeedHeading", "showFeatured", "searchPosition", "featuredPosition"}
var articlePresentationKeys = []string{"tableOfContents", "bodySize", "lineSpacing", "measure", "headingStyle", "quoteStyle"}

func optionalEnum(row Row, key string, values ...string) {
	if _, exists := row[key]; exists {
		enumField(row, key, values...)
	}
}

func validTypography(row Row) {
	var fonts []string
	must(json.Unmarshal(fontsJSON, &fonts))
	optionalEnum(row, "headingFont", fonts...)
	optionalEnum(row, "headingScale", "standard", "compact", "display")
	optionalEnum(row, "spacing", "standard", "compact", "airy")
}

func validHomePresentation(row Row) {
	validFeedDesign(row)
	optionalEnum(row, "sectionSpacing", "none", "compact", "standard", "airy")
	optionalEnum(row, "cardStyle", "classic", "flat", "outlined", "filled")
	optionalEnum(row, "imageRatio", "auto", "landscape", "square", "portrait")
	optionalEnum(row, "gridColumns", "two", "three")
	optionalEnum(row, "searchPosition", "inline", "above", "below")
	optionalEnum(row, "featuredPosition", "before", "after")
	for _, key := range []string{"showNumbers", "showSearch", "showTopicFilters", "showPostCount", "showFeedHeading", "showFeatured"} {
		if _, exists := row[key]; exists {
			booleanField(row, key)
		}
	}
}

func validArticlePresentation(row Row) {
	validContentsDesign(row)
	optionalEnum(row, "bodySize", "small", "regular", "large")
	optionalEnum(row, "lineSpacing", "compact", "relaxed", "loose")
	optionalEnum(row, "measure", "auto", "focused", "reading", "wide")
	optionalEnum(row, "headingStyle", "plain", "ruled", "accent")
	optionalEnum(row, "quoteStyle", "border", "pull", "panel")
}

func presentationKeys(keys []string, section string) []string {
	keys = append(keys, typographyKeys...)
	if section == "homepage" {
		return append(keys, homePresentationKeys...)
	}
	return append(keys, articlePresentationKeys...)
}
