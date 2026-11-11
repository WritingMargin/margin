package blog

import (
	"net/http"
	"strings"
)

const postSummaryFields = "id,title,slug,excerpt,status,tags,cover,coverMode,seo,createdAt,updatedAt,revision,featured,tableOfContents,contentType"
const privatePostFields = postSummaryFields + ",content,recommendations,author,draftUrl,baseRevision,publicationState,warnings"

var postResponseFields = map[string]string{
	"GET /api/posts/{id}/draft":                privatePostFields,
	"PUT /api/posts/{id}/draft":                privatePostFields,
	"POST /api/posts/{id}/draft/publish":       privatePostFields,
	"GET /api/posts":                           postSummaryFields,
	"GET /api/public/posts":                    postSummaryFields,
	"GET /api/posts/{id}":                      privatePostFields,
	"GET /api/public/posts/{slug}":             postSummaryFields + ",content,relatedPosts,reviewedBy",
	"POST /api/posts":                          privatePostFields,
	"PUT /api/posts/{id}":                      privatePostFields,
	"GET /api/posts/search":                    postSummaryFields + ",searchSnippet,searchMatches",
	"GET /api/public/search":                   postSummaryFields + ",searchSnippet,searchMatches",
	"GET /api/posts/{id}/revisions":            "revision,version,savedAt,author,title,status,contentType",
	"GET /api/posts/{id}/revisions/{revision}": privatePostFields + ",version,savedAt,previousRevision",
}

func responseFields(r *http.Request, allowed string) []string {
	values, present := r.URL.Query()["fields"]
	if !present {
		return nil
	}
	if allowed == "" || len(values) != 1 || len(values[0]) > 1000 {
		coded(400, "Use one fields parameter on a supported post endpoint.", "INVALID_FIELDS")
	}
	fields := strings.Split(values[0], ",")
	for i, field := range fields {
		field = strings.TrimSpace(field)
		if field == "" || !strings.Contains(","+allowed+",", ","+field+",") {
			coded(400, "Unknown or empty response field. Allowed fields: "+allowed, "INVALID_FIELDS")
		}
		fields[i] = field
	}
	return fields
}

func (a *App) validateResponseFields(r *http.Request) {
	if _, present := r.URL.Query()["fields"]; present {
		_, pattern := a.mux.Handler(r)
		responseFields(r, postResponseFields[pattern])
	}
}

func selectResponseFields(row Row, fields []string) Row {
	if fields == nil {
		return row
	}
	selected := Row{}
	for _, field := range fields {
		if value, exists := row[field]; exists {
			selected[field] = value
		}
	}
	return selected
}

func (a *App) sendPostResponse(w http.ResponseWriter, r *http.Request, status int, value any) {
	_, pattern := a.mux.Handler(r)
	fields := responseFields(r, postResponseFields[pattern])
	switch data := value.(type) {
	case Row:
		a.preparePostResponse(r, pattern, data)
		value = selectResponseFields(data, fields)
	case []Row:
		rows := make([]Row, 0, len(data))
		for _, row := range data {
			rows = append(rows, selectResponseFields(row, fields))
		}
		value = rows
	}
	send(w, status, value)
}

func (a *App) preparePostResponse(r *http.Request, pattern string, data Row) {
	if data.str("status") == "published" && (pattern == "POST /api/posts" || pattern == "PUT /api/posts/{id}" || pattern == "POST /api/posts/{id}/draft/publish") {
		a.startSimplified(data.str("id"), data.str("revision"))
	}
	if strings.HasPrefix(r.URL.Path, "/api/posts/") || r.URL.Path == "/api/posts" {
		if data.str("id") != "" {
			data["publicationState"] = a.postPublicationState(r, data)
			data["warnings"] = postAuthoringWarnings(data)
		}
	}
	if data.str("status") == "draft" && strings.HasPrefix(r.URL.Path, "/api/posts") {
		data["draftUrl"] = a.draftURL(r, data.str("slug"))
	}
}
