package blog

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

var summaryPlatformLimits = map[string]int{
	"linkedin": 3000, "x": 280, "instagram": 2200, "facebook": 5000,
	"threads": 500, "devto": 1500, "substack": 1500, "medium": 1500,
}

// Attach the server-owned canonical URL before persisting so generation, history,
// and every copy action use the same complete text within the platform's limit.
func summariesWithPostURL(values []any, postURL string) []Row {
	link := regexp.MustCompile(regexp.QuoteMeta(postURL) + `($|[\s)\]>"'.,!?])`)
	summaries := make([]Row, 0, len(values))
	for _, value := range values {
		summary := object(value)
		text := strings.TrimSpace(summary.str("text"))
		if !link.MatchString(text) {
			text = fitSummaryForLink(text, postURL, summaryPlatformLimits[summary.str("platform")])
			text = strings.TrimSpace(text + "\n\n" + postURL)
		}
		summary["text"] = text
		summaries = append(summaries, summary)
	}
	return summaries
}

func fitSummaryForLink(text, postURL string, limit int) string {
	if text == "" || limit <= 0 {
		return text
	}
	budget := limit - 2 - utf8.RuneCountInString(postURL)
	if budget <= 20 || utf8.RuneCountInString(text) <= budget {
		return text
	}
	return shortenSummaryText(text, budget)
}

func shortenSummaryText(text string, budget int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) <= budget {
		return string(runes)
	}
	if end := lastSentenceBreak(runes[:budget], budget/3); end > 0 {
		return strings.TrimSpace(string(runes[:end]))
	}
	cut := lastWordBreak(runes[:budget-1])
	trimmed := strings.TrimRightFunc(string(runes[:cut]), func(r rune) bool {
		return unicode.IsSpace(r) || strings.ContainsRune(",;:-–—", r)
	})
	if trimmed == "" {
		return string(runes[:budget])
	}
	if !strings.ContainsAny(trimmed[len(trimmed)-1:], ".!?\"”") {
		trimmed += "."
	}
	return trimmed
}

func lastSentenceBreak(runes []rune, min int) int {
	for i := len(runes) - 1; i >= min; i-- {
		if strings.ContainsRune(".!?", runes[i]) && (i+1 == len(runes) || unicode.IsSpace(runes[i+1])) {
			return i + 1
		}
	}
	return 0
}

func lastWordBreak(runes []rune) int {
	for i := len(runes) - 1; i >= len(runes)/2; i-- {
		if unicode.IsSpace(runes[i]) {
			return i
		}
	}
	return len(runes)
}
