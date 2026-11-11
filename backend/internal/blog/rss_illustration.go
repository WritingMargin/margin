package blog

import (
	"encoding/json"
	"html"
	"strconv"
	"strings"
)

// RSS and non-JavaScript readers get the full explanation, never author HTML.
type rssFlow struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Steps       []struct {
		Label       string `json:"label"`
		Description string `json:"description"`
	} `json:"steps"`
}

func rssIllustration(source string) string {
	var spec struct {
		Artwork     *rssPoster `json:"artwork"`
		Poster      *rssPoster `json:"poster"`
		Flow        *rssFlow   `json:"flow"`
		Title       string     `json:"title"`
		Description string     `json:"description"`
		Regions     []struct {
			Label       string `json:"label"`
			Description string `json:"description"`
		} `json:"regions"`
	}
	if len(source) > 50000 || json.Unmarshal([]byte(source), &spec) != nil {
		return "<pre><code>" + html.EscapeString(source) + "</code></pre>"
	}
	var result strings.Builder
	result.WriteString("<section><h3>" + html.EscapeString(spec.Title) + "</h3><p>" + html.EscapeString(spec.Description) + "</p>")
	if spec.Poster == nil {
		spec.Poster = spec.Artwork
	}
	result.WriteString(rssPosterHTML(spec.Poster))
	result.WriteString("<dl>")
	for i, region := range spec.Regions {
		result.WriteString("<dt>" + strconv.Itoa(i+1) + ". " + html.EscapeString(region.Label) + "</dt><dd>" + html.EscapeString(region.Description) + "</dd>")
	}
	result.WriteString("</dl>")
	result.WriteString(rssFlowDescription(spec.Flow))
	result.WriteString("</section>")
	return result.String()
}

func (m *rssMarkup) fencedBlock(lines []string) []string {
	opening := rssFence.FindStringSubmatch(lines[0])
	if opening == nil {
		return lines
	}
	render := map[string]func(string) string{"ipynb": readableNotebook, "illustration": rssIllustration, "scene": rssScene}[strings.TrimSpace(opening[2])]
	if render == nil {
		return lines
	}
	end := len(lines)
	if end > 1 && rssFence.MatchString(lines[end-1]) {
		end--
	}
	return []string{m.token(render(strings.Join(lines[1:end], "\n")), true)}
}

func rssFlowDescription(flow *rssFlow) string {
	if flow == nil {
		return ""
	}
	var result strings.Builder
	result.WriteString("<h4>" + html.EscapeString(flow.Title) + "</h4><p>" + html.EscapeString(flow.Description) + "</p><ol>")
	for _, step := range flow.Steps {
		result.WriteString("<li><strong>" + html.EscapeString(step.Label) + "</strong><p>" + html.EscapeString(step.Description) + "</p></li>")
	}
	result.WriteString("</ol>")
	return result.String()
}
