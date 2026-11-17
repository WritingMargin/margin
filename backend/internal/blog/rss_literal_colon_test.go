package blog

import (
	"strings"
	"testing"
)

// Prose with colons must reach readers as written, in RSS and on public pages.
func TestColonsInProseStayText(t *testing.T) {
	prose := "See you at re:Invent and Note:this, or mailto:me@example.com at 10:30."
	for name, html := range map[string]string{
		"rss":    rssMarkdown(prose, "https://example.com/"),
		"public": sectionedArticle(prose, "https://example.com/", true, "", Row{}, ""),
	} {
		for _, want := range []string{"re:Invent", "Note:this", "10:30", "mailto:me"} {
			if !strings.Contains(html, want) {
				t.Fatalf("%s lost %q: %s", name, want, html)
			}
		}
		if strings.Contains(html, "<div") {
			t.Fatalf("%s turned prose into a block: %s", name, html)
		}
	}
}

func TestInlineDirectivesStillRender(t *testing.T) {
	html := rssMarkdown("Some :mark[highlighted] words.", "https://example.com/")
	if !strings.Contains(html, "<mark>highlighted</mark>") {
		t.Fatalf("mark directive not rendered: %s", html)
	}
}
