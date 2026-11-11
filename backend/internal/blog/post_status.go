package blog

import "net/http"

func requestedPostStatus(r *http.Request, public bool) string {
	status := "all"
	if values, exists := r.URL.Query()["status"]; exists {
		if len(values) != 1 {
			coded(400, "Use one status parameter.", "INVALID_STATUS")
		}
		status = values[0]
	}
	switch status {
	case "draft", "published", "archived", "all":
	default:
		coded(400, "status must be draft, published, archived, or all.", "INVALID_STATUS")
	}
	if public {
		if status != "published" && status != "all" {
			coded(400, "Public endpoints only return published posts.", "INVALID_STATUS")
		}
		return "published"
	}
	return status
}

func postsStatusQuery(status string) (string, []any) {
	if status == "all" {
		return "SELECT * FROM posts", nil
	}
	return "SELECT * FROM posts WHERE status=$1", []any{status}
}

// State is distinct from editing status: staged changes may be drafts of a live post.
func (a *App) postPublicationState(r *http.Request, row Row) string {
	live := a.getPost(r.Context(), row.str("id"))
	if live.str("status") == "published" || live.str("status") == "archived" {
		return live.str("status")
	}
	history := a.DB.Must(r.Context(), "SELECT revision FROM post_revisions WHERE post_id=$1 AND snapshot->>'status'='published' LIMIT 1", row["id"])
	if len(history) > 0 {
		return "unpublished"
	}
	return "never_published"
}
