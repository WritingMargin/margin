package blog

import (
	"context"
	"net/http"
	"time"
)

func (a *App) questionFollowups(ctx context.Context, questionID string, public bool) []Row {
	result := []Row{}
	query := "SELECT id,body,answer,approved,created_at FROM passage_followups WHERE question_id=$1 ORDER BY created_at,id"
	if public {
		query = "SELECT id,body,answer,approved,created_at FROM passage_followups WHERE question_id=$1 AND approved=TRUE ORDER BY created_at,id"
	}
	for _, row := range a.DB.Must(ctx, query, questionID) {
		result = append(result, Row{"id": row["id"], "body": row["body"], "answer": row["answer"], "approved": row["approved"], "createdAt": row["created_at"]})
	}
	return result
}

func (a *App) readerQuestionFollowups(ctx context.Context, questionID, readerID string) []Row {
	if readerID == "" {
		return a.questionFollowups(ctx, questionID, true)
	}
	result := []Row{}
	for _, row := range a.DB.Must(ctx, "SELECT id,body,answer,approved,created_at FROM passage_followups WHERE question_id=$1 AND (approved=TRUE OR reader_id=$2) ORDER BY created_at,id", questionID, readerID) {
		result = append(result, Row{"id": row["id"], "body": row["body"], "answer": row["answer"], "approved": row["approved"], "createdAt": row["created_at"]})
	}
	return result
}

func (a *App) createPassageFollowup(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comments", 5, 15*time.Minute, false)
	reader := a.requireCommentReader(r)
	post := a.publishedInteractionPost(r)
	if a.publicInteractionSettings(r.Context()).str("questions") == "hidden" {
		fail(403, "Passage conversations are closed.")
	}
	question := first(a.DB.Must(r.Context(), `SELECT q.comment_id,q.answer FROM passage_questions q
		JOIN comments c ON c.id=q.comment_id JOIN comment_authors ca ON ca.comment_id=c.id
		WHERE q.comment_id=$1 AND c.post_id=$2 AND c.approved=TRUE AND q.anchor_status<>'hidden' AND ca.reader_id=$3`,
		r.PathValue("question"), post["id"], reader["id"]))
	if question == nil {
		fail(404, "This conversation is unavailable to reply to.")
	}
	if question.str("answer") == "" {
		fail(409, "The writer has not replied to this question yet.")
	}
	if first(a.DB.Must(r.Context(), "SELECT id FROM passage_followups WHERE question_id=$1 AND answer='' ORDER BY created_at DESC LIMIT 1", question["comment_id"])) != nil {
		fail(409, "Wait for the writer to reply before sending another follow-up.")
	}
	input := body(w, r)
	message := stringField(input, "body", 1, 10000, true)
	approved := !a.commentPolicy(r.Context()).yes("requireApproval")
	a.DB.Must(r.Context(), "INSERT INTO passage_followups(id,question_id,reader_id,body,approved) VALUES($1,$2,$3,$4,$5)", uuid(), question["comment_id"], reader["id"], message, approved)
	response := "Your reply is in the conversation."
	if !approved {
		response = "Your reply is awaiting approval."
	}
	send(w, 201, Row{"ok": true, "pending": !approved, "message": response})
}

func (a *App) moderatePassageFollowup(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "approved", "answer")
	if _, ok := input["approved"]; !ok {
		if _, ok := input["answer"]; !ok {
			fail(400, "Provide an answer or approval status.")
		}
	}
	followup := first(a.DB.Must(r.Context(), "SELECT f.id,f.approved,f.answer FROM passage_followups f WHERE f.id=$1 AND f.question_id=$2", r.PathValue("followup"), r.PathValue("id")))
	if followup == nil {
		fail(404, "Follow-up not found.")
	}
	approved := followup.yes("approved")
	answer := followup.str("answer")
	if _, ok := input["approved"]; ok {
		approved = booleanField(input, "approved")
	}
	if _, ok := input["answer"]; ok {
		answer = stringField(input, "answer", 0, 10000, true)
	}
	a.DB.Must(r.Context(), "UPDATE passage_followups SET approved=$1,answer=$2 WHERE id=$3", approved, answer, followup["id"])
	if answer != "" && followup.str("answer") == "" && approved {
		recipient := first(a.DB.Must(r.Context(), `SELECT f.reader_id,c.post_id FROM passage_followups f
			JOIN passage_questions q ON q.comment_id=f.question_id JOIN comments c ON c.id=q.comment_id WHERE f.id=$1`, followup["id"]))
		if recipient != nil { a.insertReaderAlert(r.Context(), recipient.str("reader_id"), "author_answered", recipient.str("post_id"), r.PathValue("id"), "followup-answer:"+followup.str("id"), "The author answered you") }
	}
	send(w, 200, Row{"ok": true})
}
