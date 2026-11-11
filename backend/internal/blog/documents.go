package blog

import (
	"bytes"
	"context"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"slices"
	"time"
)

func (a *App) documentRoutes() {
	a.mux.HandleFunc("GET /api/media/documents", a.listDocuments)
	a.mux.HandleFunc("POST /api/media/documents", a.uploadDocument)
	a.mux.HandleFunc("GET /api/public/documents/{id}", a.readDocument)
	a.mux.HandleFunc("GET /sources/{id}", a.documentViewer)
}
func (a *App) listDocuments(w http.ResponseWriter, r *http.Request) {
	rows := a.DB.Must(r.Context(), "SELECT id,title,created_at FROM source_documents ORDER BY created_at DESC,id DESC")
	result := []Row{}
	for _, row := range rows {
		row["url"] = "/api/public/documents/" + row.str("id")
		result = append(result, row)
	}
	send(w, 200, result)
}
func (a *App) uploadDocument(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Content-Type") != "application/pdf" {
		fail(400, "Choose a PDF document up to 20 MB.")
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 20<<20))
	if err != nil {
		fail(413, "PDF documents must be no larger than 20 MB.")
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.Contains(data[max(0, len(data)-1024):], []byte("%%EOF")) {
		fail(400, "The file is not a valid PDF document.")
	}
	title := r.URL.Query().Get("title")
	if title == "" || len(title) > 250 {
		fail(400, "A document title of up to 250 characters is required.")
	}
	id := uuid()
	key := "sources/" + id + ".pdf"
	must(a.Storage.Put(r.Context(), key, data))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(r.Context()), key)
		}
	}()
	a.DB.Must(r.Context(), "INSERT INTO source_documents(id,object_key,title) VALUES($1,$2,$3)", id, key, title)
	saved = true
	send(w, 201, Row{"id": id, "title": title, "url": "/api/public/documents/" + id})
}
func (a *App) documentPublished(ctx context.Context, id string) bool {
	documents := "jsonb_array_elements_text(p.citation_documents) AS document(value)"
	if a.DB.Kind == "sqlite" {
		documents = "json_each(p.citation_documents) AS document"
	}
	query := "SELECT 1 FROM posts p WHERE p.status='published' AND EXISTS (SELECT 1 FROM " + documents + " WHERE document.value=$1) LIMIT 1"
	return len(a.DB.Must(ctx, query, id)) > 0
}
func (a *App) sourceDocument(r *http.Request) Row {
	id := r.PathValue("id")
	if !uuidRE.MatchString(id) || (!a.privateMediaAllowed(r, "content:read") && !a.documentPublished(r.Context(), id) && !a.peerDocumentAllowed(r, id)) {
		fail(404, "Source document not found.")
	}
	row := first(a.DB.Must(r.Context(), "SELECT * FROM source_documents WHERE id=$1", id))
	if row == nil {
		fail(404, "Source document not found.")
	}
	return row
}
func (a *App) readDocument(w http.ResponseWriter, r *http.Request) {
	row := a.sourceDocument(r)
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.sourceDocument(r)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="source.pdf"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	http.ServeContent(w, r, "source.pdf", time.Time{}, bytes.NewReader(data))
}

var documentTemplate = template.Must(template.New("source").Parse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>{{.Title}} — Source</title>{{range .Styles}}<link rel="stylesheet" href="{{.}}">{{end}}</head><body><div id="source-root" data-url="{{.URL}}" data-title="{{.Title}}"><h1>{{.Title}}</h1><a href="{{.URL}}">Open PDF document</a></div><script type="module" nonce="{{.Nonce}}" src="{{.Script}}"></script></body></html>`))

func (a *App) documentViewer(w http.ResponseWriter, r *http.Request) {
	row := a.sourceDocument(r)
	script, styles, _ := a.entryAssets("src/citations/pdf-entry.tsx")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	address := sitePath("/api/public/documents/" + row.str("id"))
	if invite := r.URL.Query().Get("review"); invite != "" {
		address += "?review=" + url.QueryEscape(invite)
		setDraftPreviewHeaders(w)
	}
	must(documentTemplate.Execute(w, Row{"Title": row["title"], "URL": address, "Nonce": pageNonce(w), "Script": script, "Styles": styles}))
}

func (a *App) peerDocumentAllowed(r *http.Request, id string) bool {
	invite := r.URL.Query().Get("review")
	if len(invite) != 43 {
		return false
	}
	row, draft := a.peerMediaGrant(r, invite)
	if row == nil {
		return false
	}
	item := a.postContent(r.Context(), row)
	a.recheckDraftPreview(r, row, draft)
	return slices.Contains(citationDocumentIDs(item.str("content")), id)
}
