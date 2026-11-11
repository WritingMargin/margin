package blog

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"unicode/utf16"

	"margin/backend/internal/writing"
)

func TestWritingConversationUsesCurrentMessageAndPriorHistory(t *testing.T) {
	a, _ := coreFixture(t)
	history := []Row{{"message": "Who is the audience?", "response": "Consider readers who grow herbs.", "research": false}}
	input := Row{"conversationMode": true, "brief": "How should I narrow that audience?", "mode": "questions", "history": history}
	reply := "Which of those readers has space for a garden?"
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		context := object(payload["input"])
		if encode(context["history"]) != encode(history) || context.str("brief") != input.str("brief") || context.str("content") != "" {
			t.Fatal(context)
		}
		if payload.str("instructions") != writing.ConversationInstructions || object(object(payload["schema"])["properties"])["reply"] == nil {
			t.Fatal(payload)
		}
		return fixtureResponse(Row{"plan": Row{"reply": reply, "sections": []Row{}, "questions": []string{}}}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	if got.str("reply") != reply || encode(got["plan"]) != `{"questions":[],"sections":[]}` {
		t.Fatal(got)
	}
}

func TestWritingConversationKeepsOnlyExactDraftQuotes(t *testing.T) {
	a, _ := coreFixture(t)
	content := "Readers compare the results in the draft."
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"plan": Row{
			"reply": "Clarify the comparison.",
			"sections": []Row{
				{"heading": "Draft", "quote": "Readers compare the results", "notes": []string{"Name the results."}},
				{"heading": "Source", "quote": "Unseen source claim", "notes": []string{"Check the source."}},
			},
			"questions": []string{},
		}}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", Row{
		"conversationMode": true, "mode": "ideas", "brief": "Review this draft", "content": content,
	}, true), 200)
	sections := got["plan"].(map[string]any)["sections"].([]any)
	if object(sections[0]).str("quote") != "Readers compare the results" || object(sections[1]).str("quote") != "" {
		t.Fatal("assistant quote was not checked against the writer pad")
	}
}
func TestWritingConversationValidatesHistoryAndRetainsPlanCompatibility(t *testing.T) {
	a, _ := coreFixture(t)
	input := Row{"brief": "How should I start?", "mode": "ideas", "history": []Row{{"message": "Earlier question.", "response": "Earlier answer."}}}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 400)
	input["conversationMode"] = true
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"plan": writingTestPlan()}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	if got["reply"] != nil || encode(got["plan"]) != encode(writingTestPlan()) {
		t.Fatal(got)
	}
	input["history"] = []Row{{"message": "Earlier question.", "response": strings.Repeat("x", 12001)}}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 400)
}
func TestWritingConversationHistoryFitsProviderBudget(t *testing.T) {
	input := Row{"content": strings.Repeat("🦊", 29000)}
	history := []writing.Turn{{Message: "First", Response: strings.Repeat("a", 1600)}, {Message: "Second", Response: strings.Repeat("b", 1600)}}
	attachConversationHistory(input, history)
	if encode(input["history"]) != encode(history[1:]) {
		t.Fatal("expected only the most recent complete turn")
	}
}

func TestWritingConversationEscapedContextStillFitsGateway(t *testing.T) {
	a, _ := coreFixture(t)
	source := "Draft opening" + strings.Repeat("🦊", 39950) + "Latest edit"
	passage := "Passage opening" + strings.Repeat("\u2028", 11950) + "Passage ending"
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		context := object(payload["input"])
		if len(utf16.Encode([]rune(encode(context)))) > writingPayloadLimit {
			t.Fatal("context exceeds provider budget")
		}
		for field, edges := range map[string][]string{"content": {"Draft opening", "Latest edit"}, "passage": {"Passage opening", "Passage ending"}} {
			if !strings.HasPrefix(context.str(field), edges[0]) || !strings.HasSuffix(context.str(field), edges[1]) {
				t.Fatal("excerpt lost context edges:", field)
			}
		}
		return fixtureResponse(Row{"plan": Row{"reply": "Consider the closing passage.", "sections": []Row{}, "questions": []string{}}}), nil
	})
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", Row{"conversationMode": true, "mode": "questions", "brief": "How does this end?", "content": source, "passage": passage}, true), 200)
	if !got.yes("contextExcerpted") {
		t.Fatal("excerpt not disclosed")
	}
}
