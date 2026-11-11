package blog

import (
	"net/http"
	"strings"

	"github.com/Usefused/fused-open-core/oauthserver"
)

type oauthPermission struct{ Scope, Name, Description string }

var oauthPermissions = []oauthPermission{
	{"content:read", "Read content", "Read published posts, private drafts, archives, revision history, writing notes, and the image, video, audio and source document libraries."},
	{"content:draft", "Create and edit drafts", "Create new drafts, edit existing drafts, and stage or discard unpublished changes to live posts. Does not allow publishing, changing the live version, or deleting posts."},
	{"content:publish", "Publish and delete content", "Publish, unpublish, change live or archived posts, archive, restore, and permanently delete posts. Draft editing is a separate permission."},
	{"media:write", "Upload media", "Add images, videos, audio and source documents to the publication’s media libraries."},
	{"settings:manage", "Change publication design and SEO", "Read and change publication settings, layouts, branding, templates, and search and sharing metadata."},
	{"administration:manage", "Manage readers and services", "Access reader and subscriber data, moderate conversations, manage email and account settings, view analytics, and use paid AI services. Does not grant content, media upload, design, or credential management access."},
}

func validOAuthPermission(scope string) bool {
	for _, permission := range oauthPermissions {
		if permission.Scope == scope {
			return true
		}
	}
	return false
}
func oauthPermissionNames(scopes []string) []string {
	names := []string{}
	for _, permission := range oauthPermissions {
		if hasOAuthScope(scopes, permission.Scope) {
			names = append(names, permission.Name)
		}
	}
	return names
}
func oauthSupportedScopes() []string {
	scopes := []string{}
	for _, permission := range oauthPermissions {
		scopes = append(scopes, permission.Scope)
	}
	return scopes
}
func hasOAuthScope(scopes []string, scope string) bool {
	for _, candidate := range scopes {
		if candidate == scope {
			return true
		}
	}
	return false
}
func legacyOAuthScopes(role string) []string {
	switch role {
	case "reader":
		return []string{"content:read"}
	case "writer":
		return []string{"content:read", "content:draft", "media:write"}
	case "publisher":
		return []string{"content:read", "content:draft", "content:publish", "media:write"}
	case "owner":
		return oauthSupportedScopes()
	}
	return nil
}
func oauthScope(value string) ([]string, error) {
	scopes := strings.Fields(value)
	if len(scopes) == 0 {
		return []string{"content:read"}, nil
	}
	if len(scopes) == 1 && validTokenRole(scopes[0]) {
		return legacyOAuthScopes(scopes[0]), nil
	}
	seen := map[string]bool{}
	for _, scope := range scopes {
		if !validOAuthPermission(scope) || seen[scope] {
			return nil, oauthserver.ErrInvalidScope
		}
		seen[scope] = true
	}
	result := []string{}
	for _, permission := range oauthPermissions {
		if seen[permission.Scope] {
			result = append(result, permission.Scope)
		}
	}
	return result, nil
}

// Role is only an internal compatibility hint. OAuth authorization always checks
// the individual capabilities before calling a handler.
func oauthScopeRole(scopes []string) string {
	if hasOAuthScope(scopes, "administration:manage") || hasOAuthScope(scopes, "settings:manage") {
		return "owner"
	}
	if hasOAuthScope(scopes, "content:publish") {
		return "publisher"
	}
	if hasOAuthScope(scopes, "content:draft") || hasOAuthScope(scopes, "media:write") {
		return "writer"
	}
	return "reader"
}

var postWriteOAuthPermissions = map[string]string{
	"GET /api/posts/{id}/polls":                          "content:draft",
	"GET /api/posts/{id}/polls/{poll}":                   "content:draft",
	"GET /api/posts/{id}/reviews/notes/{note}/revisions": "content:draft",
	"GET /api/posts/{id}/reviews":                        "content:draft",
	"POST /api/posts/{id}/reviews":                       "content:draft",
	"POST /api/posts/{id}/reviews/notes/{note}/address":  "content:draft",
	"POST /api/posts/{id}/sources":                       "content:draft",
	"POST /api/posts/{id}/writing-notes":                 "content:draft",
	"DELETE /api/posts/{id}":                             "content:publish",
	"PUT /api/posts/{id}/draft":                          "content:draft",
	"DELETE /api/posts/{id}/draft":                       "content:draft",
	"POST /api/posts/{id}/draft/publish":                 "content:publish",
	"POST /api/posts/{id}/polls/{poll}/close":            "content:publish",
	"PUT /api/posts/{id}/simplified":                     "content:draft",
	"GET /api/readers/flags":                             "content:draft",
	"PATCH /api/readers/flags/{id}":                      "content:draft",
	"PUT /api/posts/{id}/author-update":                  "content:publish",
}

