package blog

import (
	"bytes"
	"encoding/json"
	"html"
	"strings"
)

func notebookText(raw json.RawMessage) string {
	var part string
	if json.Unmarshal(raw, &part) == nil {
		return part
	}
	var parts []string
	if json.Unmarshal(raw, &parts) == nil {
		return strings.Join(parts, "")
	}
	return ""
}

func readableNotebook(source string) string {
	var book struct {
		NBFormat int `json:"nbformat"`
		Cells    []struct {
			Kind    string `json:"cell_type"`
			Source  json.RawMessage
			Outputs []struct {
				Text json.RawMessage
				Data map[string]json.RawMessage
			}
		}
	}
	if len(source) > 1_500_000 || json.Unmarshal([]byte(source), &book) != nil || book.NBFormat != 4 {
		return "<p>Invalid Jupyter notebook.</p>"
	}
	var out strings.Builder
	out.WriteString("<section><h3>Jupyter notebook</h3>")
	for _, cell := range book.Cells {
		out.WriteString("<details><summary>" + html.EscapeString(cell.Kind) + " cell</summary>" + notebookCellHTML(cell.Kind, notebookText(cell.Source)))
		for _, o := range cell.Outputs {
			value := notebookText(o.Text)
			if value == "" {
				value = notebookText(o.Data["text/plain"])
			}
			if value != "" {
				out.WriteString("<pre>" + html.EscapeString(value) + "</pre>")
			}
		}
		out.WriteString("</details>")
	}
	return out.String() + "</section>"
}

// Render Markdown cells using the same inert Markdown engine as public exports.
// Do not recurse into Margin rich blocks inside notebook cells.
func notebookCellHTML(kind, source string) string {
	if kind != "markdown" {
		return "<pre>" + html.EscapeString(source) + "</pre>"
	}
	var out bytes.Buffer
	must(rssMarkdownEngine().Convert([]byte(source), &out))
	return out.String()
}
