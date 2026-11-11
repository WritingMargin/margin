package blog

import (
	"net/http"
	"strings"
	"unicode/utf8"
)

// APIArticleAuditInput accepts the editor's unsaved article or an existing post ID.
// Public mode always reads the stored live version and derives its URL on the server.
type APIArticleAuditInput struct {
	Mode    string         `json:"mode" enums:"draft,public"`
	Intent  string         `json:"intent" enums:"index,hidden"`
	ID      string         `json:"id,omitempty"`
	Article *APIAuditDraft `json:"article,omitempty"`
}
type APIAuditDraft struct {
	Title   string  `json:"title"`
	Slug    string  `json:"slug"`
	Content string  `json:"content"`
	Excerpt string  `json:"excerpt,omitempty"`
	Cover   string  `json:"cover,omitempty"`
	SEO     *APISEO `json:"seo,omitempty"`
}
type auditFinding struct {
	Code     string `json:"code"`
	Severity string `json:"severity" enums:"error,warning,suggestion,unavailable"`
	Field    string `json:"field"`
	Message  string `json:"message"`
	Why      string `json:"why"`
	Fix      string `json:"fix"`
	Passage  string `json:"passage,omitempty"`
}
type articleAuditReport struct {
	Mode     string         `json:"mode"`
	Intent   string         `json:"intent"`
	URL      string         `json:"url,omitempty"`
	Findings []auditFinding `json:"findings"`
}

func (r *articleAuditReport) add(code, severity, field, message, why, fix string) {
	r.Findings = append(r.Findings, auditFinding{Code: code, Severity: severity, Field: field, Message: message, Why: why, Fix: fix})
}

// @Summary Audit an article before or after publishing
// @ID auditArticle
// @Description Use mode=draft with article (unsaved fields) or id (saved fields). Use mode=public with a published post ID to fetch its actual canonical URL without credentials and compare the HTML, social metadata and structured data to saved settings. Intent defaults to index unless the article explicitly requests noindex. An unavailable finding means the check could not be measured. This read-only operation never submits or publishes content.
// @Tags Posts
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APIArticleAuditInput true "Article and indexing intent"
// @Success 200 {object} articleAuditReport
// @Router /api/posts/audit [post]
func (a *App) auditArticle(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "mode", "intent", "id", "article")
	mode := lookString(input, "mode", "draft")
	if mode != "draft" && mode != "public" {
		fail(400, "mode: use draft or public")
	}
	item := a.auditArticleInput(r, input, mode)
	report := articleAuditReport{Mode: mode, Intent: auditIntent(input, item), Findings: []auditFinding{}}
	theme := a.settings(r.Context())
	theme["seo"] = a.seoSettings(r.Context())
	theme["authorProfile"] = a.publicAuthorProfile(r.Context())
	theme = themeForContent(theme, item.str("contentType"))
	report.checkDraft(item, theme)
	report.Findings = append(report.Findings, sectionReviewSuggestions(item.str("content"))...)
	if origin := a.searchOrigin(r.Context()); origin != "" && slugRE.MatchString(item.str("slug")) {
		report.URL = readableLinks(item, origin).str("canonical")
	}
	if mode == "public" {
		report.checkPublic(r.Context(), item, theme)
	}
	send(w, 200, report)
}
func (a *App) auditArticleInput(r *http.Request, input Row, mode string) Row {
	if raw, ok := input["article"]; ok {
		if mode != "draft" {
			fail(400, "Public verification uses the saved article ID.")
		}
		item := object(raw)
		strict(item, "title", "slug", "content", "excerpt", "cover", "seo")
		return item
	}
	id := stringField(input, "id", 1, 128, true)
	row := a.getPost(r.Context(), id)
	if mode == "public" && row.str("status") != "published" {
		fail(409, "Publish the article before checking its public URL.")
	}
	return a.postContent(r.Context(), row)
}
func auditIntent(input, item Row) string {
	if _, ok := input["intent"]; ok {
		return enumField(input, "intent", "index", "hidden")
	}
	if object(item["seo"]).yes("noindex") {
		return "hidden"
	}
	return "index"
}
func (r *articleAuditReport) checkDraft(item, theme Row) {
	title := strings.TrimSpace(item.str("title"))
	if title == "" || utf8.RuneCountInString(title) > 240 {
		r.add("article.title", "error", "title", "The article title is missing or too long.", "Margin requires a title before publishing.", "Enter a descriptive article title within the publication limit.")
	}
	if !slugRE.MatchString(item.str("slug")) || len(item.str("slug")) > 180 {
		r.add("article.slug", "error", "slug", "The URL slug is invalid.", "Margin cannot publish this article at that path.", "Use lowercase letters and numbers separated by single hyphens.")
	}
	profile := object(theme["authorProfile"])
	if profile.str("name") == "" {
		r.add("author.name", "warning", "authorProfile.name", "The public author name is empty.", "Readers and article metadata will have no attribution.", "Set the credited name in Profile → Public profile.")
	} else if profile.str("website") == "" {
		r.add("author.website", "warning", "authorProfile.website", "The byline has no profile link.", "A profile URL helps readers and search engines identify the author.", "Add the author’s public HTTPS website in Profile → Public profile.")
	}
	if postShareImage(item, object(theme["seo"])) == "" {
		r.add("article.image", "warning", "seo.image", "No representative image is configured.", "Shared links and article metadata will lack an image.", "Choose a sharing image in Post details → SEO & sharing, an image cover, or a publication default.")
	}
	hidden := strings.Contains(postRobots(object(theme["seo"]), item), "noindex")
	if hidden != (r.Intent == "hidden") {
		r.add("article.index_intent", "warning", "seo.noindex", "The configured search visibility differs from the intended audience.", "Search engines follow the robots directive on the public page.", "Check article visibility in SEO & sharing and blog-wide indexing in Blog SEO.")
	}
	if postSearchDescription(item, item.str("content")) == "" {
		r.add("article.description", "suggestion", "seo.description", "The search description is empty.", "A short summary helps readers decide whether to open the article.", "Add an excerpt or a description explaining the question the article answers.")
	}
}
