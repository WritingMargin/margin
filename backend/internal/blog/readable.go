package blog

import (
	"bytes"
	"context"
	"html/template"
	"mime"
	"net/http"
	"net/url"
	"strings"
)

func (a *App) readableRoutes() {
	a.mux.HandleFunc("GET /llms.txt", a.readableIndex)
	a.mux.HandleFunc("GET /llms-full.txt", a.readableCollection)
	a.mux.HandleFunc("GET /posts/{filename}", a.readableMarkdown)
	a.mux.HandleFunc("GET /read/{slug}", a.readableHTML)
	a.mux.HandleFunc("GET /post/{slug}/print", a.printArticle)
}
func readableHeaders(w http.ResponseWriter, mime string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", mime+"; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}
func (a *App) readableOrigin(r *http.Request) string {
	origin := a.publicationOrigin(r)
	parsed, err := url.Parse(origin)
	if err != nil || !rssPublicURL(parsed) {
		fail(503, "The publication URL is not configured correctly.")
	}
	return strings.TrimSuffix(origin, "/")
}
func readableLine(value string) string { return strings.Join(strings.Fields(value), " ") }
func readableLabel(value string) string {
	return strings.NewReplacer(`\`, `\\`, "[", `\[`, "]", `\]`).Replace(readableLine(value))
}
func readableHeader(theme Row, origin string) string {
	return "# " + readableLine(theme.str("name")) + "\n\n> " + readableLine(theme.str("description")) + "\n\nPublication: " + origin + "/\n"
}
func readableLinks(row Row, origin string) Row {
	slug := url.PathEscape(row.str("slug"))
	return Row{"canonical": origin + "/post/" + slug, "html": origin + "/read/" + slug, "markdown": origin + "/posts/" + slug + ".md"}
}
func (a *App) publishedRows(ctx context.Context) []Row {
	return a.DB.Must(ctx, "SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC,id ASC")
}
func (a *App) readableIndex(w http.ResponseWriter, r *http.Request) {
	a.indexingHeader(w, r)
	readableHeaders(w, "text/plain")
	origin := a.readableOrigin(r)
	theme := a.settings(r.Context())
	rows := a.publishedRows(r.Context())
	a.collectionIndexingHeader(w, r, rows)
	var out strings.Builder
	out.WriteString(readableHeader(theme, origin) + "\n## Published articles\n\n")
	for _, row := range rows {
		links := readableLinks(row, origin)
		out.WriteString("- [" + readableLabel(row.str("title")) + "](" + links.str("html") + ") — [Markdown](" + links.str("markdown") + "): " + readableLine(row.str("excerpt")) + "\n")
	}
	out.WriteString("\n## Complete text\n\n- [All published articles](" + origin + "/llms-full.txt)\n- [RSS feed](" + origin + "/rss.xml)\n")
	out.WriteString("\n## Authoring in Margin\n\n- [LLM authoring guide](" + origin + "/authoring.md)\n- [Block schemas and examples](" + origin + "/authoring-blocks.json)\n- [Authoring guide API](" + origin + "/api/public/authoring)\n- [OpenAPI](" + origin + "/openapi.json)\n")
	a.recheckReadable(r.Context(), rows)
	_, _ = w.Write([]byte(out.String()))
}
func (a *App) readablePost(ctx context.Context, slug string) Row {
	row := first(a.DB.Must(ctx, "SELECT * FROM posts WHERE slug=$1 AND status='published'", slug))
	if row == nil {
		fail(404, "Post not found.")
	}
	return row
}
func (a *App) readableContent(ctx context.Context, row Row) string {
	data, err := a.Storage.Get(ctx, row.str("content_key"))
	if err != nil {
		fail(503, "The article is temporarily unavailable because its content could not be loaded.")
	}
	return string(data)
}

// Recheck every source after all storage reads and rendering, before writing any body.
func (a *App) recheckReadable(ctx context.Context, rows []Row) {
	for _, row := range rows {
		current := a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1 AND status='published' AND revision=$2", row["id"], row["revision"])
		if len(current) == 0 {
			fail(404, "Post not found.")
		}
	}
}
func readableArticle(row Row, content, origin string, author Row) string {
	links := readableLinks(row, origin)
	var out strings.Builder
	out.WriteString("# " + readableLine(row.str("title")) + "\n\nCanonical: " + links.str("canonical") + "\nReadable HTML: " + links.str("html") + "\nMarkdown: " + links.str("markdown") + "\nPublished: " + row.str("created_at") + "\nUpdated: " + row.str("updated_at") + "\n")
	if name := readableLine(author.str("name")); name != "" {
		out.WriteString("Author: " + name + "\n")
		if website := author.str("website"); website != "" {
			out.WriteString("Author URL: " + website + "\n")
		}
	}
	tags := rssTags(row["tags"])
	if len(tags) > 0 {
		out.WriteString("Tags: " + readableLine(strings.Join(tags, ", ")) + "\n")
	}
	if excerpt := row.str("excerpt"); excerpt != "" {
		out.WriteString("\n> " + readableLine(excerpt) + "\n")
	}
	out.WriteString("\n" + content + "\n")
	return out.String()
}
func (a *App) readableCollection(w http.ResponseWriter, r *http.Request) {
	a.indexingHeader(w, r)
	readableHeaders(w, "text/plain")
	origin := a.readableOrigin(r)
	theme := a.settings(r.Context())
	rows := a.publishedRows(r.Context())
	author := a.publicAuthorProfile(r.Context())
	a.collectionIndexingHeader(w, r, rows)
	var out strings.Builder
	out.WriteString(readableHeader(theme, origin))
	for _, row := range rows {
		out.WriteString("\n---\n\n" + readableArticle(row, a.readableContent(r.Context(), row), origin, author))
	}
	a.recheckReadable(r.Context(), rows)
	_, _ = w.Write([]byte(out.String()))
}
func (a *App) readableMarkdown(w http.ResponseWriter, r *http.Request) {
	a.indexingHeader(w, r)
	readableHeaders(w, "text/markdown")
	filename := r.PathValue("filename")
	if !strings.HasSuffix(filename, ".md") {
		fail(404, "Post not found.")
	}
	row := a.readablePost(r.Context(), strings.TrimSuffix(filename, ".md"))
	a.postIndexingHeader(w, r, row)
	content := a.readableContent(r.Context(), row)
	origin := a.readableOrigin(r)
	theme := a.settings(r.Context())
	result := readableHeader(theme, origin) + "\n---\n\n" + readableArticle(row, content, origin, a.publicAuthorProfile(r.Context()))
	a.recheckReadable(r.Context(), []Row{row})
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": row.str("slug") + ".md"}))
	}
	_, _ = w.Write([]byte(result))
}

var readableTemplate = template.Must(template.New("article").Funcs(template.FuncMap{"blogIcon": blogIconURL, "mediaPath": mediaPath}).Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="{{blogIcon .Theme}}"><title>{{.SearchTitle}}</title>{{if .Robots}}<meta name="robots" content="{{.Robots}}">{{end}}<meta name="description" content="{{.SearchDescription}}"><link rel="canonical" href="{{.Canonical}}"><link rel="alternate" type="text/markdown" href="{{.Markdown}}"><link rel="alternate" type="application/rss+xml" href="{{.Origin}}/rss.xml"><style>body{font:18px/1.65 system-ui,sans-serif;max-width:76ch;margin:3rem auto;padding:0 1.2rem;color:#202020;background:#fff}a{color:#174fa3}.section-permalink::after{content:"#"} .section-permalink{margin-inline-start:.35em;font-size:.75em}header,footer,.metadata{color:#555}article header{color:inherit}h1,h2,h3{line-height:1.25}img,video{max-width:100%;height:auto}pre{overflow:auto;padding:1rem;background:#f3f3f3}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:1rem}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #bbb;padding:.5rem}footer{margin-top:3rem}.post-byline{display:flex;align-items:center;gap:10px;margin:16px 0;font-size:14px}.post-byline img{width:32px;height:32px;object-fit:cover;border-radius:50%}</style></head><body><header><a href="{{.Origin}}/">{{.Name}}</a><p>{{.Description}}</p></header><main><article><header><h1>{{.Title}}</h1>{{template "post-byline" .AuthorProfile}}<p>{{.Excerpt}}</p><p class="metadata">Published <time datetime="{{.Created}}">{{.Created}}</time> · Updated <time datetime="{{.Updated}}">{{.Updated}}</time></p>{{if .Tags}}<p class="metadata">Tags: {{.Tags}}</p>{{end}}</header>{{.Content}}</article></main><footer><a href="{{.Canonical}}">View original article</a> · <a href="{{.Markdown}}">Markdown</a> · <a href="{{.Origin}}/llms.txt">Article index</a></footer></body></html>` + postBylineTemplate))

