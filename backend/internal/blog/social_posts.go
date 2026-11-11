package blog

import (
	"html"
	"net/url"
	"regexp"
	"strings"

	"github.com/yuin/goldmark/ast"
)

type socialPostLink struct{ provider, url string }

var socialX = regexp.MustCompile(`^/(?:[A-Za-z0-9_]{1,15}/status|i/web/status)/(\d{1,25})(?:/(?:photo|video)/\d+)?/?$`)
var socialInstagram = regexp.MustCompile(`^/(p|reel)/([A-Za-z0-9_-]{1,64})/?$`)
var socialLinkedInURN = regexp.MustCompile(`^/feed/update/(urn:li:(?:activity|share|ugcPost):\d{1,25})/?$`)
var socialLinkedInSlug = regexp.MustCompile(`^/posts/[A-Za-z0-9_-]+-activity-(\d{1,25})-[A-Za-z0-9_-]+/?$`)

func parseSocialPost(raw string) *socialPostLink {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return nil
	}
	path := u.EscapedPath()
	switch strings.ToLower(u.Host) {
	case "x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com":
		if match := socialX.FindStringSubmatch(path); match != nil {
			return &socialPostLink{"X", "https://x.com/i/web/status/" + match[1]}
		}
	case "instagram.com", "www.instagram.com":
		if match := socialInstagram.FindStringSubmatch(path); match != nil {
			return &socialPostLink{"Instagram", "https://www.instagram.com/" + match[1] + "/" + match[2] + "/"}
		}
	case "linkedin.com", "www.linkedin.com":
		return parseLinkedInPost(path)
	}
	return nil
}
func parseLinkedInPost(path string) *socialPostLink {
	urn := ""
	if match := socialLinkedInURN.FindStringSubmatch(path); match != nil {
		urn = match[1]
	}
	if match := socialLinkedInSlug.FindStringSubmatch(path); match != nil {
		urn = "urn:li:activity:" + match[1]
	}
	if urn == "" {
		return nil
	}
	return &socialPostLink{"LinkedIn", "https://www.linkedin.com/feed/update/" + urn + "/"}
}
func socialPostHTML(raw, title string) string {
	post := parseSocialPost(raw)
	if post == nil {
		return "<p>Use a valid X, Instagram or LinkedIn post URL.</p>"
	}
	if title == "" {
		title = "View this post on " + post.provider
	}
	return `<section class="social-post-card"><div class="social-post-heading">` + post.provider + `</div><a class="social-post-title" href="` + html.EscapeString(post.url) + `" target="_blank" rel="noopener noreferrer">` + html.EscapeString(title) + ` ↗</a></section>`
}
func socialParagraphURL(node ast.Node, source []byte) string {
	if node.Kind() != ast.KindParagraph || node.ChildCount() != 1 {
		return ""
	}
	switch child := node.FirstChild().(type) {
	case *ast.AutoLink:
		return string(child.URL(source))
	case *ast.Link:
		if child.ChildCount() == 1 && child.FirstChild().Kind() == ast.KindText && string(child.Text(source)) == string(child.Destination) {
			return string(child.Destination)
		}
	}
	return ""
}
func (m *rssMarkup) socialPosts(document ast.Node, source []byte) {
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		raw := socialParagraphURL(node, source)
		if parseSocialPost(raw) == nil {
			return ast.WalkContinue, nil
		}
		node.RemoveChildren(node)
		node.AppendChild(node, ast.NewString([]byte(strings.TrimSpace(m.token(socialPostHTML(raw, ""), true)))))
		return ast.WalkSkipChildren, nil
	})
}
