package blog

import (
	"bytes"
	_ "embed"
	"html/template"
	"net/http"
	"regexp"
	"strings"
)

//go:embed print.html
var printTemplateSource string
var printTemplate = template.Must(template.New("print").Funcs(template.FuncMap{"date": publicDate, "mediaPath": mediaPath}).Parse(printTemplateSource + postBylineTemplate))

type printPage struct {
	Title, Blog, Excerpt, Created, Tags, Cover, Canonical, Markdown, Nonce, Robots string
	Byline                                                                         Row
	Content                                                                        template.HTML
	AutoPrint                                                                      bool
}

func (a *App) printArticle(w http.ResponseWriter, r *http.Request) {
	row := a.readablePost(r.Context(), r.PathValue("slug"))
	content := a.readableContent(r.Context(), row)
	links := readableLinks(row, a.readableOrigin(r))
	page := printPage{
		Byline: a.publicAuthorProfile(r.Context()),
		Title:  row.str("title"), Blog: a.settings(r.Context()).str("name"),
		Excerpt: row.str("excerpt"), Created: row.str("created_at"), Tags: strings.Join(rssTags(row["tags"]), ", "),
		Cover: coverImage(row.str("cover")), Canonical: links.str("canonical"), Markdown: links.str("markdown"), Nonce: token(),
		Content:   printContent(audioCoverContent(row.str("cover"), content), links.str("canonical")),
		Robots:    robotsDirective(true, !a.seoSettings(r.Context()).yes("indexing") || object(row["seo"]).yes("nofollow")),
		AutoPrint: r.URL.Query().Get("download") == "pdf",
	}
	var output bytes.Buffer
	must(printTemplate.Execute(&output, page))
	a.recheckReadable(r.Context(), []Row{row})
	readableHeaders(w, "text/html")
	w.Header().Set("X-Robots-Tag", page.Robots)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+page.Nonce+"'; style-src 'unsafe-inline'; img-src http: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
	if r.Method != http.MethodHead {
		_, _ = w.Write(output.Bytes())
	}
}

var printVideo = regexp.MustCompile(`<video src="([^"]*)" controls=""></video>`)

func printContent(content, canonical string) template.HTML {
	markup := rssMarkdown(content, canonical)
	// PDF cannot play embedded media; keep its already-sanitized destination.
	markup = printVideo.ReplaceAllString(markup, `<p><a href="$1">Watch video online</a></p>`)
	markup = strings.ReplaceAll(markup, `<video controls=""></video>`, `<p>Video available in the original article.</p>`)
	return template.HTML(markup) // #nosec G203 -- Markup comes from the safe Markdown renderer; substitutions only replace media with already-sanitized links.
}
