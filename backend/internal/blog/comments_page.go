package blog

import (
	"net/http"
	"slices"
	"strconv"
)

// The paged moderation inbox applies every filter and ordering rule in SQL.
// Bare /api/comments retains its historical array response for older clients.
func (a *App) commentsPage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := moderationChoice(q.Get("status"), "all", "Invalid conversation status.", "all", "pending")
	kind := moderationChoice(q.Get("kind"), "all", "Invalid conversation type.", "all", "questions", "comments")
	offset := moderationOffset(q.Get("offset"), "Invalid conversation offset.")
	const base = ` FROM comments c LEFT JOIN passage_questions q ON q.comment_id=c.id
		LEFT JOIN section_anchors a ON a.id=c.id
		WHERE NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=c.id)
		AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL)`
	const pending = `(c.approved=FALSE OR EXISTS (SELECT 1 FROM passage_followups f WHERE f.question_id=c.id AND f.approved=FALSE)
		)`
	const filter = ` AND ($1='all' OR ` + pending + `) AND ($2='all' OR
		($2='questions' AND q.comment_id IS NOT NULL) OR
		($2='comments' AND q.comment_id IS NULL))`
	query := `SELECT c.*,COALESCE(q.quote,a.quote,'') AS quote,
		COALESCE(q.anchor_status,a.anchor_status,'active') AS anchor_status,q.answer,
		CASE WHEN q.comment_id IS NOT NULL THEN 'question' ELSE 'comment' END AS kind` + base + filter + ` ORDER BY c.created_at DESC,c.id DESC LIMIT 21 OFFSET $3`
	rows := a.DB.Must(r.Context(), query, status, kind, offset)
	hasMore := len(rows) > 20
	if hasMore {
		rows = rows[:20]
	}
	items := make([]Row, 0, len(rows))
	for _, row := range rows {
		item := comment(row, true)
		if row.str("kind") == "question" {
			item["followups"] = a.questionFollowups(r.Context(), row.str("id"), false)
		}
		items = append(items, item)
	}
	total := first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS count`+base))
	pendingCount := first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS count`+base+` AND `+pending))
	selected := first(a.DB.Must(r.Context(), `SELECT COUNT(*) AS count`+base+filter, status, kind))
	send(w, 200, Row{"comments": items, "hasMore": hasMore, "counts": Row{"pending": pendingCount["count"], "total": total["count"], "selected": selected["count"]}})
}

func moderationChoice(raw, fallback, invalidMessage string, allowed ...string) string {
	if raw == "" {
		return fallback
	}
	if !slices.Contains(allowed, raw) {
		fail(400, invalidMessage)
	}
	return raw
}

func moderationOffset(raw, invalidMessage string) int {
	if raw == "" {
		return 0
	}
	offset, err := strconv.Atoi(raw)
	if err != nil || offset < 0 {
		fail(400, invalidMessage)
	}
	return offset
}
