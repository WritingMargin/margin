package formatting

import (
	"reflect"
	"strings"
	"testing"
)

func TestFormattingUsesOnlyOriginalText(t *testing.T) {
	source := "A café in 東京 ☕\r\n\r\nFirst choice\r\nSecond choice\r\n\r\nKeep this sentence exactly."
	plan := Plan{Changes: []Choice{{1, "heading2"}, {3, "bullet"}, {4, "bullet"}, {6, "bold"}}}
	got, count, err := Apply(source, plan)
	want := "## A café in 東京 ☕\r\n\r\n- First choice\r\n- Second choice\r\n\r\n**Keep this sentence exactly.**"
	if err != nil || count != 4 || got != want {
		t.Fatalf("%q, %d, %v", got, count, err)
	}
}

func TestFormattingRejectsNewTextAndInvalidOperations(t *testing.T) {
	source := "Section\n\nOriginal sentence.\n\n```\nprotected\n```"
	cases := []any{
		map[string]any{"content": "Invented article"}, nil,
		map[string]any{"changes": nil},
		map[string]any{"changes": []any{map[string]any{"line": 1, "style": "heading2", "text": "Invented title"}}},
		Plan{Changes: []Choice{{1, "rewrite"}}},
		Plan{Changes: []Choice{{0, "bold"}}},
		Plan{Changes: []Choice{{999, "bold"}}},
		Plan{Changes: []Choice{{2, "heading2"}}},
		Plan{Changes: []Choice{{6, "bold"}}},
		Plan{Changes: []Choice{{1, "heading2"}, {1, "italic"}}},
		map[string]any{"changes": []any{map[string]any{"line": 1.5, "style": "bold"}}},
	}
	for _, plan := range cases {
		if output, _, err := Apply(source, plan); err == nil || output != "" {
			t.Fatalf("Accepted %#v: %q", plan, output)
		}
	}
}

func TestFormattingPreservesRichContent(t *testing.T) {
	protected := []string{
		"## Existing heading", "- A list\n- Another item", "> Quoted text",
		"[Link](https://example.com)", "![Alt](https://example.com/image.png)",
		"`inline\ncode`", "**existing\nemphasis**", "    indented code",
		"```mermaid\n\nA --> B\n\n```", "~~~\ncode\n~~~",
		"| A | B |\n| --- | --- |\n| data | text |",
		"<div>\n\nHTML content\n\n</div>",
		":::callout\n\nProtected inside\n\n:::tabs\n\nInner text\n\n:::\n:::",
		"[Tabs]\n\n[Tab title=\"One\"]\n\nTab content\n\n[/Tab]\n\n[/Tabs]",
		"[Diagram]\n\ngraph TD\n\nA --> B\n\n[/Diagram]",
		"[Font=\"Lora\"]\n\nStyled words\n\n[/Font]",
		"[Highlight]\n\nHighlighted words\n\n[/Highlight]",
	}
	for _, block := range protected {
		source := "Eligible heading\n\n" + block + "\n\nEligible ending"
		candidates := Candidates(source)
		if len(candidates) != 2 {
			t.Errorf("Protected block offered: %q => %#v", block, candidates)
			continue
		}
		result, _, err := Apply(source, Plan{Changes: []Choice{{1, "heading2"}}})
		if err != nil || !strings.Contains(result, block) {
			t.Fatalf("Changed protected block: %q", result)
		}
	}
}

func TestFormattingNoChangesAndUnclosedContainers(t *testing.T) {
	source := "Keep every byte.\r\n\r\n[Callout]\n\nUnclosed container\n"
	if got := Candidates(source); !reflect.DeepEqual(got, []Candidate{{1, "Keep every byte."}}) {
		t.Fatal(got)
	}
	got, count, err := Apply(source, Plan{Changes: []Choice{}})
	if err != nil || count != 0 || got != source {
		t.Fatal(got, count, err)
	}
}

func TestFormattingSupportsEveryStyle(t *testing.T) {
	for style, markers := range styles {
		got, _, err := Apply("Only my words", Plan{Changes: []Choice{{1, style}}})
		if err != nil || got != markers[0]+"Only my words"+markers[1] {
			t.Fatalf("%s: %q %v", style, got, err)
		}
	}
}

func TestFormattingAddsOnlyNeededBlockSpacing(t *testing.T) {
	source := "Section\nA sentence.\nFirst item\nSecond item\nEnding."
	got, _, err := Apply(source, Plan{Changes: []Choice{{1, "heading2"}, {3, "bullet"}, {4, "bullet"}}})
	want := "## Section\n\nA sentence.\n\n- First item\n- Second item\n\nEnding."
	if err != nil || got != want {
		t.Fatalf("%q %v", got, err)
	}
}

func TestFormattingProtectsContainersFromMismatchedClosers(t *testing.T) {
	for _, source := range []string{
		"[Callout]\n\n::: \n\nProtected text",
		":::callout\n\n```\n:::\n```\n\nProtected text\n\n:::",
		"[Tabs]\n\n[/Callout]\n\nProtected text",
	} {
		if got := Candidates(source); len(got) != 0 {
			t.Fatalf("Exposed protected content: %#v", got)
		}
	}
}
