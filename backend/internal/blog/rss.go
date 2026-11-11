package blog

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (a *App) rss(w http.ResponseWriter, r *http.Request) {
	a.indexingHeader(w, r)
	w.Header().Set("Cache-Control", "no-store")
	theme := a.settings(r.Context())
	object(theme["comments"])["visible"] = a.commentsOpen(r.Context(), theme)
	theme["seo"] = a.seoSettings(r.Context())
	rows := a.DB.Must(r.Context(), "SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC, id ASC")
	a.collectionIndexingHeader(w, r, rows)
	posts := make([]Row, 0, len(rows))
	for _, row := range rows {
		content, err := a.Storage.Get(r.Context(), row.str("content_key"))
		if err != nil {
			fail(503, "The feed is temporarily unavailable because article content could not be loaded.")
		}
		item := post(row)
		item["content"] = string(content)
		posts = append(posts, item)
	}
	result, err := buildRSS(theme, posts, a.publicationOrigin(r))
	must(err)
	a.recheckReadable(r.Context(), rows)
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	_, _ = w.Write([]byte(result))
}

func buildRSS(theme Row, posts []Row, origin string) (string, error) {
	base, err := url.Parse(origin)
	if err != nil {
		return "", err
	}
	if !rssPublicURL(base) {
		return "", fmt.Errorf("RSS requires a public HTTP(S) origin without credentials")
	}
	home := strings.TrimRight(base.String(), "/") + "/"
	var items strings.Builder
	var latest time.Time
	for _, item := range posts {
		if item.str("status") != "published" {
			continue
		}
		updated, _ := time.Parse(time.RFC3339Nano, item.str("updatedAt"))
		if updated.After(latest) {
			latest = updated
		}
		items.WriteString(rssItem(item, home, commentsVisible(theme)))
	}
	date := ""
	if !latest.IsZero() {
		date = "<lastBuildDate>" + rssDate(latest) + "</lastBuildDate>"
	}
	return `<?xml version="1.0" encoding="UTF-8"?>` + "\n" +
		`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">` +
		"<channel><title>" + rssXML(theme.str("name")) + "</title><link>" + rssXML(home) + "</link><description>" + rssXML(rssDescription(theme)) + "</description><generator>Margin</generator>" +
		`<atom:link href="` + rssXML(home+"rss.xml") + `" rel="self" type="application/rss+xml" />` + date + items.String() + "</channel></rss>", nil
}
func rssPublicURL(u *url.URL) bool {
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.User == nil
}
func rssDate(t time.Time) string { return t.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT") }
func rssItem(item Row, home string, showComments bool) string {
	link := home + "post/" + url.PathEscape(item.str("slug"))
	created, _ := time.Parse(time.RFC3339Nano, item.str("createdAt"))
	source := audioCoverContent(item.str("cover"), item.str("content"))
	content := sectionedArticle(source, link, false, "off", nil, link)
	result := "<item><title>" + rssXML(item.str("title")) + "</title><link>" + rssXML(link) + `</link><guid isPermaLink="false">urn:uuid:` + rssXML(item.str("id")) + "</guid>" +
		"<pubDate>" + rssDate(created) + "</pubDate><description>" + rssXML(rssSummary(item, content)) + "</description><content:encoded>" + rssXML(content) + "</content:encoded>"
	for _, tag := range rssTags(item["tags"]) {
		result += "<category>" + rssXML(tag) + "</category>"
	}
	if showComments {
		result += "<comments>" + rssXML(link) + "#comments</comments>"
	}
	return result + "</item>"
}
func rssTags(value any) []string {
	if tags, ok := value.([]string); ok {
		return tags
	}
	result := []string{}
	if tags, ok := value.([]any); ok {
		for _, tag := range tags {
			if s, ok := tag.(string); ok {
				result = append(result, s)
			}
		}
	}
	return result
}
func rssXML(value string) string {
	value = strings.Map(func(r rune) rune {
		if rssXMLRune(r) {
			return r
		}
		return -1
	}, value)
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;").Replace(value)
}
func rssXMLRune(r rune) bool {
	if r == 9 || r == 10 || r == 13 {
		return true
	}
	return r >= 0x20 && r <= 0xd7ff || r >= 0xe000 && r <= 0xfffd || r >= 0x10000 && r <= 0x10ffff
}
