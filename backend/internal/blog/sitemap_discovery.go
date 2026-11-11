package blog

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Only the HTTP origin's robots.txt governs crawling, even for a blog on a subpath.
func (a *App) checkSitemapDiscovery(w http.ResponseWriter, r *http.Request) {
	origin := a.searchOrigin(r.Context())
	if origin == "" {
		send(w, 200, Row{"status": "unavailable", "message": "Set the public HTTPS blog URL in Domain settings, then check again."})
		return
	}
	client := previewHTTPClient()
	defer client.CloseIdleConnections()
	send(w, 200, rootSitemapCheck(r.Context(), client, origin))
}

func rootSitemapCheck(ctx context.Context, client *http.Client, origin string) Row {
	blog, err := url.Parse(origin)
	must(err)
	robots := blog.ResolveReference(&url.URL{Path: "/robots.txt"}).String()
	sitemap := origin + "/sitemap.xml"
	result := Row{"robots": robots, "sitemap": sitemap, "directive": "Sitemap: " + sitemap, "status": "unavailable"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, robots, nil)
	must(err)
	req.Header.Set("User-Agent", "Margin-SitemapCheck/1.0")
	resp, err := client.Do(req)
	if err != nil {
		result["message"] = "Margin could not fetch the public root robots.txt. Check its address and try again."
		return result
	}
	defer resp.Body.Close()
	result["httpStatus"] = resp.StatusCode
	switch resp.StatusCode {
	case http.StatusNotFound, http.StatusGone:
		result["status"] = "missing"
		result["message"] = "No root robots.txt was found. Add this sitemap line to a robots.txt at the root of your main website."
	case http.StatusOK:
		checkRobotsContent(result, resp, sitemap)
	default:
		result["message"] = "The website did not return its root robots.txt successfully. Check the HTTP status before changing its rules."
	}
	return result
}

func checkRobotsContent(result Row, resp *http.Response, sitemap string) {
	// Google processes the first 500 KiB. Never treat an HTML fallback or failed read as an absent directive.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 500*1024))
	if err != nil || strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "html") {
		result["message"] = "The root URL did not return a readable robots.txt. Check the website’s routing and try again."
		return
	}
	for _, line := range strings.Split(strings.TrimPrefix(string(body), "\uFEFF"), "\n") {
		field, value, _ := strings.Cut(strings.TrimSpace(strings.SplitN(line, "#", 2)[0]), ":")
		if strings.EqualFold(strings.TrimSpace(field), "sitemap") && sameSitemap(strings.TrimSpace(value), sitemap) {
			result["status"] = "found"
			result["message"] = "The root robots.txt advertises this blog’s sitemap."
			return
		}
	}
	result["status"] = "missing"
	result["message"] = "The root robots.txt does not list this sitemap directly. Add the line alongside the website’s existing sitemaps, or verify that an advertised sitemap index includes this blog."
}

func sameSitemap(value, expected string) bool {
	actual, err := url.Parse(value)
	if err != nil || actual.User != nil || actual.Fragment != "" || actual.RawQuery != "" {
		return false
	}
	want, _ := url.Parse(expected)
	return actual.Scheme == want.Scheme && strings.EqualFold(actual.Host, want.Host) && actual.EscapedPath() == want.EscapedPath()
}
