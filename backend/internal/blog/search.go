package blog

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"
)

var searchHTMLTags = regexp.MustCompile(`<[^>]*>`)

func (a *App) searchDocument(ctx context.Context, row Row) searchDocument {
	content, err := a.Storage.Get(ctx, row.str("content_key"))
	if err != nil {
		fail(503, "Search is temporarily unavailable because some content could not be loaded. Please try again.")
	}
	return searchDocument{text: searchBodyText(string(content))}
}
func buildSearchDocument(row Row, text string) searchDocument {
	d := searchDocument{text: text, terms: map[string]float64{}, title: strings.Join(searchWords(row.str("title")), " "), excerpt: strings.Join(searchWords(row.str("excerpt")), " ")}
	fields := []struct {
		text   string
		weight float64
	}{{text, 1}, {row.str("excerpt"), 4}, {row.str("slug"), 5}, {strings.Join(rssTags(row["tags"]), " "), 8}, {row.str("title"), 12}}
	for _, field := range fields {
		for _, word := range searchWords(field.text) {
			d.terms[word] = max(d.terms[word], field.weight)
		}
	}
	return d
}
func searchQuery(r *http.Request) []string {
	raw := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(raw) > 200 {
		fail(400, "Search must be 200 characters or fewer.")
	}
	words := searchWords(raw)
	if len(words) > 12 {
		fail(400, "Search using up to 12 words.")
	}
	unique := []string{}
	seen := map[string]bool{}
	for _, word := range words {
		if utf8.RuneCountInString(word) > 64 {
			fail(400, "Search words must be 64 characters or fewer.")
		}
		if !seen[word] {
			unique = append(unique, word)
			seen[word] = true
		}
	}
	return unique
}

// @Summary Search published posts
// @ID publicSearch
// @Description Searches published content only. Empty query returns an empty array.
// @Tags Public posts
// @Produce json
// @Param status query string false "Both values return published posts only" Enums(published,all) default(published)
// @Param q query string false "Search query; at most 12 terms of 64 characters each" maxLength(200)
// @Success 200 {array} APISearchPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Router /api/public/search [get]
func (a *App) publicSearch(w http.ResponseWriter, r *http.Request) { a.searchPosts(w, r, true) }

// @Summary Search posts
// @ID privateSearch
// @Description Searches titles, slugs, excerpts, tags and content. Empty query returns an empty array.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param status query string false "Filter by lifecycle status" Enums(draft,published,archived,all) default(all)
// @Param q query string false "Search query; at most 12 terms of 64 characters each" maxLength(200)
// @Success 200 {array} APISearchPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Router /api/posts/search [get]
func (a *App) privateSearch(w http.ResponseWriter, r *http.Request) { a.searchPosts(w, r, false) }

func (a *App) searchPosts(w http.ResponseWriter, r *http.Request, public bool) {
	status := requestedPostStatus(r, public)
	a.sendPostResponse(w, r, 200, a.searchResults(r, public, status, searchQuery(r)))
}
func (a *App) searchResults(r *http.Request, public bool, status string, terms []string) []Row {
	return a.searchResultsPage(r, public, status, terms, nil, false, false, 0, 0)
}

// Check again after storage reads so an unpublished/deleted/edited post cannot
// leak a stale body snippet from a concurrent search.
func (a *App) searchHitCurrent(ctx context.Context, row Row, public bool) bool {
	query := "SELECT id FROM posts WHERE id=$1 AND revision=$2"
	if public {
		query += " AND status='published'"
	}
	return len(a.DB.Must(ctx, query, row["id"], row["revision"])) != 0
}
