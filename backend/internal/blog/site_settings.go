package blog

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var domainHostRE = regexp.MustCompile(`^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
var verificationRE = regexp.MustCompile(`^[A-Za-z0-9_-]*$`)

func defaultSEO() Row {
	return Row{"title": "", "description": "", "image": "", "indexing": true, "googleVerification": ""}
}
func (a *App) siteSettingsRoutes() {
	a.designRoutes()
	a.mux.HandleFunc("GET /api/settings/profile", a.readAuthorProfile)
	a.mux.HandleFunc("PUT /api/settings/profile", a.saveAuthorProfile)
	a.mediaDefaultsRoutes()
	a.searchEngineRoutes()
	a.publishingRoutes()
	a.mux.HandleFunc("POST /api/settings/deployment", a.deploymentConfig)
	a.mux.HandleFunc("GET /api/settings/publication", a.readPublication)
	a.mux.HandleFunc("PUT /api/settings/publication", a.savePublication)
	a.mux.HandleFunc("GET /api/settings/domain", a.readDomain)
	a.mux.HandleFunc("PUT /api/settings/domain", a.saveDomain)
	a.mux.HandleFunc("GET /api/settings/seo", a.readSiteSEO)
	a.mux.HandleFunc("PUT /api/settings/seo", a.updateSiteSEO)
}
func (a *App) siteSetting(ctx context.Context, name string, initial Row, validate func(Row) Row) Row {
	row := first(a.DB.Must(ctx, "SELECT configuration FROM site_settings WHERE name=$1", name))
	if row == nil {
		return initial
	}
	defer func() {
		if recover() != nil {
			fail(500, "Saved "+name+" settings are invalid.")
		}
	}()
	return validate(object(row["configuration"]))
}
func (a *App) saveSiteSetting(ctx context.Context, name string, value Row) {
	a.DB.Must(ctx, "INSERT INTO site_settings(name,configuration) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET configuration=EXCLUDED.configuration", name, encode(value))
}
func (a *App) domainSettings(ctx context.Context) Row {
	return a.siteSetting(ctx, "domain", Row{"url": ""}, validDomain)
}
func (a *App) seoSettings(ctx context.Context) Row {
	return a.siteSetting(ctx, "seo", defaultSEO(), validSEO)
}
func validDomain(input Row) Row {
	strict(input, "url")
	raw := stringField(input, "url", 0, 2048, true)
	if raw == "" {
		return Row{"url": ""}
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || !validDomainURL(u) {
		fail(400, "Enter a domain such as blog.example.com or an HTTPS origin, without a path, credentials, query, or fragment.")
	}
	return Row{"url": "https://" + strings.ToLower(u.Hostname())}
}
func validDomainURL(u *url.URL) bool {
	return u.Scheme == "https" && u.User == nil && u.Port() == "" && validDomainHost(u.Host) &&
		(u.Path == "" || u.Path == "/") && u.RawQuery == "" && !u.ForceQuery && u.Fragment == "" && !strings.Contains(u.String(), "#")
}
func validDomainHost(host string) bool {
	return len(host) <= 253 && domainHostRE.MatchString(strings.ToLower(host))
}
func validSEO(input Row) Row {
	strict(input, "title", "description", "image", "indexing", "googleVerification")
	result := Row{
		"title": stringField(input, "title", 0, 120, true), "description": stringField(input, "description", 0, 320, true),
		"image": seoImageField(input, "image"), "indexing": booleanField(input, "indexing"),
		"googleVerification": stringField(input, "googleVerification", 0, 256, true),
	}
	if !verificationRE.MatchString(result.str("googleVerification")) {
		fail(400, "Enter only the Google verification token, not an HTML tag.")
	}
	return result
}
func seoImageField(input Row, key string) string {
	image := stringField(input, key, 0, 2048, true)
	if image != "" && !coverRE.MatchString(image) {
		u, err := url.Parse(image)
		if err != nil || !rssPublicURL(u) || u.Scheme != "https" {
			fail(400, "Choose an uploaded image or an HTTPS image URL without credentials.")
		}
	}
	return image
}
func (a *App) publicationOrigin(r *http.Request) string {
	if domain := a.domainSettings(r.Context()).str("url"); domain != "" {
		return domain + BasePath()
	}
	return a.origin(r) + BasePath()
}
func (a *App) allowedOrigin(r *http.Request, origin string) bool {
	return origin == a.origin(r) || origin == a.domainSettings(r.Context()).str("url") || additionalOriginAllowed(origin) || publicAliasOriginAllowed(origin)
}
func (a *App) readDomain(w http.ResponseWriter, r *http.Request) {
	result := a.domainSettings(r.Context())
	result["effectiveUrl"] = a.publicationOrigin(r)
	result["serverUrl"] = a.origin(r)
	send(w, 200, result)
}
func (a *App) saveDomain(w http.ResponseWriter, r *http.Request) {
	a.saveSiteSetting(r.Context(), "domain", validDomain(body(w, r)))
	a.readDomain(w, r)
}
func (a *App) indexingHeader(w http.ResponseWriter, r *http.Request) {
	if !a.seoSettings(r.Context()).yes("indexing") {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	}
}
