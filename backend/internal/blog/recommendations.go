package blog

import (
	"context"
	"net/http"
)

func defaultRecommendations() Row { return Row{"mode": "automatic", "postIds": []string{}} }
func validRecommendations(input Row, key string) any {
	value := objectField(input, key)
	strict(value, "mode", "postIds")
	mode := enumField(value, "mode", "automatic", "smart", "manual")
	items, ok := value["postIds"].([]any)
	if !ok || len(items) > 2 {
		fail(400, "recommendations: choose up to two posts")
	}
	ids := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		id, ok := item.(string)
		if !ok || !uuidRE.MatchString(id) || seen[id] {
			fail(400, "recommendations: post IDs must be unique valid IDs")
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if mode != "manual" && len(ids) > 0 {
		fail(400, "recommendations: automatic mode cannot include manually selected posts")
	}
	return Row{"mode": mode, "postIds": ids}
}
func (a *App) validateRecommendationPosts(ctx context.Context, id string, value any) {
	for _, selected := range rssTags(object(value)["postIds"]) {
		if selected == id {
			fail(400, "recommendations: a post cannot recommend itself")
		}
		if len(a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1 AND status='published'", selected)) == 0 {
			fail(400, "recommendations: choose published posts only")
		}
	}
}
func (a *App) recommendationSettings(ctx context.Context, id string) Row {
	return object(a.getPost(ctx, id)["recommendations"])
}
func (a *App) relatedPosts(ctx context.Context, id string) []Row {
	source := a.getPost(ctx, id)
	config := object(source["recommendations"])
	ids := rssTags(config["postIds"])
	if config.str("mode") == "smart" {
		ids = rssTags(source["recommended_ids"])
	}
	rows := []Row{}
	if config.str("mode") != "automatic" {
		for _, selected := range ids {
			rows = append(rows, a.DB.Must(ctx, "SELECT * FROM posts WHERE id=$1 AND id<>$2 AND status='published'", selected, id)...)
		}
	} else {
		rows = a.DB.Must(ctx, "SELECT * FROM posts WHERE status='published' AND id<>$1 ORDER BY created_at DESC,id DESC LIMIT 2", id)
	}
	result := []Row{}
	for _, row := range rows {
		result = append(result, post(row))
	}
	return result
}
func (a *App) readRecommendations(w http.ResponseWriter, r *http.Request) {
	row := a.getPost(r.Context(), r.PathValue("id"))
	send(w, 200, Row{"settings": a.recommendationSettings(r.Context(), row.str("id")), "posts": a.relatedPosts(r.Context(), row.str("id"))})
}
