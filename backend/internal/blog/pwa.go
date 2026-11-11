package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

func defaultPWA() Row {
	return Row{"showInstallButton": false, "name": "", "shortName": "", "icon": "", "themeColor": "", "backgroundColor": "", "startPage": "blog"}
}

func validPWA(input Row) Row {
	strict(input, "showInstallButton", "name", "shortName", "icon", "themeColor", "backgroundColor", "startPage")
	// Existing saved configurations predate the optional install button.
	if _, exists := input["showInstallButton"]; !exists {
		input["showInstallButton"] = false
	}
	result := Row{
		"showInstallButton": booleanField(input, "showInstallButton"),
		"name":              stringField(input, "name", 0, 120, true),
		"shortName":         stringField(input, "shortName", 0, 30, true),
		"icon":              stringField(input, "icon", 0, 2048, true),
		"startPage":         enumField(input, "startPage", "blog", "workspace"),
	}
	if icon := result.str("icon"); icon != "" && !logoRE.MatchString(icon) {
		fail(400, "Upload an app icon, or leave it blank to use your blog logo.")
	}
	for _, key := range []string{"themeColor", "backgroundColor"} {
		value := stringField(input, key, 0, 7, true)
		if value != "" && !hexColor.MatchString(value) {
			fail(400, key+": use a six-digit hex color or leave blank.")
		}
		result[key] = value
	}
	return result
}

func (a *App) pwaSettings(ctx context.Context) Row {
	return a.siteSetting(ctx, "pwa", defaultPWA(), validPWA)
}
func (a *App) pwaRoutes() {
	a.mux.HandleFunc("GET /manifest.webmanifest", a.pwaManifest)
	a.mux.HandleFunc("GET /pwa/icon/{size}", a.pwaIcon)
	a.mux.HandleFunc("GET /api/settings/pwa", func(w http.ResponseWriter, r *http.Request) {
		send(w, 200, a.pwaSettings(r.Context()))
	})
	a.mux.HandleFunc("PUT /api/settings/pwa", a.savePWA)
	a.mux.HandleFunc("POST /api/settings/pwa/icon", a.uploadPWAIcon)
}
func (a *App) savePWA(w http.ResponseWriter, r *http.Request) {
	settings := validPWA(body(w, r))
	if icon := settings.str("icon"); icon != "" {
		data, err := a.pwaLogoData(r.Context(), icon)
		if err != nil {
			fail(400, "The uploaded app icon is unavailable. Upload it again.")
		}
		if _, err := decodePWAImage(data); err != nil {
			fail(400, "Choose a valid PNG, JPEG, WebP, or GIF icon up to 16 megapixels.")
		}
	}
	a.saveSiteSetting(r.Context(), "pwa", settings)
	send(w, 200, settings)
}

// Identity is the installation's origin and mount, independent of branding or launch preference.
func effectivePWA(theme, settings Row) Row {
	result := Row{"name": theme.str("name"), "shortName": theme.str("name"), "icon": theme.str("logo"),
		"themeColor": theme.str("accent"), "backgroundColor": theme.str("background"), "startUrl": sitePath("/")}
	for _, key := range []string{"name", "icon", "themeColor", "backgroundColor"} {
		if value := settings.str(key); value != "" {
			result[key] = value
		}
	}
	result["shortName"] = result["name"]
	if value := settings.str("shortName"); value != "" {
		result["shortName"] = value
	}
	if settings.str("startPage") == "workspace" {
		result["startUrl"] = sitePath("/admin")
	}
	return result
}
func pwaIconVersion(brand Row) string {
	// Refresh manifests that previously generated a fallback for an SVG logo.
	return hash("svg-v2|" + brand.str("icon") + "|" + brand.str("themeColor") + "|" + brand.str("backgroundColor"))[:16]
}
func (a *App) pwaManifest(w http.ResponseWriter, r *http.Request) {
	theme := a.settings(r.Context())
	brand := effectivePWA(theme, a.pwaSettings(r.Context()))
	icons := []Row{}
	for _, size := range []int{192, 512} {
		dimension := strconv.Itoa(size)
		icons = append(icons, Row{"src": sitePath("/pwa/icon/"+dimension+".png") + "?v=" + pwaIconVersion(brand),
			"sizes": dimension + "x" + dimension, "type": "image/png", "purpose": "any maskable"})
	}
	// Browsers can render a remotely hosted SVG directly; raster icons remain a fallback.
	if icon := brand.str("icon"); strings.HasSuffix(strings.ToLower(strings.Split(icon, "?")[0]), ".svg") && strings.HasPrefix(icon, "https://") {
		icons = append(icons, Row{"src": icon, "sizes": "any", "type": "image/svg+xml", "purpose": "any"})
	}
	manifest := Row{"id": sitePath("/"), "name": brand["name"], "short_name": brand["shortName"],
		"description": theme.str("description"), "start_url": brand["startUrl"], "scope": sitePath("/"),
		"display": "standalone", "theme_color": brand["themeColor"], "background_color": brand["backgroundColor"],
		"icons": icons, "prefer_related_applications": false}
	w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if r.Method != "HEAD" {
		must(json.NewEncoder(w).Encode(manifest))
	}
}
