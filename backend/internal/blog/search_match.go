package blog

import (
	"strings"
	"unicode"
)

func searchWords(value string) []string {
	return strings.FieldsFunc(strings.ToLower(value), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsMark(r) })
}

// Short terms require exact or prefix matches; longer words tolerate edits.
func searchTermScore(query, word string) float64 {
	if query == word {
		return 1
	}
	if strings.HasPrefix(word, query) {
		return 0.8
	}
	q, w := []rune(query), []rune(word)
	if len(q) < 4 || len(w) > 64 {
		return 0
	}
	limit := 1
	if len(q) >= 8 {
		limit = 2
	}
	if len(q)-len(w) > limit || len(w)-len(q) > limit {
		return 0
	}
	distance := searchDistance(q, w)
	if distance > limit {
		return 0
	}
	return 0.5 / float64(distance)
}

// Optimal string alignment also treats an adjacent transposition as one typo.
func searchDistance(a, b []rune) int {
	matrix := make([][]int, len(a)+1)
	for i := range matrix {
		matrix[i] = make([]int, len(b)+1)
		matrix[i][0] = i
	}
	for j := range matrix[0] {
		matrix[0][j] = j
	}
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			searchDistanceCell(matrix, a, b, i, j)
		}
	}
	return matrix[len(a)][len(b)]
}
func searchDistanceCell(d [][]int, a, b []rune, i, j int) {
	cost := 1
	if a[i-1] == b[j-1] {
		cost = 0
	}
	d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
	if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
		d[i][j] = min(d[i][j], d[i-2][j-2]+1)
	}
}

type searchDocument struct {
	title, excerpt, text string
	terms                map[string]float64
}

func (d searchDocument) snippetAt(position int) string {
	words := strings.Fields(d.text)
	return searchSnippetWords(words, max(0, position-8))
}
func searchSnippetWords(words []string, start int) string {
	start = min(start, len(words))
	end := min(start+36, len(words))
	result := strings.Join(words[start:end], " ")
	if start > 0 {
		result = "…" + result
	}
	if end < len(words) {
		result += "…"
	}
	runes := []rune(result)
	if len(runes) > 260 {
		result = string(runes[:260]) + "…"
	}
	return result
}
