package blog

import "strings"

// Titles are presentation metadata; storage keys and public URLs stay stable.
// Deriving them from the saved brief also names images generated before this feature.
func generatedImageTitle(prompt string) string {
	words := strings.Fields(prompt)
	if len(words) == 0 {
		return "Generated illustration"
	}
	if len(words) > 12 {
		words = words[:12]
	}
	title := []rune(strings.Join(words, " "))
	if len(title) > 90 {
		title = title[:90]
	}
	return strings.TrimRight(string(title), " .,;:!?")
}
