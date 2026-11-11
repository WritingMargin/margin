package formatting

import (
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"
)

// Only plain, top-level paragraph lines can be decorated. Existing Markdown,
// code, links, tables, media and Margin containers remain byte-for-byte intact.
func Candidates(source string) []Candidate {
	data := []byte(source)
	document := goldmark.New(goldmark.WithExtensions(extension.GFM)).Parser().Parse(text.NewReader(data))
	protected := protectedLines(source)
	candidates := []Candidate{}
	for node := document.FirstChild(); node != nil; node = node.NextSibling() {
		if node.Kind() != ast.KindParagraph || !plainParagraph(node) {
			continue
		}
		for i := 0; i < node.Lines().Len(); i++ {
			segment := node.Lines().At(i)
			lineNumber := strings.Count(source[:segment.Start], "\n") + 1
			line := strings.TrimSuffix(strings.TrimSuffix(string(segment.Value(data)), "\n"), "\r")
			if !protected[lineNumber] && plainLine(line) && startsLine(source, segment.Start) {
				candidates = append(candidates, Candidate{Line: lineNumber, Text: line})
			}
		}
	}
	return candidates
}

func plainParagraph(node ast.Node) bool {
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		if child.Kind() != ast.KindText {
			return false
		}
	}
	return true
}

func startsLine(source string, offset int) bool { return offset == 0 || source[offset-1] == '\n' }

func plainLine(line string) bool {
	return line != "" && strings.TrimSpace(line) == line && !strings.ContainsAny(line, "#*_`~[]<>\\{}|\t") && !strings.Contains(line, "::")
}
