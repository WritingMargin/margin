package blog

import (
	"regexp"
	"strings"
)

var searchHighlightWords = regexp.MustCompile(`[\p{L}\p{N}\p{M}]+`)

// Return only matching words already present in displayed fields, preserving
// their spelling and case. The client renders them as text, never HTML.
func searchHighlights(result Row, query []string) []string {
	fields := []string{result.str("title"), result.str("slug"), result.str("excerpt"), result.str("searchSnippet"), strings.Join(rssTags(result["tags"]), " ")}
	matches := []string{}
	seen := map[string]bool{}
	for _, field := range fields {
		for _, word := range searchHighlightWords.FindAllString(field, -1) {
			if !seen[word] && searchHighlightMatch(word, query) {
				matches = append(matches, word)
				seen[word] = true
			}
		}
	}
	return matches
}
func searchHighlightMatch(word string, query []string) bool {
	for _, term := range query {
		if searchTermScore(term, strings.ToLower(word)) > 0 {
			return true
		}
	}
	return false
}
