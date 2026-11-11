package blog

import "strings"

func defaultPostSEO() Row {
	return Row{"title": "", "description": "", "image": ""}
}
func validPostSEO(input Row, key string) any {
	seo := objectField(input, key)
	strict(seo, "title", "description", "image", "noindex", "nofollow")
	result := Row{"title": stringField(seo, "title", 0, 120, true), "description": stringField(seo, "description", 0, 320, true), "image": postSEOImage(seo)}
	for _, field := range []string{"noindex", "nofollow"} {
		if _, exists := seo[field]; exists {
			result[field] = booleanField(seo, field)
		}
	}
	return result
}
func postSEOImage(seo Row) string {
	image := strings.TrimSpace(seo.str("image"))
	if assetRE.MatchString(image) {
		return image
	}
	return seoImageField(seo, "image")
}
func postSearchTitle(item, theme Row) string {
	if title := object(item["seo"]).str("title"); title != "" {
		return title
	}
	return item.str("title") + " — " + theme.str("name")
}
func postSearchDescription(item Row, content string) string {
	for _, description := range []string{object(item["seo"]).str("description"), item.str("excerpt")} {
		if strings.TrimSpace(description) != "" {
			return description
		}
	}
	return rssSummary(item, rssMarkdown(content, "https://description.invalid/"))
}
func postShareImage(item, siteSEO Row) string {
	if image := object(item["seo"]).str("image"); image != "" {
		return image
	}
	if cover := coverImage(item.str("cover")); cover != "" {
		return cover
	}
	return siteSEO.str("image")
}
