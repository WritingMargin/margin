package blog

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"
)

//go:embed openapi.json
var openAPISpec []byte

//go:embed swagger.html
var swaggerHTML []byte

//go:embed swagger-init.js
var swaggerInit []byte

func (a *App) docsRoutes() {
	a.authoringRoutes()
	a.mux.HandleFunc("GET /openapi.json", a.openAPI)
	a.mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, sitePath("/swagger/"), http.StatusPermanentRedirect)
	})
	a.mux.HandleFunc("GET /swagger/{$}", func(w http.ResponseWriter, r *http.Request) {
		serveDocs(w, r, "index.html", "text/html; charset=utf-8", swaggerHTML)
	})
	a.mux.HandleFunc("GET /swagger/swagger-init.js", func(w http.ResponseWriter, r *http.Request) {
		serveDocs(w, r, "swagger-init.js", "text/javascript; charset=utf-8", swaggerInit)
	})
	a.mux.HandleFunc("GET /swagger/{asset}", a.swaggerAsset)
}

func serveDocs(w http.ResponseWriter, r *http.Request, name, contentType string, data []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

func (a *App) openAPI(w http.ResponseWriter, r *http.Request) {
	var spec Row
	must(json.Unmarshal(openAPISpec, &spec))
	base := BasePath()
	if base == "" {
		base = "/"
	}
	spec["servers"] = []Row{{"url": base}}
	spec["externalDocs"] = Row{"description": "Margin content authoring guide for LLMs", "url": sitePath("/authoring.md")}
	data, err := json.Marshal(spec)
	must(err)
	serveDocs(w, r, "openapi.json", "application/json", data)
}

func (a *App) swaggerAsset(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("asset")
	contentTypes := map[string]string{"swagger-ui-bundle.js": "text/javascript; charset=utf-8", "swagger-ui.css": "text/css; charset=utf-8", "LICENSE": "text/plain; charset=utf-8"}
	contentType, ok := contentTypes[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if a.Web == nil {
		http.Error(w, "Swagger UI assets unavailable; run npm run build:web.", 503)
		return
	}
	data, err := fs.ReadFile(a.Web, "swagger-ui/"+name)
	if err != nil {
		http.Error(w, "Swagger UI assets unavailable; run npm run build:web.", 503)
		return
	}
	serveDocs(w, r, name, contentType, data)
}
