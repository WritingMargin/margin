package writing

import (
	"strings"
	"testing"
)

func sample() Result {
	return Result{Sections: []Section{{Heading: "An angle", Notes: []string{"Recall a moment when a small habit helped."}}}, Questions: []string{"Who would benefit from this story?"}}
}
func TestBriefWorksWithoutDraftAndRejectsInvalidFields(t *testing.T) {
	for _, mode := range []string{"ideas", "structure", "opening", "questions"} {
		input, err := ParseInput(map[string]any{"mode": mode, "brief": "  Creative habits  "})
		if err != nil || input.Brief != "Creative habits" || input.Content != "" {
			t.Fatalf("%+v: %v", input, err)
		}
	}
	for _, value := range []any{
		map[string]any{"mode": "write", "brief": "Test"},
		map[string]any{"mode": "ideas", "brief": " "},
		map[string]any{"mode": "ideas", "brief": "Test", "postId": "123"},
		map[string]any{"mode": "ideas", "brief": "Test", "content": strings.Repeat("x", 40001)},
		map[string]any{"mode": "questions", "brief": "Test", "passage": strings.Repeat("x", 12001)},
		map[string]any{"mode": "ideas", "brief": "Test", "previous": map[string]any{"body": "An article"}},
	} {
		if _, err := ParseInput(value); err == nil {
			t.Fatalf("accepted invalid request: %v", value)
		}
	}
}
func TestPlanningResultRejectsArticleFieldsAndUnboundedProse(t *testing.T) {
	if _, err := ParseResult(sample()); err != nil {
		t.Fatal(err)
	}
	for _, value := range []any{
		map[string]any{"sections": sample().Sections, "questions": sample().Questions, "article": "Finished prose"},
		Result{Sections: []Section{{Heading: "Opening", Notes: []string{strings.Repeat("x", 241)}}}, Questions: sample().Questions},
		Result{Sections: sample().Sections},
		Result{Sections: []Section{{Heading: " ", Notes: []string{"Something"}}}, Questions: sample().Questions},
	} {
		if _, err := ParseResult(value); err == nil {
			t.Fatalf("accepted invalid result: %v", value)
		}
	}
}

func TestFollowUpRequiresPreviousNotesAndBoundedFeedback(t *testing.T) {
	input, err := ParseInput(map[string]any{"mode": "ideas", "brief": "Creative habits", "previous": sample(), "feedback": "  Make the first angle more practical.  "})
	if err != nil || input.Feedback != "Make the first angle more practical." || input.Previous == nil {
		t.Fatalf("follow-up lost context: %+v, %v", input, err)
	}
	for _, value := range []any{
		map[string]any{"mode": "ideas", "brief": "Test", "feedback": "Refine this"},
		map[string]any{"mode": "ideas", "brief": "Test", "previous": sample(), "feedback": strings.Repeat("x", 4001)},
	} {
		if _, err := ParseInput(value); err == nil {
			t.Fatal("accepted invalid follow-up")
		}
	}
}
