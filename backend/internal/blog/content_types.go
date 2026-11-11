package blog

// Historical rows and revision snapshots predate content types.
func postContentType(row Row) string {
	if row.str("content_type") == "guide" {
		return "guide"
	}
	return "article"
}

func validContentDesigns(theme Row) {
	validArticle(objectField(theme, "article"))
	for _, kind := range []string{"guide"} {
		if _, exists := theme[kind]; exists {
			validArticle(objectField(theme, kind))
		}
	}
}
