package blog

import (
	_ "embed"
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf16"
)

//go:embed default-theme.json
var defaultThemeJSON []byte

//go:embed fonts.json
var fontsJSON []byte
var uuidRE = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var slugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var hexColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)
var keyRE = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
var coverRE = regexp.MustCompile(`^/api/public/covers/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var logoRE = regexp.MustCompile(`^/api/public/logos/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var assetRE = regexp.MustCompile(`^/api/assets/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$`)

func textLength(s string) int { return len(utf16.Encode([]rune(s))) }
func stringField(row Row, key string, min, max int, trim bool) string {
	v, ok := row[key].(string)
	if trim {
		v = strings.TrimSpace(v)
	}
	if !ok || textLength(v) < min || textLength(v) > max {
		fail(400, key+": invalid text length or type")
	}
	return v
}
func enumField(row Row, key string, values ...string) string {
	v, ok := row[key].(string)
	if ok {
		for _, value := range values {
			if v == value {
				return v
			}
		}
	}
	fail(400, key+": invalid value")
	return ""
}
func booleanField(row Row, key string) bool {
	v, ok := row[key].(bool)
	if !ok {
		fail(400, key+": expected a boolean")
	}
	return v
}
func strict(row Row, keys ...string) {
	for key := range row {
		found := false
		for _, k := range keys {
			if k == key {
				found = true
				break
			}
		}
		if !found {
			fail(400, "Unknown field: "+key)
		}
	}
}

var emailPattern = regexp.MustCompile(`^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$`)

func emailField(row Row, key string, trim bool) string {
	v := stringField(row, key, 1, 254, trim)
	if !emailPattern.MatchString(v) {
		fail(400, key+": invalid email")
	}
	return strings.ToLower(v)
}
func httpURL(s string) bool {
	lower := strings.ToLower(s)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}

type fieldValidator func(Row, string) any

func textRule(min, max int, trim bool) fieldValidator {
	return func(row Row, key string) any { return stringField(row, key, min, max, trim) }
}

var postRules = map[string]fieldValidator{
	"edits":           validContentEdits,
	"coverMode":       func(row Row, key string) any { return enumField(row, key, "player", "preview") },
	"contentType":     func(row Row, key string) any { return enumField(row, key, "article", "guide") },
	"tableOfContents": func(row Row, key string) any { return enumField(row, key, "off", "top", "left", "right") },
	"title":           textRule(1, 240, true), "excerpt": textRule(0, 2000, false), "content": textRule(0, 2000000, false), "revision": textRule(0, 3000000, false),
	"slug": func(row Row, key string) any {
		s := stringField(row, key, 1, 180, false)
		if !slugRE.MatchString(s) {
			fail(400, "slug: invalid slug")
		}
		return s
	},
	"status":   func(row Row, key string) any { return enumField(row, key, "draft", "published", "archived") },
	"featured": func(row Row, key string) any { return booleanField(row, key) },
	"cover":    validateCover, "tags": validateTags, "seo": validPostSEO, "recommendations": validRecommendations,
}

func validateCover(row Row, key string) any {
	s := stringField(row, key, 0, 2048, false)
	if s != "" && !httpURL(s) && !coverRE.MatchString(s) && !audioUploadRE.MatchString(s) && !videoUploadRE.MatchString(s) && !assetRE.MatchString(s) {
		fail(400, "cover: use an http or https URL")
	}
	return s
}
func validateTags(row Row, key string) any {
	values, ok := row[key].([]any)
	if !ok || len(values) > 30 {
		fail(400, "tags: invalid tags")
	}
	tags := []string{}
	for _, tag := range values {
		tags = append(tags, stringField(Row{"tag": tag}, "tag", 1, 50, true))
	}
	return tags
}
func validPost(input Row, partial bool) Row {
	out := Row{}
	if !partial {
		if _, exists := input["edits"]; exists {
			fail(400, "edits are only supported when updating a post.")
		}
		out = Row{"contentType": "article", "tableOfContents": "off", "featured": false, "excerpt": "", "status": "draft", "tags": []string{}, "cover": "", "coverMode": "player", "seo": defaultPostSEO(), "recommendations": defaultRecommendations()}
		requireFields(input, "title", "slug", "content")
	}
	for key, validate := range postRules {
		if _, exists := input[key]; exists {
			out[key] = validate(input, key)
		}
	}
	return out
}
func requireFields(input Row, keys ...string) {
	for _, key := range keys {
		if _, ok := input[key]; !ok {
			fail(400, key+": required")
		}
	}
}
func objectField(input Row, key string) Row {
	obj, ok := input[key].(map[string]any)
	if !ok {
		fail(400, key+": required")
	}
	return Row(obj)
}
func colorField(input Row, key string) {
	if !hexColor.MatchString(stringField(input, key, 7, 7, false)) {
		fail(400, key+": invalid color")
	}
}
func validTheme(input Row) Row {
	strict(input, "publicationType", "logo", "name", "description", "accent", "background", "text", "imageBorder", "videoBorder", "footerTitle", "showFooterTitle", "showFooterLogo", "footerDescription", "footerLinks", "footerLayout", "footerBackground", "footerText", "footerFont", "homepage", "article", "guide", "comments")
	validPublicationAppearance(input)
	validFooterLabels(input)
	enumField(input, "publicationType", "blog", "article", "research")
	logo := stringField(input, "logo", 0, 2048, false)
	if logo != "" && !httpURL(logo) && !logoRE.MatchString(logo) {
		fail(400, "logo: invalid URL")
	}
	input["name"] = stringField(input, "name", 1, 100, true)
	stringField(input, "description", 0, 500, false)
	colorField(input, "accent")
	validHomepage(objectField(input, "homepage"))
	validContentDesigns(input)
	validComments(objectField(input, "comments"))
	return input
}
func validBorder(row Row) {
	enumField(row, "border", "subtle", "bold")
	radius, ok := row["radius"].(float64)
	if !ok || radius < 0 || radius > 32 || radius != float64(int(radius)) {
		fail(400, "radius: invalid value")
	}
}
func validAppearance(row Row) {
	validTypography(row)
	validBorder(row)
	validSectionColors(row)
	var fonts []string
	must(json.Unmarshal(fontsJSON, &fonts))
	enumField(row, "font", fonts...)
	enumField(row, "width", "narrow", "wide")
}
func validateBooleans(row Row, keys ...string) {
	for _, key := range keys {
		booleanField(row, key)
	}
}
func validHomepage(row Row) {
	validHomepageSections(row)
	validHomePresentation(row)
	validFeaturedDesign(row)
	validHomepagePagination(row)
	validArtwork(row)
	validHomepageLabels(row)
	validAppearance(row)
	stringField(row, "title", 0, 200, false)
	stringField(row, "description", 0, 1000, false)
	validHomeStructure(row)
	bools := []string{"showDates", "showTags", "showHero", "showArtwork", "includeFeaturedInFeed", "showExcerpts", "showImages"}
	validateBooleans(row, bools...)
	strict(row, presentationKeys(append([]string{"border", "radius", "font", "width", "background", "text", "accent", "title", "description", "sections", "layout", "heroLayout", "artworkType", "artworkEmoji", "artworkImage", "artworkVideo", "tagline", "showTagline", "pageSize", "pagination"}, bools...), "homepage")...)
}
func validArticle(row Row) {
	validArticlePresentation(row)
	validAppearance(row)
	validArticleStructure(row)
	bools := []string{"showDates", "showTags", "showCover", "showExcerpt"}
	validateBooleans(row, bools...)
	strict(row, presentationKeys(append([]string{"border", "radius", "font", "width", "background", "text", "accent", "headerLayout"}, bools...), "article")...)
}
func validComments(row Row) {
	validBorder(row)
	enumField(row, "layout", "minimal", "cards")
	stringField(row, "heading", 0, 150, false)
	stringField(row, "introduction", 0, 1000, false)
	row["buttonLabel"] = stringField(row, "buttonLabel", 1, 60, true)
	for _, key := range []string{"nameLabel", "emailLabel", "bodyLabel"} {
		row[key] = stringField(row, key, 1, 80, true)
	}
	stringField(row, "placeholder", 0, 500, false)
	colorField(row, "background")
	validateBooleans(row, "visible", "enabled", "showAvatars", "showDates")
	strict(row, "border", "radius", "layout", "heading", "introduction", "buttonLabel", "nameLabel", "emailLabel", "bodyLabel", "placeholder", "background", "visible", "enabled", "showAvatars", "showDates")
}
func defaultTheme() Row { var row Row; must(json.Unmarshal(defaultThemeJSON, &row)); return row }
func parseTheme(v any) (result Row) {
	if v == nil {
		return defaultTheme()
	}
	defer func() {
		if problem := recover(); problem != nil {
			if _, ok := problem.(*HTTPError); !ok {
				panic(problem)
			}
			fail(500, "Saved design is invalid. Save a valid design in Settings.")
		}
	}()
	row, ok := v.(map[string]any)
	if !ok {
		fail(500, "Saved design is invalid. Save a valid design in Settings.")
	}
	// Ignore the retired experimental documentation design in saved settings.
	delete(row, "doc")
	return validTheme(row)
}
