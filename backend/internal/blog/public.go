package blog

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"html/template"
	"io/fs"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

//go:embed public.html
var publicTemplateSource string
var publicTemplate = template.Must(template.New("public").Funcs(template.FuncMap{
	"publicHeroVideo": publicHeroVideo, "publicCover": publicCover, "contentSingular": contentSingular, "homepageSections": publicHomepageSections, "words": publicationCopy, "upper": strings.ToUpper, "blogIcon": blogIconURL, "sitePath": sitePath, "mediaPath": mediaPath,
	"feedText": feedText, "feedSearchFirst": feedSearchFirst, "feedRowStyle": feedRowStyle, "feedSearchStyle": feedSearchStyle,
	"date": publicDate, "tags": rssTags, "join": strings.Join, "containsTopic": containsTopic, "themeStyle": publicThemeStyle,
	"readTime": publicReadTime, "footerStyle": publicFooterStyle, "footerURL": footerLinkURL, "number": func(index int) int { return index + 1 }, "postNumber": func(offset, index int) int { return offset + index + 1 }, "postURL": func(slug string) string { return sitePath("/post/" + url.PathEscape(slug)) },
}).Parse(publicTemplateSource + postBylineTemplate))

type publicPage struct {
	Preview                                              bool
	PWA                                                  Row
	Theme                                                Row
	Post                                                 Row
	Posts                                                []Row
	Home                                                 *homepageResult
	Comments                                             []Row
	Contributors                                         []Row
	AuthorUpdate                                         Row
	Related                                              []Row
	Title, Description, Canonical, Action, Nonce, Script string
	Styles, Preloads                                     []string
	Body                                                 template.HTML
	Data, Structured                                     template.JS
	Status                                               int
	Robots                                               string
	ShareImage, Verification                             string
}

func (a *App) publicRoutes() {
	a.mux.HandleFunc("GET /api/public/homepage", a.publicHomepage)
	a.mux.HandleFunc("GET /{$}", a.publicPageHandler(a.homeHTML))
	a.mux.HandleFunc("GET /privacy", a.publicPageHandler(a.privacyHTML))
	a.mux.HandleFunc("GET /post/{slug}", a.publicPageHandler(a.articleHTML))
	a.mux.HandleFunc("GET /post/{slug}/simplified", a.publicPageHandler(a.simplifiedArticleHTML))
	a.mux.HandleFunc("GET /newsletter/{action}", a.publicPageHandler(a.newsletterHTML))
	a.mux.HandleFunc("GET /robots.txt", a.robots)
	a.mux.HandleFunc("GET /sitemap.xml", a.sitemap)
}
func (a *App) publicPageHandler(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				failure := responseError(err)
				a.publicError(w, r, failure.Status)
			}
		}()
		handler(w, r)
	}
}
func (a *App) publicTheme(r *http.Request) Row {
	theme := a.settings(r.Context())
	captcha := a.publicCaptcha(r.Context())
	theme["commentPolicy"] = a.commentPolicy(r.Context())
	theme["captchaSiteKey"] = captcha.str("siteKey")
	theme["captchaProvider"] = captcha.str("provider")
	theme["captchaAction"] = captcha.str("action")
	theme["captchaCData"] = captcha.str("cData")
	theme["seo"] = a.seoSettings(r.Context())
	theme["authorProfile"] = a.publicAuthorProfile(r.Context())
	theme["publicUrl"] = a.publicationOrigin(r)
	pwa := a.pwaSettings(r.Context())
	brand := effectivePWA(theme, pwa)
	theme["pwa"] = Row{"showInstallButton": pwa.yes("showInstallButton"), "name": brand.str("name")}
	return theme
}
func (a *App) publishedSitemapPosts(r *http.Request) []Row {
	return a.DB.Must(r.Context(), `SELECT slug,updated_at FROM posts
		WHERE status='published' AND COALESCE(CAST(seo->>'noindex' AS TEXT),'false') NOT IN ('true','1')
		ORDER BY created_at DESC,id ASC`)
}
func (a *App) homeHTML(w http.ResponseWriter, r *http.Request) {
	theme := a.publicTheme(r)
	home := a.homepageData(r, theme)
	page := publicPage{Theme: theme, Home: &home, Posts: home.Posts, Title: theme.str("name") + " — " + publicationCopy(theme).Navigation, Description: theme.str("description"), Canonical: a.publicationOrigin(r) + strings.TrimPrefix(home.URL(home.Page), BasePath()), Status: 200}
	page.Data = publicJSON(Row{"theme": theme, "homepage": home})
	a.renderPublic(w, r, page)
}
func (a *App) privacyHTML(w http.ResponseWriter, r *http.Request) {
	theme := a.publicTheme(r)
	a.renderPublic(w, r, publicPage{
		Theme: theme, Title: "Privacy — " + theme.str("name"),
		Description: "How " + theme.str("name") + " uses Margin's built-in analytics and reader features.",
		Canonical: a.publicationOrigin(r) + "/privacy", Action: "privacy", Status: http.StatusOK,
	})
}
func (a *App) articleHTML(w http.ResponseWriter, r *http.Request) {
	a.articleHTMLView(w, r, false)
}
func (a *App) simplifiedArticleHTML(w http.ResponseWriter, r *http.Request) {
	a.articleHTMLView(w, r, true)
}
func (a *App) articleHTMLView(w http.ResponseWriter, r *http.Request, simplified bool) {
	if !simplified {
		w.Header().Add("Vary", "Cookie")
	}
	row := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='published'", r.PathValue("slug")))
	if row == nil {
		a.publicError(w, r, 404)
		return
	}
	version := a.simplifiedVersion(r.Context(), row)
	available := version != nil && version.str("status") == "ready"
	if simplified && !available {
		a.publicError(w, r, 404)
		return
	}
	if usePreferredArticleView(w, r, row.str("slug"), simplified, available) {
		return
	}
	content, err := a.Storage.Get(r.Context(), row.str("content_key"))
	if err != nil {
		a.publicError(w, r, 503)
		return
	}
	page := a.publishedArticlePage(r, row, version, string(content), available, simplified)
	a.recheckReadable(r.Context(), []Row{row})
	if simplified && !a.simplifiedCurrent(r.Context(), row) {
		a.publicError(w, r, 404)
		return
	}
	w.Header().Set("Link", "<"+sitePath("/posts/"+url.PathEscape(row.str("slug"))+".md")+">; rel=alternate; type=\"text/markdown\"")
	a.renderPublic(w, r, page)
}

