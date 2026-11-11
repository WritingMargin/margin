package blog

func validSectionColors(row Row) {
	for _, key := range []string{"background", "text", "accent"} {
		if _, exists := row[key]; exists {
			colorField(row, key)
		}
	}
}

func sectionColor(theme, look Row, key string) string {
	if value := look.str(key); value != "" {
		return value
	}
	return theme.str(key)
}

// Fill only newly introduced fields so existing saved themes remain compatible.
func validPublicationAppearance(input Row) {
	defaults := defaultTheme()
	for _, key := range []string{"background", "text", "imageBorder", "videoBorder"} {
		if _, exists := input[key]; !exists {
			input[key] = defaults[key]
		}
	}
	colorField(input, "background")
	colorField(input, "text")
	enumField(input, "imageBorder", "none", "subtle", "bold")
	enumField(input, "videoBorder", "none", "subtle", "bold")
}

func mediaBorderWidth(value string) string {
	width := map[string]string{"none": "0px", "subtle": "1px", "bold": "2px"}[value]
	if width == "" {
		return "1px"
	}
	return width
}

func validHomeStructure(row Row) {
	if _, exists := row["heroLayout"]; !exists {
		row["heroLayout"] = "split"
	}
	enumField(row, "layout", "list", "grid", "magazine")
	enumField(row, "heroLayout", "split", "centered", "sidebar")
}

func validArticleStructure(row Row) {
	if _, exists := row["headerLayout"]; !exists {
		row["headerLayout"] = "standard"
	}
	enumField(row, "headerLayout", "standard", "cover-first", "split", "centered")
}
