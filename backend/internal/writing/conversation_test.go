package writing

import "testing"

func TestConversationQuotesUseWriterPadTextOnly(t *testing.T) {
	plan := Result{Sections: []Section{
		{Heading: "Clarify", Quote: "Readers compare the results", Notes: []string{"Explain the comparison."}},
		{Heading: "Focus", Quote: "selected passage", Notes: []string{"Focus on this wording."}},
		{Heading: "Source", Quote: "Unseen external claim", Notes: []string{"Check the source."}},
	}}
	KeepExactQuotes(&plan, "Readers compare the results in the draft.", "The selected passage is here.")
	if plan.Sections[0].Quote == "" || plan.Sections[1].Quote == "" || plan.Sections[2].Quote != "" {
		t.Fatal("quotes must match the current writer pad or selected passage exactly")
	}
}

func TestGreetingOnlyDoesNotMatchEditorialRequests(t *testing.T) {
	for _, brief := range []string{"Hi", "hello!", "Hey there 👋", "Good morning."} {
		if !GreetingOnly(brief) {
			t.Fatalf("missed standalone greeting %q", brief)
		}
	}
	for _, brief := range []string{"Hi, review this draft", "Hey, what should I change?", "Hello to my readers"} {
		if GreetingOnly(brief) {
			t.Fatalf("treated editorial request as greeting: %q", brief)
		}
	}
}

func TestConversationSchemaRequiresBoundedQuote(t *testing.T) {
	schema := ConversationSchema()
	section := schema["properties"].(map[string]any)["sections"].(map[string]any)["items"].(map[string]any)
	quote := section["properties"].(map[string]any)["quote"].(map[string]any)
	if quote["maxLength"] != 180 || !containsString(section["required"].([]string), "quote") {
		t.Fatal("conversation sections need a bounded quote field")
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
