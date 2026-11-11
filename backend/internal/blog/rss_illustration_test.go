package blog

import (
	"strings"
	"testing"
)

func TestIllustrationReadingFallback(t *testing.T) {
	payload := `{"title":"Heart","description":"A cutaway","regions":[{"label":"Atrium","description":"Receives blood. <script>alert(1)</script>"}]}`
	for _, source := range []string{"[Illustration]\n" + payload + "\n[/Illustration]", "```illustration\n" + payload + "\n```"} {
		rendered := rssMarkdown(source, "https://example.com/post/heart")
		if !strings.Contains(rendered, "<dt>1. Atrium</dt>") || !strings.Contains(rendered, "Receives blood.") {
			t.Fatalf("missing readable structure description: %s", rendered)
		}
		if strings.Contains(rendered, "<script>") {
			t.Fatal("author HTML was rendered")
		}
	}
	if got := rssMarkdown("```json\n{\"unchanged\":true}\n```", "https://example.com"); !strings.Contains(got, "language-json") {
		t.Fatal("ordinary code fence changed")
	}
}

func TestIllustrationFlowReadingFallback(t *testing.T) {
	payload := `{"title":"Heart","flow":{"title":"Journey","description":"Illustrative only","steps":[{"label":"Lungs","description":"Gains oxygen. <script>alert(1)</script>"},{"label":"Body","description":"Delivers oxygen."}]}}`
	for _, source := range []string{"[Illustration]\n" + payload + "\n[/Illustration]", "```illustration\n" + payload + "\n```"} {
		rendered := rssMarkdown(source, "https://example.com/post/heart")
		for _, want := range []string{"<h4>Journey</h4>", "Illustrative only", "<strong>Lungs</strong>", "<strong>Body</strong>", "Delivers oxygen."} {
			if !strings.Contains(rendered, want) {
				t.Fatalf("missing %s in %s", want, rendered)
			}
		}
		if strings.Contains(rendered, "<script>") {
			t.Fatal("flow text executed author markup")
		}
	}
}

func TestIllustrationExportedArtwork(t *testing.T) {
	source := "[Illustration]\n" + `{"title":"Plan","artwork":{"src":"https://images.example.test/plan.svg","alt":"Floor plan"},"regions":[{"label":"Entry","description":"Main entrance"}]}` + "\n[/Illustration]"
	rendered := rssMarkdown(source, "https://example.com/post/plan")
	containsHTML(t, rendered, "https://images.example.test/plan.svg", "Floor plan", "Main entrance")
}
