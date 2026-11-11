package blog

import (
	"context"
	"net/http"
)

func (a *App) designRoutes() {
	a.mux.HandleFunc("GET /api/settings/design", a.readBlogDesign)
	a.mux.HandleFunc("PUT /api/settings/design", a.updateBlogDesign)
	a.mux.HandleFunc("POST /api/settings/design/validate", a.validateBlogDesign)
}

func (a *App) currentBlogDesign(ctx context.Context) (Row, string) {
	row := first(a.DB.Must(ctx, "SELECT theme, CAST(theme AS TEXT) AS raw FROM settings WHERE id=1"))
	return parseTheme(row["theme"]), row.str("raw")
}
func blogDesignResult(theme Row, raw string) Row {
	return Row{"revision": hash(raw), "design": theme}
}

// @Summary Read the blog design
// @ID getBlogDesign
// @Description Owner only. Returns the current design JSON and revision. Homepage, article, guide, comments, publication branding and footer are independent fields. Read the native MCP resources margin://design/guide and margin://design/schema before editing. This uses the storage/API JSON format, not the grouped editor export format. Does not fetch the central template catalog.
// @Tags Design
// @Security BearerAuth
// @Produce json
// @Success 200 {object} APIBlogDesign
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Router /api/settings/design [get]
func (a *App) readBlogDesign(w http.ResponseWriter, r *http.Request) {
	theme, raw := a.currentBlogDesign(r.Context())
	send(w, 200, blogDesignResult(theme, raw))
}

// @Summary Update selected blog design fields
// @ID updateBlogDesign
// @Description Owner only. Applies changes as a JSON merge patch: omitted fields stay unchanged, nested objects merge, arrays replace in full, and null removes an optional override. Requires the revision from getBlogDesign. The complete merged design is validated before an atomic save; a concurrent editor/API change returns 409. Saves affect the live blog immediately. Use validateBlogDesign first to check without saving; it is not a visual preview. No central template fetch occurs.
// @Tags Design
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APIUpdateBlogDesign true "Revision and partial design changes"
// @Success 200 {object} APIBlogDesign
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 409 {object} APIError
// @Failure 428 {object} APIError
// @Router /api/settings/design [put]
func (a *App) updateBlogDesign(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "revision", "changes")
	if _, ok := input["revision"]; !ok {
		coded(428, "Read the current design and supply its revision.", "REVISION_REQUIRED")
	}
	revision := stringField(input, "revision", 1, 64, false)
	theme, raw := a.currentBlogDesign(r.Context())
	if revision != hash(raw) {
		designConflict()
	}
	merged := validTheme(mergeDesignPatch(theme, objectField(input, "changes")))
	var rows []Row
	if raw == "" {
		rows = a.DB.Must(r.Context(), "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO NOTHING RETURNING theme, CAST(theme AS TEXT) AS raw", encode(merged))
	} else {
		rows = a.DB.Must(r.Context(), "UPDATE settings SET theme=$1 WHERE id=1 AND CAST(theme AS TEXT)=$2 RETURNING theme, CAST(theme AS TEXT) AS raw", encode(merged), raw)
	}
	if len(rows) == 0 {
		designConflict()
	}
	send(w, 200, blogDesignResult(merged, rows[0].str("raw")))
}
func designConflict() {
	coded(409, "The blog design changed. Read it again and reconcile your changes.", "REVISION_CONFLICT")
}

// @Summary Validate blog design changes without saving
// @ID validateBlogDesign
// @Description Owner only. Merges partial changes with the current saved design and validates the complete result, including hero bindings and section rules. Returns the candidate design and current saved revision. Does not save, render a visual preview, fetch central templates, or change the live blog. Arrays replace in full; null removes an optional override. Use the returned revision when saving the same changes.
// @Tags Design
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APIValidateBlogDesign true "Partial design changes"
// @Success 200 {object} APIBlogDesign
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Router /api/settings/design/validate [post]
func (a *App) validateBlogDesign(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "changes")
	theme, raw := a.currentBlogDesign(r.Context())
	merged := validTheme(mergeDesignPatch(theme, objectField(input, "changes")))
	send(w, 200, blogDesignResult(merged, raw))
}

// RFC 7396 object merge semantics. Validation below this layer rejects removal
// of required fields and unknown keys. Arrays intentionally replace as a unit.
func mergeDesignPatch(current, changes Row) Row {
	for key, value := range changes {
		if value == nil {
			delete(current, key)
			continue
		}
		if nested, ok := value.(map[string]any); ok {
			previous, _ := current[key].(map[string]any)
			if previous == nil {
				previous = map[string]any{}
			}
			current[key] = map[string]any(mergeDesignPatch(Row(previous), Row(nested)))
		} else {
			current[key] = value
		}
	}
	return current
}

type APIBlogDesign struct {
	Revision string                 `json:"revision" binding:"required"`
	Design   map[string]interface{} `json:"design" binding:"required"`
}
type APIUpdateBlogDesign struct {
	Revision string                 `json:"revision" binding:"required" minLength:"1" maxLength:"64"`
	Changes  map[string]interface{} `json:"changes" binding:"required"`
}
type APIValidateBlogDesign struct {
	Changes map[string]interface{} `json:"changes" binding:"required"`
}
