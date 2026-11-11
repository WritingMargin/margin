package blog

import (
	"strings"
	"testing"
)

func TestPassageTextIncludesLinksAndDynamicLabels(t *testing.T) {
	content := "Read [the research method](https://example.org/method).\n\n```chart\n{\"title\":\"Study results\",\"description\":\"A clear trend\"}\n```"
	text := passageText(content)
	for _, want := range []string{"the research method", "Study results", "A clear trend"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing selectable article text %q in %q", want, text)
		}
	}
}