// Remember explicit choices and redirect only when the preferred version is available.
func usePreferredArticleView(w http.ResponseWriter, r *http.Request, slug string, simplified, available bool) bool {
	if simplified || r.URL.Query().Get("view") == "standard" {
		view := "standard"
		if simplified {
			view = "simplified"
		}
		http.SetCookie(w, &http.Cookie{Name: "margin_reading_view", Value: view, Path: sitePath("/"), MaxAge: 365 * 24 * 60 * 60, Secure: r.TLS != nil, SameSite: http.SameSiteLaxMode})
	}
	if !simplified && available && r.URL.Query().Get("view") != "standard" {
		if preference, err := r.Cookie("margin_reading_view"); err == nil && preference.Value == "simplified" {
			http.Redirect(w, r, sitePath("/post/"+url.PathEscape(slug)+"/simplified"), http.StatusFound)
			return true
		}
	}
	return false
}

func (a *App) publishedArticlePage(r *http.Request, row, version Row, content string, available, simplified bool) publicPage {
	theme := a.publicTheme(r)
	item := post(row)
	item["content"] = content
	item["simplifiedAvailable"] = available
	if simplified {
		content = version.str("content")
		item["content"] = content
		item["simplified"] = true
		item["simplifiedReviewed"] = simplifiedReviewed(version)
	} else {
		item["reviewedBy"] = a.reviewerBadges(r.Context(), row)
	}
	theme = themeForContent(theme, item.str("contentType"))
	comments := a.visibleComments(r.Context(), theme, row.str("id"))
	contributors := a.publicContributors(r.Context(), row.str("id"))
	page := publicPage{Theme: theme, Post: item, Comments: comments, Contributors: contributors, AuthorUpdate: a.authorUpdate(r.Context(), row.str("id"), false), Title: item.str("title") + " — " + theme.str("name"), Description: item.str("excerpt"), Canonical: a.publicationOrigin(r) + "/post/" + url.PathEscape(item.str("slug")), Status: 200}
	// rssMarkdown is the shared safe Go renderer: author HTML and unsafe URLs are removed.
	if simplified {
		page.Body = template.HTML(simplifiedMarkdown(content, page.Canonical)) // #nosec G203 -- simplifiedMarkdown disables author HTML and unsafe URLs.
	} else {
		page.Body = template.HTML(sectionedArticle(content, page.Canonical, true, item.str("tableOfContents"), contentsDesign(theme), "")) // #nosec G203 -- renderMarkdown disables author HTML and unsafe URLs; articleContents preserves that sanitized markup.
	}
	page.Related = a.relatedPosts(r.Context(), row.str("id"))
	page.Data = publicJSON(Row{"theme": theme, "post": item, "comments": comments, "contributors": contributors, "relatedPosts": page.Related})
	return page
}

