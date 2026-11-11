package blog

import "net/http"

func validFeaturedDesign(row Row) {
	if _, exists := row["includeFeaturedInFeed"]; !exists {
		row["includeFeaturedInFeed"] = false
	}
	booleanField(row, "includeFeaturedInFeed")
}

func (a *App) homepageFeatured(r *http.Request, tags []string) []Row {
	query, args := a.homepageWhere(tags, false)
	result := []Row{}
	for _, row := range a.DB.Must(r.Context(), "SELECT * FROM posts"+query+" AND featured=TRUE ORDER BY created_at DESC,id ASC", args...) {
		result = append(result, post(row))
	}
	return result
}
