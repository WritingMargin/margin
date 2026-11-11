package blog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (a *App) callPublishingProvider(ctx context.Context, token, method, address string, input any) (*http.Response, error) {
	var body io.Reader
	if input != nil {
		data, err := json.Marshal(input)
		must(err)
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, address, body)
	must(err)
	req.Header.Set("Authorization", "Bearer "+token)
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if req.URL.Host == "api.linkedin.com" {
		req.Header.Set("X-Restli-Protocol-Version", "2.0.0")
	}
	return a.publishingClient().Do(req)
}
func (a *App) publishingRequest(ctx context.Context, token, method, address string, input, output any) {
	res, err := a.callPublishingProvider(ctx, token, method, address, input)
	if err != nil {
		fail(502, "Could not reach the provider. Try again.")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		fail(502, fmt.Sprintf("Provider returned HTTP %d. Check the connected account, permissions and quota.", res.StatusCode))
	}
	if output != nil {
		data, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
		if err != nil || json.Unmarshal(data, output) != nil {
			fail(502, "The provider returned an unreadable response.")
		}
	}
}

const googleWebmasters = "https://www.googleapis.com/webmasters/v3/sites"

func coversPublication(property, origin string) bool {
	blog, err := url.Parse(origin)
	if err != nil || blog.Hostname() == "" {
		return false
	}
	if domain, ok := strings.CutPrefix(property, "sc-domain:"); ok {
		return strings.EqualFold(blog.Hostname(), domain) || strings.HasSuffix(strings.ToLower(blog.Hostname()), "."+strings.ToLower(domain))
	}
	return prefixCoversPublication(property, blog)
}

func prefixCoversPublication(property string, blog *url.URL) bool {
	prefix, err := url.Parse(property)
	if err != nil || prefix.User != nil || prefix.RawQuery != "" || prefix.Fragment != "" {
		return false
	}
	return prefix.Scheme == blog.Scheme && strings.EqualFold(prefix.Host, blog.Host) && strings.HasPrefix(strings.TrimRight(blog.EscapedPath(), "/")+"/", strings.TrimRight(prefix.EscapedPath(), "/")+"/")
}
func (a *App) googleProperties(ctx context.Context, row Row) []string {
	var result struct {
		SiteEntry []struct {
			SiteURL         string
			PermissionLevel string
		}
	}
	a.publishingRequest(ctx, a.publishingToken(ctx, row), "GET", googleWebmasters, nil, &result)
	origin := a.searchOrigin(ctx)
	properties := []string{}
	for _, site := range result.SiteEntry {
		if site.PermissionLevel != "siteUnverifiedUser" && coversPublication(site.SiteURL, origin) {
			properties = append(properties, site.SiteURL)
		}
	}
	return properties
}

// @Summary List accessible Search Console properties covering the publication
// @ID listGoogleProperties
// @Description Requires a connected Search Console account. Choose a property returned by listGoogleProperties.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/settings/publishing/google/properties [get]
func (a *App) listGoogleProperties(w http.ResponseWriter, r *http.Request) {
	send(w, 200, Row{"properties": a.googleProperties(r.Context(), a.publishingConnection(r.Context(), "google"))})
}
func (a *App) googleTarget(r *http.Request, input Row) (string, string, string) {
	ctx := r.Context()
	origin := a.searchOrigin(ctx)
	property := stringField(input, "property", 1, 2048, true)
	if !coversPublication(property, origin) {
		fail(400, "Choose a Search Console property covering this publication.")
	}
	return property, origin, a.publishingToken(ctx, a.publishingConnection(ctx, "google"))
}

// @Summary Submit this publication’s generated sitemap to Google
// @ID submitGoogleSitemap
// @Description Requires a connected Search Console account. Choose a property returned by listGoogleProperties.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Accept json
// @Param input body APIGoogleProperty true "Search Console target"
// @Success 200 {object} map[string]interface{}
// @Router /api/settings/publishing/google/submit [post]
func (a *App) submitGoogleSitemap(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "property")
	a.requireSearchReady(r.Context())
	property, origin, token := a.googleTarget(r, input)
	feed := origin + "/sitemap.xml"
	a.publishingRequest(r.Context(), token, "PUT", googleWebmasters+"/"+url.PathEscape(property)+"/sitemaps/"+url.PathEscape(feed), nil, nil)
	send(w, 200, Row{"sitemap": feed, "submitted": true})
}

// @Summary Inspect Google’s recorded indexing status for a published article
// @ID inspectGoogleArticle
// @Description Requires a connected Search Console account. Choose a property returned by listGoogleProperties.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Accept json
// @Param input body APIGoogleInspectionInput true "Search Console target"
// @Success 200 {object} map[string]interface{}
// @Router /api/settings/publishing/google/inspect [post]
func (a *App) inspectGoogleArticle(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "property", "slug")
	post := a.readablePost(r.Context(), stringField(input, "slug", 1, 200, true))
	property, origin, token := a.googleTarget(r, input)
	canonical := readableLinks(post, origin).str("canonical")
	var reply struct {
		InspectionResult struct{ IndexStatusResult Row }
	}
	a.publishingRequest(r.Context(), token, "POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", Row{"siteUrl": property, "inspectionUrl": canonical}, &reply)
	result := reply.InspectionResult.IndexStatusResult
	if result == nil {
		result = Row{}
	}
	result["url"] = canonical
	a.recordGoogleMeasurement(r.Context(), post.str("id"), property, canonical, "indexing", result)
	send(w, 200, result)
}

type APIGoogleProperty struct {
	Property string `json:"property" binding:"required" minLength:"1" maxLength:"2048"`
}
type APIGoogleInspectionInput struct {
	APIGoogleProperty
	Slug string `json:"slug" binding:"required" minLength:"1" maxLength:"200"`
}