func renderReadable(theme, row Row, content, origin string) string {
	links := readableLinks(row, origin)
	view := map[string]any{"AuthorProfile": theme["authorProfile"], "Robots": postRobots(object(theme["seo"]), row), "Theme": theme, "SearchTitle": postSearchTitle(row, theme), "SearchDescription": postSearchDescription(row, content), "Title": row["title"], "Excerpt": row["excerpt"], "Name": theme["name"], "Description": theme["description"], "Origin": origin, "Canonical": links["canonical"], "Markdown": links["markdown"], "Created": row["created_at"], "Updated": row["updated_at"], "Tags": strings.Join(rssTags(row["tags"]), ", "), "Content": template.HTML(sectionedArticle(content, links.str("canonical"), false, "off", nil, ""))} // #nosec G203 -- rssMarkdown disables author HTML, validates URLs and escapes content before this trusted HTML conversion.
	var out bytes.Buffer
	must(readableTemplate.Execute(&out, view))
	return out.String()
}
func (a *App) readableHTML(w http.ResponseWriter, r *http.Request) {
	a.indexingHeader(w, r)
	readableHeaders(w, "text/html")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src http: https:; media-src http: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
	row := a.readablePost(r.Context(), r.PathValue("slug"))
	a.postIndexingHeader(w, r, row)
	content := a.readableContent(r.Context(), row)
	theme := a.settings(r.Context())
	theme["authorProfile"] = a.publicAuthorProfile(r.Context())
	theme["seo"] = a.seoSettings(r.Context())
	result := renderReadable(theme, row, content, a.readableOrigin(r))
	a.recheckReadable(r.Context(), []Row{row})
	_, _ = w.Write([]byte(result))
}