func (a *App) newsletterHTML(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	if action != "confirm" && action != "unsubscribe" {
		a.publicError(w, r, 404)
		return
	}
	theme := a.publicTheme(r)
	page := publicPage{Theme: theme, Title: "Newsletter — " + theme.str("name"), Action: action, Status: 200}
	page.Data = publicJSON(Row{"theme": theme, "newsletterAction": action})
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	a.renderPublic(w, r, page)
}
func publicJSON(value any) template.JS {
	// Use default HTML escaping, not encode(), so </script> cannot escape the data element.
	data, err := json.Marshal(value)
	must(err)
	return template.JS(data) // #nosec G203 -- json.Marshal uses HTML escaping, preventing script termination and escapes JS line separators.
}
func (a *App) renderPublic(w http.ResponseWriter, r *http.Request, page publicPage) {
	page.PWA = effectivePWA(page.Theme, a.pwaSettings(r.Context()))
	applyPublicSEO(&page)
	if page.Preview {
		page.Robots = "noindex, nofollow"
		page.Structured = ""
	}
	if page.Robots != "" {
		w.Header().Set("X-Robots-Tag", page.Robots)
	}
	page.Nonce = pageNonce(w)
	page.Script, page.Styles, page.Preloads = a.entryAssets("src/public-entry.tsx")
	var output bytes.Buffer
	must(publicTemplate.Execute(&output, page))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(page.Status)
	if r.Method != "HEAD" {
		_, _ = w.Write(output.Bytes())
	}
}
func pageNonce(w http.ResponseWriter) string {
	nonce := token()
	policy := w.Header().Get("Content-Security-Policy")
	w.Header().Set("Content-Security-Policy", strings.Replace(policy, "script-src 'self'", "script-src 'self' 'nonce-"+nonce+"'", 1))
	return nonce
}
func (a *App) entryAssets(name string) (string, []string, []string) {
	if a.Web == nil {
		return "", nil, nil
	}
	content, err := fs.ReadFile(a.Web, "public-manifest.json")
	if err != nil {
		return "", nil, nil
	}
	var manifest map[string]struct {
		File    string   `json:"file"`
		CSS     []string `json:"css"`
		Imports []string `json:"imports"`
	}
	if json.Unmarshal(content, &manifest) != nil {
		return "", nil, nil
	}
	entry := manifest[name]
	styles := []string{}
	for _, css := range entry.CSS {
		styles = append(styles, sitePath("/"+css))
	}
	if entry.File == "" {
		return "", styles, nil
	}
	var preloads []string
	for _, dependency := range entry.Imports {
		if file := manifest[dependency].File; file != "" {
			preloads = append(preloads, sitePath("/"+file))
		}
	}
	return sitePath("/" + entry.File), styles, preloads
}
func (a *App) robots(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	policy := "User-agent: *\nAllow: " + sitePath("/") + "\nDisallow: " + sitePath("/admin") + "\nDisallow: " + sitePath("/api/") + "\nDisallow: " + sitePath("/newsletter/") + "\n"
	// Crawlers need access to read noindex directives on previously indexed pages.
	if a.seoSettings(r.Context()).yes("indexing") {
		policy += "Sitemap: " + a.publicationOrigin(r) + "/sitemap.xml\n"
	}
	_, _ = w.Write([]byte(policy))
}
func (a *App) sitemap(w http.ResponseWriter, r *http.Request) {
	var output strings.Builder
	base := a.publicationOrigin(r)
	output.WriteString(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	if a.seoSettings(r.Context()).yes("indexing") {
		output.WriteString("<url><loc>" + rssXML(base) + "/</loc></url>")
		output.WriteString("<url><loc>" + rssXML(base) + "/privacy</loc></url>")
		for _, post := range a.publishedSitemapPosts(r) {
			output.WriteString("<url><loc>" + rssXML(base+"/post/"+url.PathEscape(post.str("slug"))) + "</loc><lastmod>" + rssXML(post.str("updated_at")) + "</lastmod></url>")
		}
	}
	output.WriteString("</urlset>")
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(output.String()))
}

var compiledScriptTag = regexp.MustCompile(`<script\b[^>]*>`)

func workspaceNonce(document, nonce string) string {
	document = strings.ReplaceAll(document, "__MARGIN_NONCE__", nonce)
	// Framework streaming bootstrap scripts are also part of this trusted build artifact.
	return compiledScriptTag.ReplaceAllStringFunc(document, func(tag string) string {
		if strings.Contains(tag, " nonce=") {
			return tag
		}
		return strings.Replace(tag, "<script", `<script nonce="`+nonce+`"`, 1)
	})
}
