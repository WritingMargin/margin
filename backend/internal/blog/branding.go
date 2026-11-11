package blog

import (
	_ "embed"
	"net/http"
)

//go:embed margin.svg
var marginLogo []byte

func (a *App) brandingRoutes() {
	a.mux.HandleFunc("GET /api/public/brand.svg", serveMarginLogo)
	a.mux.HandleFunc("GET /favicon.ico", a.favicon)
}

func serveMarginLogo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "no-cache")
	if r.Method != "HEAD" {
		_, _ = w.Write(marginLogo)
	}
}

func (a *App) favicon(w http.ResponseWriter, r *http.Request) {
	// Re-read the saved design on every visit; unsaved uploads stay private.
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, blogIconURL(a.settings(r.Context())), http.StatusFound)
}

func blogIconURL(theme Row) string {
	logo := theme.str("logo")
	if logo == "" {
		logo = "/api/public/brand.svg"
	}
	return mediaPath(logo)
}
