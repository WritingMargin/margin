package blog

import (
	"context"
	"errors"
	"html"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	xhtml "golang.org/x/net/html"
)

func validLinkPreviewURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || !rssPublicURL(u) {
		return false
	}
	port := u.Port()
	if !previewPort(u.Scheme, port) {
		return false
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return publicPWAIP(ip)
	}
	return host != ""
}

var errPreviewRedirectRefused = errors.New("preview redirect refused")

func previewHTTPClient() *http.Client {
	// Pin public DNS results to the connection, including after every redirect.
	transport := &http.Transport{DialContext: dialPWALogo, TLSHandshakeTimeout: 3 * time.Second, DisableKeepAlives: true, MaxResponseHeaderBytes: 64 << 10}
	return &http.Client{Transport: transport, Timeout: 6 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) >= 4 || !validLinkPreviewURL(r.URL.String()) {
			return errPreviewRedirectRefused
		}
		return nil
	}}
}

// @Summary Fetch metadata for a link preview card
// @ID previewLink
// @Description Fetches public HTTP(S) page metadata with bounded redirects, time and response size. Internal addresses and credentials are blocked. Returns plain text and an optional image URL, never executable embed HTML. Save these fields in a [Link url="URL" mode="preview" title="Title" description="Summary" image="URL"] tag. Readers use the saved snapshot, not a live fetch. If the site blocks access, use a plain link or supply the card details manually.
// @Tags Media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APILinkPreviewInput true "Public page URL"
// @Success 200 {object} APILinkPreview
// @Failure 400 {object} APIError "Invalid URL"
// @Failure 401 {object} APIError "Authentication required"
// @Failure 502 {object} APIError "Page metadata unavailable"
// @Router /api/media/preview [post]
func (a *App) previewLink(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "url")
	source := stringField(input, "url", 1, 2048, true)
	if !validLinkPreviewURL(source) {
		fail(400, "Use a public HTTP or HTTPS page URL without credentials.")
	}
	client := previewHTTPClient()
	defer client.CloseIdleConnections()
	result, err := fetchLinkPreview(r.Context(), client, source)
	if err != nil {
		fail(502, "This page’s preview could not be loaded. Use a plain link or add card details manually.")
	}
	send(w, 200, result)
}
func fetchLinkPreview(ctx context.Context, client *http.Client, source string) (Row, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/html, application/xhtml+xml")
	req.Header.Set("User-Agent", "Margin-LinkPreview/1.0")
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, errors.New("page request failed")
	}
	kind := strings.ToLower(strings.Split(response.Header.Get("Content-Type"), ";")[0])
	if kind != "text/html" && kind != "application/xhtml+xml" {
		return nil, errors.New("page is not HTML")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return nil, errors.New("page exceeds preview limit")
	}
	result := parseLinkPreview(data, response.Request.URL)
	result["url"] = source
	return result, nil
}
func previewAttributes(token xhtml.Token) map[string]string {
	result := map[string]string{}
	for _, attr := range token.Attr {
		result[strings.ToLower(attr.Key)] = attr.Val
	}
	return result
}
func previewText(raw string, limit int) string {
	raw = strings.Join(strings.Fields(raw), " ")
	runes := []rune(raw)
	if len(runes) > limit {
		raw = string(runes[:limit])
	}
	return raw
}
func parseLinkPreview(data []byte, base *url.URL) Row {
	metadata := map[string]string{}
	tokenizer := xhtml.NewTokenizer(strings.NewReader(string(data)))
	title := ""
	for {
		kind := tokenizer.Next()
		if kind == xhtml.ErrorToken {
			break
		}
		token := tokenizer.Token()
		if kind == xhtml.EndTagToken && token.Data == "head" {
			break
		}
		if kind == xhtml.StartTagToken && token.Data == "title" {
			title = readPreviewTitle(tokenizer)
		}
		if (kind == xhtml.StartTagToken || kind == xhtml.SelfClosingTagToken) && token.Data == "meta" {
			addPreviewMeta(metadata, previewAttributes(token))
		}
	}
	return Row{"title": previewText(firstPreviewValue(metadata["og:title"], metadata["twitter:title"], title, base.Hostname()), 300), "description": previewText(firstPreviewValue(metadata["og:description"], metadata["twitter:description"], metadata["description"]), 1000), "image": previewImageURL(firstPreviewValue(metadata["og:image"], metadata["twitter:image"]), base)}
}
func readPreviewTitle(tokenizer *xhtml.Tokenizer) string {
	if tokenizer.Next() == xhtml.TextToken {
		return tokenizer.Token().Data
	}
	return ""
}
func addPreviewMeta(metadata map[string]string, attrs map[string]string) {
	key := strings.ToLower(firstPreviewValue(attrs["property"], attrs["name"]))
	if metadata[key] == "" {
		metadata[key] = attrs["content"]
	}
}
func firstPreviewValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
func previewImageURL(raw string, base *url.URL) string {
	if raw == "" || len(raw) > 2048 {
		return ""
	}
	target, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	image := base.ResolveReference(target).String()
	if !validLinkPreviewURL(image) {
		return ""
	}
	return image
}
func linkCardHTML(attrs map[string]string, styled bool) string {
	target := citationSourceURL(attrs["url"])
	parsed, err := url.Parse(target)
	if err != nil || !rssPublicURL(parsed) {
		return "<p>Add a valid HTTP or HTTPS link.</p>"
	}
	title := firstPreviewValue(attrs["title"], parsed.Hostname())
	if attrs["mode"] == "link" {
		return `<a href="` + html.EscapeString(target) + `">` + html.EscapeString(title) + `</a>`
	}
	image := ""
	if validLinkPreviewURL(attrs["image"]) {
		image = `<img src="` + html.EscapeString(attrs["image"]) + `" alt="" loading="lazy" referrerpolicy="no-referrer">`
	}
	class := ""
	if styled {
		class = ` class="link-preview-card"`
	}
	return `<a` + class + ` href="` + html.EscapeString(target) + `" rel="noopener noreferrer">` + image + `<span class="link-preview-body"><span class="link-preview-domain">` + html.EscapeString(parsed.Hostname()) + `</span><strong>` + html.EscapeString(title) + `</strong><span class="link-preview-description">` + html.EscapeString(attrs["description"]) + `</span><span class="link-preview-action">Read more ↗</span></span></a>`
}

func previewPort(scheme, port string) bool {
	return port == "" || (scheme == "https" && port == "443") || (scheme == "http" && port == "80")
}
