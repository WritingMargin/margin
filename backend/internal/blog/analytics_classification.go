package blog

import (
	"context"
	"net/http"
	"slices"
	"time"
)

var analyticsContentTypes = []string{"Tutorial", "Essay", "News", "Review", "Case study", "Interview", "Reference", "Personal story", "Other / mixed"}
var analyticsWritingStyles = []string{"Conversational", "Analytical", "Narrative", "Instructional", "Persuasive", "Reflective", "Reportorial", "Other / mixed"}

func (a *App) analyticsClassificationConfig(w http.ResponseWriter, r *http.Request) {
	period := analyticsDates(r)
	args := []any{period.Page, period.ContentType}
	pending := ` FROM posts p LEFT JOIN analytics_classifications c ON c.post_id=p.id AND c.revision=p.revision WHERE p.status='published' AND c.post_id IS NULL AND ($1='' OR p.id=$1) AND ($2='' OR p.content_type=$2)`
	result := Row{"available": false, "connected": false, "pending": first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS total`+pending, args...))["total"], "queue": a.DB.Must(r.Context(), `SELECT p.id,p.title,p.revision`+pending+` ORDER BY p.title,p.id LIMIT 10`, args...)}
	result["published"] = first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS total FROM posts WHERE status='published' AND ($1='' OR id=$1) AND ($2='' OR content_type=$2)`, args...))["total"]
	if a.accountToken(r.Context()) != "" {
		config := a.aiConfig(r.Context())
		result["available"], result["connected"] = object(config["features"]).yes("classification"), true
		result["cost"] = object(config["costs"])["classification"]
	}
	send(w, 200, result)
}
func (a *App) classifyAnalytics(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	id := stringField(input, "postId", 36, 36, false)
	revision := stringField(input, "revision", 1, 100, false)
	item := first(a.DB.Must(r.Context(), `SELECT * FROM posts WHERE id=$1 AND status='published'`, id))
	if item == nil {
		fail(404, "Published article not found.")
	}
	if item.str("revision") != revision {
		fail(409, "Article changed. Refresh analytics before classifying it.")
	}
	cached := first(a.DB.Must(r.Context(), `SELECT content_type,writing_style FROM analytics_classifications WHERE post_id=$1 AND revision=$2`, id, revision))
	if cached != nil {
		send(w, 200, cached)
		return
	}
	content := []rune(a.postContent(r.Context(), item).str("content"))
	if len(content) > 40000 {
		fail(400, "This article is too long to classify (maximum 40,000 characters).")
	}
	a.DB.Must(r.Context(), `INSERT INTO analytics_classification_jobs(post_id,revision,request_id) VALUES($1,$2,$3) ON CONFLICT(post_id,revision) DO NOTHING`, id, revision, uuid())
	job := first(a.DB.Must(r.Context(), `SELECT request_id FROM analytics_classification_jobs WHERE post_id=$1 AND revision=$2`, id, revision))
	result := a.requestAnalyticsClassification(r.Context(), item, job.str("request_id"), string(content))
	send(w, 200, result)
}
func (a *App) requestAnalyticsClassification(ctx context.Context, item Row, requestID, content string) Row {
	defer a.resetFailedAnalyticsClassification(ctx, item, requestID)
	result := a.serviceRequest(ctx, "/v1/generations/classification", Row{"title": item["title"], "content": content}, requestID)
	if !slices.Contains(analyticsContentTypes, result.str("contentType")) || !slices.Contains(analyticsWritingStyles, result.str("writingStyle")) {
		coded(502, "The classification response could not be verified.", "AI_INVALID_RESPONSE")
	}
	settle, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	a.DB.Must(settle, `INSERT INTO analytics_classifications(post_id,revision,content_type,writing_style) VALUES($1,$2,$3,$4) ON CONFLICT(post_id,revision) DO NOTHING`, item["id"], item["revision"], result["contentType"], result["writingStyle"])
	return Row{"content_type": result["contentType"], "writing_style": result["writingStyle"]}
}
func (a *App) resetFailedAnalyticsClassification(ctx context.Context, item Row, requestID string) {
	if failure := recover(); failure != nil {
		if e, ok := failure.(*HTTPError); ok && slices.Contains([]string{"AI_GENERATION_FAILED", "AI_INTERRUPTED", "AI_RESULT_EXPIRED"}, e.Code) {
			settle, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
			defer cancel()
			a.DB.Must(settle, `DELETE FROM analytics_classification_jobs WHERE post_id=$1 AND revision=$2 AND request_id=$3`, item["id"], item["revision"], requestID)
		}
		panic(failure)
	}
}
