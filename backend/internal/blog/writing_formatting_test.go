package blog

import (
	"encoding/json"
	"margin/backend/internal/formatting"
	"net/http"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestWritingConversationSuggestsFormattingWithoutSavingDraft(t *testing.T) {
	a, _ := coreFixture(t)
	source := "A section label\n\nThe author's exact words."
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		context := object(payload["input"])
		if context["formattingCandidates"] == nil || context.str("brief") != "Format this draft" {
			t.Fatal(context)
		}
		return fixtureResponse(Row{"plan": Row{"reply": "Here are suggested formatting changes.", "sections": []Row{}, "questions": []string{}, "formatting": Row{"changes": []Row{{"line": 1, "style": "heading2"}}}}}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", Row{"conversationMode": true, "mode": "ideas", "brief": "Format this draft", "content": source}, true), 200)
	if object(got["formatting"]).str("content") != "## A section label\n\nThe author's exact words." || object(got["formatting"])["changes"] == nil {
		t.Fatal(got)
	}
}
func TestWritingConversationRejectsFormattingOfProtectedCode(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"plan": Row{"reply": "Suggested changes.", "sections": []Row{}, "questions": []string{}, "formatting": Row{"changes": []Row{{"line": 2, "style": "bold"}}}}}), nil
	})
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", Row{"conversationMode": true, "mode": "ideas", "brief": "Format this draft", "content": "```js\nprotected()\n```"}, true), 502)
}
func TestWritingFormattingCandidatesRespectEscapedPayloadBudget(t *testing.T) {
	input := Row{"content": strings.Repeat("x", 58000)}
	attachWritingFormatting(input, strings.Repeat("A short plain line.\n", 500))
	if len(utf16.Encode([]rune(encode(input)))) > writingPayloadLimit {
		t.Fatal("formatting candidates exceeded gateway budget")
	}
	candidates, ok := input["formattingCandidates"].([]formatting.Candidate)
	if !ok || len(candidates) == 0 || len(candidates) >= 500 {
		t.Fatal(candidates)
	}
}
