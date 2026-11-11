package blog

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// @Summary List or search a page of posts
// @ID workspacePostsPage
// @Description Returns bounded post summaries, ordered by last edit or search relevance. Out-of-range pages clamp to the last page.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param page query int false "Page number" minimum(1) default(1)
// @Param pageSize query int false "Posts per page" minimum(1) maximum(100) default(10)
// @Param q query string false "Search titles, tags and content" maxLength(200)
// @Param status query string false "Lifecycle status" Enums(draft,published,archived,all) default(all)
// @Success 200 {object} APIWorkspacePostPage
// @Failure 400 {object} APIError "Invalid pagination or search input"
// @Failure 401 {object} APIError "Authentication required"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Router /api/posts/page [get]
func (a *App) workspacePostsPage(w http.ResponseWriter, r *http.Request) {
	h := homepageResult{Posts: []Row{}, Page: homepagePageNumber(r), PageSize: workspacePageSize(r), Query: strings.TrimSpace(r.URL.Query().Get("q"))}
	status := requestedPostStatus(r, false)
	terms := searchQuery(r)
	if h.Query != "" {
		h.Total = a.searchCount(r, false, status, terms, nil, false)
		h.clamp()
		h.Posts = a.searchResultsPage(r, false, status, terms, nil, false, false, h.PageSize, h.Offset())
	} else {
		query, args := postsStatusQuery(status)
		count := first(a.DB.Must(r.Context(), strings.Replace(query, "SELECT *", "SELECT COUNT(*) AS total", 1), args...))
		h.Total, _ = strconv.Atoi(fmt.Sprint(count["total"]))
		h.clamp()
		args = append(args, h.PageSize, h.Offset())
		query += " ORDER BY updated_at DESC,id ASC LIMIT $" + strconv.Itoa(len(args)-1) + " OFFSET $" + strconv.Itoa(len(args))
		for _, row := range a.DB.Must(r.Context(), query, args...) {
			h.Posts = append(h.Posts, post(row))
		}
	}
	send(w, 200, Row{"posts": h.Posts, "page": h.Page, "pageSize": h.PageSize, "pages": h.Pages, "total": h.Total})
}

func workspacePageSize(r *http.Request) int {
	values, exists := r.URL.Query()["pageSize"]
	if !exists {
		return 10
	}
	if len(values) != 1 {
		fail(400, "Use one pageSize parameter.")
	}
	size, err := strconv.Atoi(values[0])
	if err != nil || size < 1 || size > 100 {
		fail(400, "pageSize must be a whole number from 1 to 100.")
	}
	return size
}
