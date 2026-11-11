package blog

import (
	"encoding/json"
	"html"
	"net/url"
	"strings"
)

type rssPoster struct {
	Src string `json:"src"`
	Alt string `json:"alt"`
}

func rssPosterHTML(poster *rssPoster) string {
	if poster == nil || poster.Alt == "" || len(poster.Src) > 2000 {
		return ""
	}
	if !rssSafePosterURL(poster.Src) {
		return ""
	}
	return `<figure class="block-poster"><img src="` + html.EscapeString(poster.Src) + `" alt="` + html.EscapeString(poster.Alt) + `"/><figcaption>` + html.EscapeString(poster.Alt) + `</figcaption></figure>`
}

func rssScene(source string) string {
	var spec struct {
		Title       string     `json:"title"`
		Description string     `json:"description"`
		Poster      *rssPoster `json:"poster"`
		Objects     []struct {
			Label       string `json:"label"`
			Description string `json:"description"`
		} `json:"objects"`
	}
	if len(source) > 50000 || json.Unmarshal([]byte(source), &spec) != nil || spec.Title == "" {
		return `<pre><code class="language-scene">` + html.EscapeString(source) + "</code></pre>"
	}
	var out strings.Builder
	out.WriteString("<section><h3>" + html.EscapeString(spec.Title) + "</h3><p>" + html.EscapeString(spec.Description) + "</p>")
	out.WriteString(rssPosterHTML(spec.Poster))
	out.WriteString("<ul>")
	for _, object := range spec.Objects {
		out.WriteString("<li><strong>" + html.EscapeString(object.Label) + "</strong>")
		if object.Description != "" {
			out.WriteString("<p>" + html.EscapeString(object.Description) + "</p>")
		}
		out.WriteString("</li>")
	}
	out.WriteString("</ul><p>Rotation and animation are available in the online article.</p></section>")
	return out.String()
}

func rssSafePosterURL(source string) bool {
	parsed, err := url.Parse(source)
	if err != nil || parsed.User != nil || strings.ContainsAny(source, "\\\r\n\t ") {
		return false
	}
	if strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "//") {
		return true
	}
	return parsed.Scheme == "https" && parsed.Host != ""
}
