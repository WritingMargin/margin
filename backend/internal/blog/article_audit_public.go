package blog

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"golang.org/x/net/html"
)

func (r *articleAuditReport) checkPublic(ctx context.Context, item, theme Row) {
	if r.URL == "" || !validLinkPreviewURL(r.URL) {
		r.add("public.address", "unavailable", "publicUrl", "The public address cannot be verified.", "A live check needs a public HTTPS publication URL.", "Configure the publication address in Settings and retry.")
		return
	}
	client := previewHTTPClient()
	defer client.CloseIdleConnections()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	r.fetchPublic(ctx, client, item, theme)
}
func (r *articleAuditReport) fetchPublic(ctx context.Context, client *http.Client, item, theme Row) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.URL, nil)
	must(err)
	req.Header.Set("Accept", "text/html")
	req.Header.Set("User-Agent", "Margin-ArticleAudit/1.0")
	res, err := client.Do(req)
	if err != nil {
		r.unavailable()
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		r.add("public.status", "error", r.URL, fmt.Sprintf("The article returned HTTP %d.", res.StatusCode), "Readers and crawlers need a successful response at the canonical URL.", "Check the public route, proxy, and publication status, then verify again.")
		return
	}
	if !strings.EqualFold(strings.TrimSpace(strings.SplitN(res.Header.Get("Content-Type"), ";", 2)[0]), "text/html") {
		r.add("public.html", "error", r.URL, "The article response is not HTML.", "Crawlers cannot read the expected article page.", "Check the public route and Content-Type header.")
		return
	}
	const limit = 4 << 20
	data, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil || len(data) > limit {
		r.unavailable()
		return
	}
	page, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		r.unavailable()
		return
	}
	r.compareHTML(page, item, theme, strings.Join(res.Header.Values("X-Robots-Tag"), ","))
}
func (r *articleAuditReport) unavailable() {
	r.add("public.fetch", "unavailable", r.URL, "Margin could not read the public HTML within its network and size limits.", "The live output has not been verified.", "Check DNS, TLS and proxy access, then run public verification again.")
}

type auditHTML struct {
	values map[string]string
	schema Row
}

func inspectAuditHTML(root *html.Node) auditHTML {
	view := auditHTML{values: map[string]string{}}
	for n := range root.Descendants() {
		if n.Type != html.ElementNode {
			continue
		}
		attrs := map[string]string{}
		for _, attr := range n.Attr {
			attrs[attr.Key] = attr.Val
		}
		if n.Parent != nil && n.Parent.Data == "head" {
			view.readHead(n, attrs)
		} else {
			view.readBody(n, attrs)
		}
	}
	return view
}
func (v *auditHTML) readHead(n *html.Node, attrs map[string]string) {
	switch n.Data {
	case "title":
		v.values["title"] = contentsText(n)
	case "meta":
		key := attrs["name"]
		if key == "" {
			key = attrs["property"]
		}
		v.values[key] = attrs["content"]
	case "link":
		if attrs["rel"] == "canonical" {
			v.values["canonical"] = attrs["href"]
		}
	case "script":
		if attrs["type"] == "application/ld+json" {
			var data Row
			if json.Unmarshal([]byte(contentsText(n)), &data) == nil && data["headline"] != nil {
				v.schema = data
			}
		}
	}
}
func (v *auditHTML) readBody(n *html.Node, attrs map[string]string) {
	if n.Data == "h1" && v.values["h1"] == "" {
		v.values["h1"] = contentsText(n)
	}
	if n.Data == "a" && attrs["rel"] == "author" {
		v.values["byline.url"] = attrs["href"]
	}
	if n.Data == "div" && strings.Contains(" "+attrs["class"]+" ", " post-byline ") {
		v.values["byline"] = strings.TrimSpace(strings.TrimPrefix(auditText(n), "By "))
	}
}
func auditText(n *html.Node) string {
	var b strings.Builder
	for child := range n.Descendants() {
		if child.Type == html.TextNode {
			b.WriteString(child.Data)
		}
	}
	return b.String()
}
func (r *articleAuditReport) compareHTML(doc *html.Node, item, theme Row, header string) {
	view := inspectAuditHTML(doc)
	schema := view.schema
	seo := object(theme["seo"])
	profile := object(theme["authorProfile"])
	page := publicPage{Canonical: r.URL, ShareImage: postShareImage(item, seo)}
	resolveShareImage(&page)
	compare := func(key string, values ...string) {
		for _, v := range values[1:] {
			if v != values[0] {
				r.add("public."+key, "warning", r.URL, "Published "+key+" differs from the saved article.", "Readers or crawlers may receive stale or inconsistent article information.", "Check the saved settings and the public HTML, clear any stale cache, then verify again.")
				return
			}
		}
	}
	compare("canonical", r.URL, view.values["canonical"], view.values["og:url"], schema.str("url"), schema.str("mainEntityOfPage"))
	compare("headline", item.str("title"), view.values["h1"], schema.str("headline"))
	compare("title", postSearchTitle(item, theme), view.values["title"], view.values["og:title"], view.values["twitter:title"])
	compare("description", postSearchDescription(item, item.str("content")), view.values["description"], view.values["og:description"], view.values["twitter:description"], schema.str("description"))
	compare("image", page.ShareImage, view.values["og:image"], view.values["twitter:image"], schema.str("image"))
	compare("author", profile.str("name"), view.values["byline"], object(schema["author"]).str("name"))
	compare("profile", profile.str("website"), view.values["byline.url"], view.values["article:author"], object(schema["author"]).str("url"))
	compare("datePublished", item.str("createdAt"), view.values["article:published_time"], schema.str("datePublished"))
	compare("dateModified", item.str("updatedAt"), view.values["article:modified_time"], schema.str("dateModified"))
	hidden := strings.Contains(strings.ToLower(header+","+view.values["robots"]), "noindex")
	if hidden != (r.Intent == "hidden") {
		r.add("public.robots", "warning", r.URL, "The public robots directives differ from your indexing intent.", "A proxy header or HTML tag can change whether Google may index this page.", "Check the X-Robots-Tag response header and the robots meta tag against Blog SEO and the post settings.")
	}
}
