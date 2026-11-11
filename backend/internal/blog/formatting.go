package blog

import (
	"margin/backend/internal/formatting"
	"net/http"
	"strings"
	"time"
)

func (a *App) formatContent(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "ai-formatting", 15, 15*time.Minute, true)
	input := body(w, r)
	strict(input, "content")
	content := stringField(input, "content", 1, 40000, false)
	if strings.TrimSpace(content) == "" {
		fail(400, "Add some text before formatting.")
	}
	candidates := formatting.Candidates(content)
	if len(candidates) == 0 {
		send(w, 200, Row{"content": content, "changes": 0})
		return
	}
	// Keep the structured input within Central's 60,000-character limit.
	if len(candidates) > 500 {
		fail(400, "Format up to 500 plain-text lines at a time.")
	}
	payload := Row{"candidates": candidates}
	if textLength(encode(payload)) > 60000 {
		fail(400, "This text is too large to format. Try a shorter draft.")
	}
	result := a.serviceRequest(r.Context(), "/v1/generations/writing", Row{
		"instructions": formatting.Instructions, "input": payload,
		"schemaName": "content_formatting", "schema": formatting.Schema(),
	}, requestID(r))["plan"]
	formatted, count, err := formatting.Apply(content, result)
	if err != nil {
		coded(502, "The assistant returned invalid formatting. Your text has not changed. Please try again.", "AI_INVALID_RESPONSE")
	}
	// Proposals never save a post or change its publication status.
	send(w, 200, Row{"content": formatted, "changes": count})
}
