package blog

import "regexp"

var templateID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
var templateVersion = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

func validTemplateCatalog(catalog Row) (valid bool) {
	defer func() {
		if err := recover(); err != nil {
			if _, ok := err.(*HTTPError); !ok {
				panic(err)
			}
			valid = false
		}
	}()
	strict(catalog, "schemaVersion", "version", "homepage", "article", "writing", "content")
	version := catalog["schemaVersion"]
	if (version != float64(4) && version != float64(5)) || !templateVersion.MatchString(catalog.str("version")) {
		fail(400, "Unsupported template catalog")
	}
	for _, section := range []string{"homepage", "article", "writing"} {
		validTemplateCollection(catalog[section], section)
	}
	if version == float64(5) {
		validTemplateCollection(catalog["content"], "content")
	} else if _, exists := catalog["content"]; exists {
		fail(400, "Content templates require catalog version 5")
	}
	return true
}

func validTemplateCollection(value any, section string) {
	items, ok := value.([]any)
	if !ok || len(items) == 0 || len(items) > 50 {
		fail(400, "Invalid template collection")
	}
	seen := map[string]bool{}
	for _, item := range items {
		row := object(item)
		id := row.str("id")
		if !templateID.MatchString(id) || seen[id] {
			fail(400, "Invalid or duplicate template ID")
		}
		seen[id] = true
		validTemplate(row, section)
	}
}

func validTemplate(row Row, section string) {
	stringField(row, "name", 1, 80, true)
	stringField(row, "description", 1, 300, true)
	if section == "writing" {
		strict(row, "id", "name", "description", "content", "supportedContentTypes")
		validTemplateContentTypes(row)
		stringField(row, "content", 1, 20000, true)
		return
	}
	if section == "content" {
		validContentTemplate(row)
		return
	}
	strict(row, "id", "name", "description", "design")
	design := objectField(row, "design")
	validAppearance(design)
	for _, key := range []string{"background", "text", "accent"} {
		colorField(design, key)
	}
	validTemplateLayout(design, section)
}

func validTemplateLayout(design Row, section string) {
	keys := []string{"font", "width", "border", "radius", "background", "text", "accent"}
	bools := []string{"showDates", "showTags", "showCover", "showExcerpt"}
	if section == "homepage" {
		enumField(design, "layout", "list", "grid", "magazine")
		enumField(design, "heroLayout", "split", "centered", "sidebar")
		validHomePresentation(design)
		validHomepageSections(design)
		keys = append(keys, "layout", "heroLayout", "sections")
		bools = []string{"showDates", "showTags", "showHero", "showArtwork", "showExcerpts", "showImages"}
	} else {
		enumField(design, "headerLayout", "standard", "cover-first", "split", "centered")
		validArticlePresentation(design)
		keys = append(keys, "headerLayout")
	}
	strict(design, presentationKeys(append(keys, bools...), section)...)
	validateBooleans(design, bools...)
}

func validTemplateContentTypes(row Row) {
	value, exists := row["supportedContentTypes"]
	if !exists {
		return
	}
	kinds, ok := value.([]any)
	if !ok || len(kinds) == 0 || len(kinds) > 3 {
		fail(400, "Invalid supported content types")
	}
	seen := map[string]bool{}
	for _, value := range kinds {
		kind := enumField(Row{"kind": value}, "kind", "article", "guide")
		if seen[kind] {
			fail(400, "Duplicate supported content type")
		}
		seen[kind] = true
	}
}

func validContentTemplate(row Row) {
	strict(row, "id", "name", "description", "designs")
	designs := objectField(row, "designs")
	strict(designs, "article", "guide")
	if len(designs) == 0 {
		fail(400, "A content template must support at least one content type")
	}
	for _, value := range designs {
		design := object(value)
		validAppearance(design)
		for _, key := range []string{"background", "text", "accent"} {
			colorField(design, key)
		}
		validTemplateLayout(design, "article")
	}
}
