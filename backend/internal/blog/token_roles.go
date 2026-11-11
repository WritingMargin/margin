package blog

import (
	"net/http"
	"strings"
)

// Restricted tokens use an explicit route allowlist. New administrative routes
// require owner access unless deliberately added here.
var postReadRoutes = map[string]bool{
	"GET /api/posts/{id}/research": true,
	"GET /api/posts/{id}/sources":  true,
	"POST /api/posts/audit":        true,
	"GET /api/posts/{id}/preview":  true,
	"GET /api/posts/{id}/draft":    true,
	"GET /api/posts/{id}/link":     true,
	"GET /api/media/images":        true, "GET /api/media/videos": true, "GET /api/media/audio": true,
	"GET /api/posts/{id}/events": true,
	"GET /api/posts":             true, "GET /api/posts/page": true, "GET /api/posts/{id}": true,
	"GET /api/posts/search": true, "GET /api/posts/{id}/revisions": true,
	"GET /api/posts/{id}/revisions/{revision}": true,
	"GET /api/posts/{id}/recommendations":      true,
	"GET /api/posts/{id}/writing-notes":        true,
	"GET /api/posts/{id}/simplified":           true,
	"GET /api/posts/{id}/simplified/history":   true,
	"GET /api/posts/{id}/author-update":        true,
	"GET /api/recommendations":                 true,
}

func validTokenRole(role string) bool {
	switch role {
	case "reader", "writer", "publisher", "owner":
		return true
	}
	return false
}

func (a *App) requestRole(r *http.Request) string {
	if value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		if strings.HasPrefix(value, "moat_") {
			return a.oauthPrincipal(r, value).str("role")
		}
		row := first(a.DB.Must(r.Context(), "SELECT role FROM api_tokens WHERE token_hash=$1", hash(value)))
		return row.str("role")
	}
	if a.authenticated(r) {
		return "owner"
	}
	return ""
}

func tokenRouteAllowed(role, pattern string) bool {
	if !validTokenRole(role) {
		return false
	}
	if role == "owner" || postReadRoutes[pattern] {
		return true
	}
	switch pattern {
	case "GET /api/posts/{id}/reviews/notes/{note}/revisions", "GET /api/posts/{id}/reviews", "POST /api/posts/{id}/reviews", "POST /api/posts/{id}/reviews/notes/{note}/address", "POST /api/posts/{id}/sources", "POST /api/posts/{id}/writing-notes", "GET /api/analytics/reaction-map", "GET /api/posts/{id}/polls", "GET /api/posts/{id}/polls/{poll}", "GET /api/readers/flags", "PATCH /api/readers/flags/{id}":
		return role == "writer" || role == "publisher"
	case "PUT /api/posts/{id}/draft", "DELETE /api/posts/{id}/draft", "PUT /api/posts/{id}/simplified", "POST /api/posts", "PUT /api/posts/{id}", "POST /api/media/images", "POST /api/media/covers", "POST /api/media/videos", "POST /api/media/audio", "POST /api/media/models", "POST /api/media/preview":
		return role == "writer" || role == "publisher"
	case "POST /api/posts/{id}/draft/publish", "DELETE /api/posts/{id}", "POST /api/posts/{id}/polls/{poll}/close", "PUT /api/posts/{id}/author-update":
		return role == "publisher"
	}
	return false
}

func (a *App) authorizeToken(r *http.Request) {
	_, pattern := a.mux.Handler(r)
	if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer moat_") && (strings.HasPrefix(r.URL.Path, "/api/tokens") || strings.HasPrefix(r.URL.Path, "/api/oauth")) {
		coded(403, "Use an owner browser session to manage credentials.", "PERMISSION_DENIED")
	}
	if scopes, oauth := a.requestOAuthScopes(r); oauth {
		if !oauthRouteAllowed(scopes, pattern) {
			coded(403, "This connection does not have permission for this operation.", "PERMISSION_DENIED")
		}
		return
	}
	// A restricted CLI connection must still be able to log itself out.
	if pattern == "DELETE /api/tokens/{id}" && selfTokenRevocation(r) {
		return
	}
	if !tokenRouteAllowed(a.requestRole(r), pattern) {
		coded(403, "This token's role does not permit this operation.", "PERMISSION_DENIED")
	}
}

func selfTokenRevocation(r *http.Request) bool {
	value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return ok && r.URL.Path == "/api/tokens/"+hash(value)
}

// A writer cannot change live content, including by unpublishing it first.
// Updates also match the reviewed revision in SQL, protecting this status check
// from a concurrent publish between reading the post and committing the edit.
func (a *App) authorizePostWrite(r *http.Request, input, previous Row) {
	if scopes, oauth := a.requestOAuthScopes(r); oauth {
		if !nonDraftStatus(input) && !nonDraftStatus(previous) {
			if hasOAuthScope(scopes, "content:draft") {
				return
			}
		} else if hasOAuthScope(scopes, "content:publish") {
			return
		}
		coded(403, "This connection cannot publish or change non-draft content.", "PERMISSION_DENIED")
	}
	switch a.requestRole(r) {
	case "owner", "publisher":
		return
	case "writer":
		if !nonDraftStatus(input) && !nonDraftStatus(previous) {
			return
		}
	}
	coded(403, "This token cannot change this post. Publishing, archiving, or changing a non-draft post requires the publisher role.", "PERMISSION_DENIED")
}

func nonDraftStatus(row Row) bool {
	return row.str("status") != "" && row.str("status") != "draft"
}

func tokenRole(input Row, fallback string) string {
	if _, exists := input["role"]; !exists {
		return fallback
	}
	return enumField(input, "role", "reader", "writer", "publisher", "owner")
}

// @Summary Change a token role
// @ID updateToken
// @Description Requires an owner token. Changes take effect immediately.
// @Tags Tokens
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Accept json
// @Param input body APIUpdateToken true "Request body"
// @Success 200 {object} APIToken
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Router /api/tokens/{id} [patch]
func (a *App) updateToken(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "role")
	requireFields(input, "role")
	role := tokenRole(input, "reader")
	row := first(a.DB.Must(r.Context(), "UPDATE api_tokens SET role=$1 WHERE token_hash=$2 RETURNING token_hash,name,role,created_at", role, r.PathValue("id")))
	if row == nil {
		fail(404, "Token not found.")
	}
	send(w, 200, tokenInfo(row))
}

func tokenInfo(row Row) Row {
	return Row{"id": row["token_hash"], "name": row["name"], "role": row["role"], "createdAt": row["created_at"]}
}
