package blog

import "context"

func commentsVisible(theme Row) bool {
	return Row(theme["comments"].(map[string]any)).yes("visible")
}

func (a *App) visibleComments(ctx context.Context, theme Row, postID string) []Row {
	result := []Row{}
	if !a.commentsOpen(ctx, theme) {
		return result
	}
	showQuestions := a.publicInteractionSettings(ctx).str("questions") != "hidden"
	for _, row := range a.DB.Must(ctx, `SELECT c.*,q.quote,q.anchor_status,q.answer
		FROM comments c LEFT JOIN passage_questions q ON q.comment_id=c.id
		WHERE c.post_id=$1 AND c.approved=TRUE
		AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=c.id)
		AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL)
		AND (q.comment_id IS NULL OR ($2 AND q.anchor_status<>'hidden'))
		ORDER BY c.created_at ASC,c.id ASC`, postID, showQuestions) {
		if row.str("quote") != "" {
			question := passageQuestion(row)
			question["followups"] = a.questionFollowups(ctx, row.str("id"), true)
			result = append(result, question)
		} else {
			result = append(result, comment(row, false))
		}
	}
	return result
}

func (a *App) commentsOpen(ctx context.Context, theme Row) bool {
	return commentsVisible(theme) && object(theme["comments"]).yes("enabled")
}
