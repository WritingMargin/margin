package blog

import "net/http"

// @Summary Read publication SEO settings
// @ID getSiteSEO
// @Description Read publication-wide search title, description, sharing image, indexing preference and Google verification token. Per-post SEO is returned by readPost. Requires an owner token.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Success 200 {object} APISiteSEO
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Owner role required"
// @Router /api/settings/seo [get]
func (a *App) readSiteSEO(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.seoSettings(r.Context()))
}

// @Summary Update publication SEO settings
// @ID updateSiteSEO
// @Description Replace all publication-wide SEO settings. Read getSiteSEO first and preserve unchanged fields. Empty title and description use publication defaults; empty image clears the sharing-image override. Image accepts an uploaded URL or a public HTTPS URL without credentials. indexing=false disables search indexing. Saving googleVerification exposes the verification token but does not verify ownership with Google. Requires an owner token; use updatePost for per-post SEO.
// @Tags SEO
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APISiteSEO true "Complete publication SEO settings"
// @Success 200 {object} APISiteSEO
// @Failure 400 {object} APIError "Invalid or missing SEO field"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Owner role required"
// @Router /api/settings/seo [put]
func (a *App) updateSiteSEO(w http.ResponseWriter, r *http.Request) {
	seo := validSEO(body(w, r))
	a.saveSiteSetting(r.Context(), "seo", seo)
	send(w, 200, seo)
}
