package blog

import (
	"strings"
	"testing"
)

func TestChecklistReadableFallback(t *testing.T) {
	for _, source := range []string{
		"[Checklist title=\"Prep & cook\" floating=\"true\"]\n- [ ] Wash tomatoes\n- [x] Measure pasta\n[/Checklist]",
		":::checklist{title=\"Prep & cook\" floating=\"true\"}\n- [ ] Wash tomatoes\n- [x] Measure pasta\n:::",
	} {
		for _, styled := range []bool{false, true} {
			got := renderMarkdown(source, "https://example.com/post/recipe", styled)
			for _, want := range []string{"Prep &amp; cook", "Wash tomatoes", "Measure pasta", "checkbox"} {
				if !strings.Contains(got, want) {
					t.Fatalf("missing %q in %s", want, got)
				}
			}
			for _, unwanted := range []string{"[Checklist", "floating=", "position:fixed"} {
				if strings.Contains(got, unwanted) {
					t.Fatalf("unexpected %q in %s", unwanted, got)
				}
			}
		}
	}
}
