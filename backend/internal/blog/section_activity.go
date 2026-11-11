package blog

import (
	"context"
	"net/http"
	"strconv"
)

func (a *App) publicSectionActivity(w http.ResponseWriter, r *http.Request) {
	post := a.publishedInteractionPost(r)
	quote := r.URL.Query().Get("quote")
	if len(quote) > 2000 {
		fail(400, "Choose a passage to view its activity.")
	}
	occurrence := sectionQueryOccurrence(r)
	config := a.publicInteractionSettings(r.Context())
	reader := a.commentReader(r)
	if quote == "" {
		send(w, 200, Row{"entries": []Row{}, "questions": []Row{}, "reactions": []Row{}})
		return
	}
	questions := a.sectionQuestions(r.Context(), post, quote, occurrence, config, reader)
	reactions := a.visibleReactionsForSection(r.Context(), post.str("id"), quote, occurrence)
	entries := make([]Row, 0, len(questions))
	for _, question := range questions {
		entries = append(entries, Row{"kind": "question", "item": question})
	}
	send(w, 200, Row{"entries": entries, "questions": questions, "reactions": reactions})
}

func sectionQueryOccurrence(r *http.Request) int {
	occurrence := 0
	if raw := r.URL.Query().Get("occurrence"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 || value > 10000 {
			fail(400, "Invalid passage occurrence.")
		}
		occurrence = value
	}
	return occurrence
}

func (a *App) sectionQuestions(ctx context.Context, post Row, quote string, occurrence int, config, reader Row) []Row {
	questions := []Row{}
	if config.str("questions") == "hidden" {
		return questions
	}
	for _, row := range a.DB.Must(ctx, `SELECT c.*,q.quote,q.anchor_status,q.answer,ca.reader_id,
			COALESCE(sa.anchor_status,'active') AS section_anchor_status,COALESCE(sa.position,0) AS position,COALESCE(sa.occurrence,0) AS occurrence
			FROM comments c JOIN passage_questions q ON q.comment_id=c.id LEFT JOIN comment_authors ca ON ca.comment_id=c.id
			LEFT JOIN section_anchors sa ON sa.id=c.id WHERE c.post_id=$1 AND q.quote=$2 AND sa.occurrence=$3
			AND c.approved=TRUE AND q.anchor_status<>'hidden'
			AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL)
			ORDER BY c.created_at,c.id`, post["id"], quote, occurrence) {
		question := passageQuestion(row)
		question["followups"] = a.readerQuestionFollowups(ctx, row.str("id"), readerIDForQuestion(reader, row))
		question["canReply"] = reader != nil && row.str("reader_id") == reader.str("id") && first(a.DB.Must(ctx, "SELECT id FROM passage_followups WHERE question_id=$1 AND answer='' LIMIT 1", row["id"])) == nil
		questions = append(questions, question)
	}
	return questions
}
