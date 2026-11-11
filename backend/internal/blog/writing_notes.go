package blog

import "net/http"

func validWritingNote(input Row) Row {
	strict(input, "title", "body", "reason", "brief", "audience", "passage", "includedDraft", "sourceRevision", "feedback")
	result := Row{"title": "Thinking note", "reason": "", "brief": "", "audience": "", "passage": "", "sourceRevision": "", "includedDraft": false}
	for field, limit := range map[string]int{"title": 80, "reason": 2000, "brief": 4000, "audience": 500, "passage": 12000, "sourceRevision": 300} {
		if _, exists := input[field]; exists {
			result[field] = stringField(input, field, 0, limit, false)
		}
	}
	result["body"] = stringField(input, "body", 1, 4000, true)
	if _, exists := input["includedDraft"]; exists {
		result["includedDraft"] = booleanField(input, "includedDraft")
	}
	if _, exists := input["feedback"]; exists {
		result["feedback"] = stringField(input, "feedback", 0, 4000, true)
	}
	return result
}
func writingNote(row Row) Row {
	return Row{"id": row["id"], "postId": row["post_id"], "note": decodeJSONColumn(row["note"]), "createdAt": row["created_at"]}
}

// @Summary List private thinking notes
// @ID listThinkingNotes
// @Description Read this post’s private notes, newest first. Includes author notes and insights saved from the writing assistant.
// @Tags Research
// @Produce json
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Success 200 {array} APISavedThinkingNote
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/posts/{id}/writing-notes [get]
func (a *App) writingNotes(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	rows := a.DB.Must(r.Context(), "SELECT * FROM writing_notes WHERE post_id=$1 ORDER BY created_at DESC,id DESC", post["id"])
	result := []Row{}
	for _, row := range rows {
		result = append(result, writingNote(row))
	}
	send(w, 200, result)
}

// @Summary Save a private thinking note
// @ID saveThinkingNote
// @Description Append a note with the author’s reasoning, research or questions to the specified post. Only body is required. The article body is unchanged.
// @Tags Research
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Param input body APIThinkingNote true "Thinking note"
// @Success 201 {object} APISavedThinkingNote
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/posts/{id}/writing-notes [post]
func (a *App) saveWritingNote(w http.ResponseWriter, r *http.Request) {
	post := a.getPost(r.Context(), r.PathValue("id"))
	note := validWritingNote(body(w, r))
	rows := a.DB.Must(r.Context(), "INSERT INTO writing_notes(id,post_id,note) VALUES($1,$2,$3) RETURNING *", uuid(), post["id"], encode(note))
	send(w, 201, writingNote(rows[0]))
}