// Public file delivery checks its capability separately. These protected library
// and design routes must not fall through to administration:manage either.
var assetOAuthPermissions = map[string]string{
	"GET /api/settings/search-engines/discovery":          "settings:manage",
	"GET /api/settings/publishing/google/history":         "settings:manage",
	"POST /api/settings/publishing/google/performance":    "settings:manage",
	"POST /api/settings/publishing/google/sitemap-status": "settings:manage",
	"GET /api/settings/publishing/google/properties":      "settings:manage",
	"POST /api/settings/publishing/google/submit":         "settings:manage",
	"POST /api/settings/publishing/google/inspect":        "settings:manage",

	"GET /api/media": "content:read", "GET /api/media/documents": "content:read",
	"POST /api/media/documents": "media:write", "POST /api/media/sign": "media:write",
	"POST /api/settings/logo": "settings:manage", "POST /api/settings/pwa/icon": "settings:manage",
	"GET /api/settings/pwa": "settings:manage", "PUT /api/settings/pwa": "settings:manage",
	"GET /api/settings/profile": "settings:manage", "PUT /api/settings/profile": "settings:manage",
	"GET /api/settings/media": "settings:manage", "PUT /api/settings/media": "settings:manage",
	"GET /api/settings/simplified": "settings:manage", "PUT /api/settings/simplified": "settings:manage",
}

func explicitOAuthPermission(pattern string) string {
	if permission := postWriteOAuthPermissions[pattern]; permission != "" {
		return permission
	}
	return assetOAuthPermissions[pattern]
}

func oauthRoutePermission(pattern string) string {
	if permission := explicitOAuthPermission(pattern); permission != "" {
		return permission
	}
	if postReadRoutes[pattern] {
		return "content:read"
	}
	switch pattern {
	case "POST /api/posts", "PUT /api/posts/{id}":
		return "content:write"
	case "POST /api/media/images", "POST /api/media/covers", "POST /api/media/videos", "POST /api/media/audio", "POST /api/media/models", "POST /api/media/preview":
		return "media:write"
	case "GET /api/settings", "PUT /api/settings", "GET /api/settings/templates", "GET /api/settings/design", "PUT /api/settings/design", "POST /api/settings/design/validate", "GET /api/settings/seo", "PUT /api/settings/seo":
		return "settings:manage"
	}
	if strings.Contains(pattern, " /api/tokens") || strings.Contains(pattern, " /api/oauth") {
		return ""
	}
	// The administrative capability retains legacy owner access to the remaining
	// protected routes; the separately selectable content/design groups stay gated.
	if pattern != "" && pattern != "/" {
		return "administration:manage"
	}
	return ""
}
func oauthRouteAllowed(scopes []string, pattern string) bool {
	if pattern == "GET /api/analytics/reaction-map" || pattern == "PATCH /api/comments/{id}/pin" {
		return hasOAuthScope(scopes, "content:draft") || hasOAuthScope(scopes, "content:publish") || hasOAuthScope(scopes, "administration:manage")
	}
	permission := oauthRoutePermission(pattern)
	if permission == "content:write" {
		return hasOAuthScope(scopes, "content:draft") || hasOAuthScope(scopes, "content:publish")
	}
	return permission != "" && hasOAuthScope(scopes, permission)
}
func (a *App) requestOAuthScopes(r *http.Request) ([]string, bool) {
	value := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !strings.HasPrefix(value, "moat_") {
		return nil, false
	}
	principal := a.oauthPrincipal(r, value)
	scopes, _ := principal["scopes"].([]string)
	return scopes, true
}

func normalizedOAuthScopes(scopes []string) []string {
	if len(scopes) == 0 {
		return nil
	}
	result, err := oauthScope(strings.Join(scopes, " "))
	if err != nil {
		return nil
	}
	return result
}
