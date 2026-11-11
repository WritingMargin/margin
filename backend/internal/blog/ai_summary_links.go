package blog

import (
	"regexp"
	"strings"
)

// Attach the server-owned canonical URL before persisting so generation, history,
// and every copy action use the same complete text. Keep the author's AI copy
// intact; the composer counts the link and highlights drafts needing shortening.
func summariesWithPostURL(values []any, postURL string) []Row {
	link := regexp.MustCompile(regexp.QuoteMeta(postURL) + `($|[\s)\]>"'.,!?])`)
	summaries := make([]Row, 0, len(values))
	for _, value := range values {
		summary := object(value)
		text := strings.TrimSpace(summary.str("text"))
		if !link.MatchString(text) {
			text = strings.TrimSpace(text + "\n\n" + postURL)
		}
		summary["text"] = text
		summaries = append(summaries, summary)
	}
	return summaries
}
