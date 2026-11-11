package blog

import (
	"context"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
)

func (a *App) searchEngineRoutes() {
	a.mux.HandleFunc("GET /api/settings/search-engines", a.readSearchEngines)
	a.mux.HandleFunc("PUT /api/settings/search-engines", a.saveSearchEngines)
	a.mux.HandleFunc("POST /api/settings/search-engines/submit", a.submitSearchEngines)
	a.mux.HandleFunc("GET /api/settings/search-engines/discovery", a.checkSitemapDiscovery)
	a.mux.HandleFunc("GET /indexnow.txt", a.indexNowKey)
}
func (a *App) searchEngineSettings(ctx context.Context) Row {
	return a.siteSetting(ctx, "search_engines", Row{"enabled": false, "key": ""}, func(row Row) Row {
		booleanField(row, "enabled")
		key := stringField(row, "key", 0, 64, false)
		if key != "" && !indexNowKeyPattern.MatchString(key) {
			fail(500, "Invalid search verification key.")
		}
		return row
	})
}

// Submission URLs come only from saved configuration, never a request Host header.
func (a *App) searchOrigin(ctx context.Context) string {
	raw := a.domainSettings(ctx).str("url")
	if raw == "" {
		raw = os.Getenv("PUBLIC_URL")
	}
	u, err := url.Parse(raw)
	if err != nil || !publicSearchOrigin(u) {
		return ""
	}
	return canonicalOrigin(u) + BasePath()
}
func publicSearchOrigin(u *url.URL) bool {
	if u.Scheme != "https" || u.User != nil || u.Port() != "" || !validDomainHost(u.Hostname()) {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, suffix := range []string{".localhost", ".local", ".internal", ".test", ".invalid", ".example"} {
		if strings.HasSuffix(host, suffix) {
			return false
		}
	}
	_, err := netip.ParseAddr(host)
	return err != nil && u.RawQuery == "" && u.Fragment == ""
}
func (a *App) indexNowTarget(ctx context.Context) string {
	if !a.searchEngineSettings(ctx).yes("enabled") || !a.seoSettings(ctx).yes("indexing") {
		return ""
	}
	return a.searchOrigin(ctx)
}
func (a *App) readSearchEngines(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings := a.searchEngineSettings(ctx)
	origin := a.searchOrigin(ctx)
	result := Row{"enabled": settings["enabled"], "origin": origin, "indexing": a.seoSettings(ctx)["indexing"], "pending": 0, "failed": 0, "lastSubmission": nil, "lastAttempt": nil}
	result["pending"] = first(a.DB.Must(ctx, "SELECT COUNT(*) AS count FROM search_notifications WHERE origin=$1 AND status IN ('queued','retrying')", origin))["count"]
	result["failed"] = first(a.DB.Must(ctx, "SELECT COUNT(*) AS count FROM search_notifications WHERE origin=$1 AND status='failed'", origin))["count"]
	result["lastSubmission"] = first(a.DB.Must(ctx, "SELECT MAX(submitted_at) AS submitted FROM search_notifications WHERE origin=$1", origin))["submitted"]
	result["lastAttempt"] = first(a.DB.Must(ctx, "SELECT status,message,attempted_at FROM search_notifications WHERE origin=$1 AND attempted_at IS NOT NULL ORDER BY attempted_at DESC LIMIT 1", origin))
	send(w, 200, result)
}
func (a *App) saveSearchEngines(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "enabled")
	enabled := booleanField(input, "enabled")
	if enabled {
		a.requireSearchReady(r.Context())
	}
	settings := a.searchEngineSettings(r.Context())
	wasEnabled := settings.yes("enabled")
	settings["enabled"] = enabled
	if settings.str("key") == "" {
		settings["key"] = hash(token())
	}
	a.saveSiteSetting(r.Context(), "search_engines", settings)
	if enabled && !wasEnabled {
		a.queueSearchSite(r.Context(), a.searchOrigin(r.Context()))
	}
	a.readSearchEngines(w, r)
}
func (a *App) requireSearchReady(ctx context.Context) string {
	origin := a.searchOrigin(ctx)
	if origin == "" {
		fail(400, "Set your public HTTPS blog URL in Domain settings or PUBLIC_URL before submitting to search engines.")
	}
	if !a.seoSettings(ctx).yes("indexing") {
		fail(400, "Save SEO settings with search indexing enabled first.")
	}
	return origin
}
func (a *App) submitSearchEngines(w http.ResponseWriter, r *http.Request) {
	strict(optionalBody(w, r))
	a.limit(r, "search-submission", 5, searchSubmissionWindow, false)
	ctx := r.Context()
	origin := a.requireSearchReady(ctx)
	if !a.searchEngineSettings(ctx).yes("enabled") {
		fail(400, "Enable automatic Bing submission first.")
	}
	a.queueSearchSite(ctx, origin)
	a.readSearchEngines(w, r)
}
func (a *App) indexNowKey(w http.ResponseWriter, r *http.Request) {
	settings := a.searchEngineSettings(r.Context())
	if !settings.yes("enabled") || settings.str("key") == "" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(settings.str("key")))
}
