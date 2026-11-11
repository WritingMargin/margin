package blog

import (
	"bytes"
	_ "embed"
	"html/template"
	"net/http"
	"strings"
)

// Server errors are complete documents: they never depend on the frontend build.
//
//go:embed error_page.html
var errorPageSource string
var errorPageTemplate = template.Must(template.New("error").Parse(errorPageSource))

type errorPage struct {
	Title, Heading, Message, Home, SignIn string
	Logo                                  template.HTML
	Status                                int
	Retry                                 bool
}

func (a *App) publicError(w http.ResponseWriter, r *http.Request, status int) {
	page := errorPage{
		Title: http.StatusText(status), Heading: "We’ll be right back.",
		Message: "This page is taking a moment. Please try again shortly.",
		Home:    sitePath("/"), Status: status, Retry: status >= 500,
		Logo: template.HTML(marginLogo), // #nosec G203 -- SVG is a trusted static asset embedded in the binary.
	}
	if status == http.StatusNotFound {
		page.Heading = "This page could not be found."
		page.Message = "The story may have moved or is no longer published."
	} else if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/admin/") {
		page.Heading = "Your workspace is taking a moment."
		page.Message = "We couldn’t load your workspace. Please try again shortly."
	}
	if status == http.StatusUnauthorized && strings.HasPrefix(r.URL.Path, "/draft/") {
		page.Heading = "Sign in to preview this draft."
		page.Message = "Draft previews are available only to the signed-in admin."
		page.SignIn = sitePath("/admin")
	}
	var output bytes.Buffer
	must(errorPageTemplate.Execute(&output, page))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	if page.Retry {
		w.Header().Set("Retry-After", "5")
	}
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(output.Bytes())
	}
}
