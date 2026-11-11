package blog

import "net/http"

// Public discovery contains presentation metadata only. URLs are mount-relative:
// the app keeps the HTTPS address the reader chose, including reverse-proxy paths.
func (a *App) publicApp(w http.ResponseWriter, r *http.Request) {
	theme := a.settings(r.Context())
	send(w, 200, Row{
		"application": "margin", "protocolVersion": 1,
		"name": theme.str("name"), "description": theme.str("description"),
		"logo": mediaPath(theme.str("logo")), "accent": theme.str("accent"),
		"homePath": sitePath("/"), "adminPath": sitePath("/admin"),
	})
}
