package blog

import "net/http"

// Bindings select published content independently of feed filters and pagination.
func (a *App) homepageHeroPosts(r *http.Request) []Row {
	result := []Row{}
	for _, where := range []string{"", " AND featured=TRUE"} {
		rows := a.DB.Must(r.Context(), "SELECT * FROM posts WHERE status='published'"+where+" ORDER BY created_at DESC,id ASC LIMIT 1")
		if len(rows) > 0 {
			result = append(result, post(rows[0]))
		}
	}
	return result
}

func homepageHasFeatured(design Row) bool {
	if design["showFeatured"] == false {
		return false
	}
	sections, exists := design["sections"]
	if !exists {
		return true
	}
	for _, value := range sections.([]any) {
		if object(value).str("component") == "featured-posts" {
			return true
		}
	}
	return false
}
