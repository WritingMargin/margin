package blog

import (
	"context"
	"net/http"
)

func (a *App) recommendationConfig(w http.ResponseWriter, r *http.Request) {
	if a.accountToken(r.Context()) == "" {
		send(w, 200, Row{"available": false, "connected": false})
		return
	}
	config := a.aiConfig(r.Context())
	send(w, 200, Row{"available": object(config["features"]).yes("recommendations"), "connected": true, "cost": object(config["costs"])["recommendations"]})
}
func (a *App) prepareRecommendedIDs(ctx context.Context, id string, input Row, content string) []string {
	if input.str("status") != "published" || object(input["recommendations"]).str("mode") != "smart" {
		return []string{}
	}
	candidates := a.DB.Must(ctx, "SELECT id,title,excerpt,tags FROM posts WHERE status='published' AND id<>$1 ORDER BY created_at DESC,id ASC", id)
	if len(candidates) == 0 {
		return []string{}
	}
	text := []rune(content)
	source := Row{"title": input["title"], "excerpt": input["excerpt"], "tags": input["tags"], "content": string(text[:min(len(text), 6000)])}
	result := a.serviceRequest(ctx, "/v1/generations/recommendations", Row{"source": source, "candidates": candidates}, uuid())
	return selectedRecommendationIDs(result, candidates)
}
func selectedRecommendationIDs(result Row, candidates []Row) []string {
	values, ok := result["postIds"].([]any)
	if !ok || len(values) > 2 {
		invalidRecommendations()
	}
	allowed := map[string]bool{}
	for _, candidate := range candidates {
		allowed[candidate.str("id")] = true
	}
	ids := []string{}
	for _, value := range values {
		id, ok := value.(string)
		if !ok || !allowed[id] {
			invalidRecommendations()
		}
		allowed[id] = false
		ids = append(ids, id)
	}
	return ids
}
func invalidRecommendations() {
	coded(502, "AI recommendations could not be verified. Your post was not saved. Try again or choose related posts yourself.", "AI_INVALID_RESPONSE")
}
