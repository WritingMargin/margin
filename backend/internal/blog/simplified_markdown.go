package blog

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

// Simplified text never enters Margin's rich-block renderer. It is plain
// Markdown, even if the generator echoes block syntax from the source article.
func simplifiedMarkdown(source, canonical string) string {
	var output bytes.Buffer
	engine := goldmark.New(goldmark.WithExtensions(extension.GFM))
	must(engine.Convert([]byte(source), &output))
	return strings.TrimSpace(rssURLs(output.String(), canonical))
}
