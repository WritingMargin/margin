package blog

import (
	"bytes"
	"html/template"
	"strings"
)

const startupPlaceholder = `<span class="startup-placeholder" data-margin-startup="">Opening…</span>`

var startupTemplate = template.Must(template.New("startup").Funcs(template.FuncMap{
	"themeStyle": publicThemeStyle, "blogIcon": blogIconURL, "sitePath": sitePath,
}).Parse(`<section class="startup-branding" style="{{themeStyle .Theme "homepage"}}">
<header><img src="{{blogIcon .Theme}}" width="32" height="32" alt=""><span>{{.Theme.name}}</span></header>
<div class="startup-message"><span class="startup-indicator" aria-hidden="true"></span>
<h1>Opening {{.Theme.name}}…</h1><p>{{.Navigation}} workspace is loading.</p>
<noscript>Enable JavaScript to open your workspace, or <a href="{{sitePath "/"}}">read {{.Navigation}}</a>.</noscript>
</div></section>`))

func workspaceStartup(document string, theme Row) string {
	if !strings.Contains(document, startupPlaceholder) {
		return document
	}
	var content bytes.Buffer
	must(startupTemplate.Execute(&content, struct {
		Theme      Row
		Navigation string
	}{theme, publicationCopy(theme).Navigation}))
	return strings.Replace(document, startupPlaceholder, content.String(), 1)
}
