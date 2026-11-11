package blog

import (
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

func validHomepagePagination(row Row) {
	if _, ok := row["pageSize"]; !ok {
		row["pageSize"] = float64(10)
	}
	if _, ok := row["pagination"]; !ok {
		row["pagination"] = "pages"
	}
	size, ok := row["pageSize"].(float64)
	if !ok || size < 1 || size > 100 || size != float64(int(size)) {
		fail(400, "pageSize: choose a whole number from 1 to 100")
	}
	enumField(row, "pagination", "pages", "more")
}

type homepageResult struct {
	HeroPosts       []Row          `json:"heroPosts,omitempty"`
	Featured        []Row          `json:"featured"`
	IncludeFeatured bool           `json:"-"`
	Posts           []Row          `json:"posts"`
	Total           int            `json:"total"`
	Page            int            `json:"page"`
	PageSize        int            `json:"pageSize"`
	Pages           int            `json:"pages"`
	Tags            []string       `json:"tags"`
	TopTags         []string       `json:"topTags"`
	TagCounts       map[string]int `json:"tagCounts"`
	Query           string         `json:"query"`
	Tag             string         `json:"tag"`
	SelectedTags    []string       `json:"selectedTags"`
}

func (h homepageResult) Offset() int { return (h.Page - 1) * h.PageSize }
func (h homepageResult) URL(page int) string {
	values := url.Values{}
	if page > 1 {
		values.Set("page", strconv.Itoa(page))
	}
	if h.Query != "" {
		values.Set("q", h.Query)
	}
	for _, tag := range h.SelectedTags {
		values.Add("tag", tag)
	}
	path := sitePath("/")
	if len(values) > 0 {
		path += "?" + values.Encode()
	}
	return path
}
func (h homepageResult) PreviousURL() string {
	if h.Page > 1 {
		return h.URL(h.Page - 1)
	}
	return ""
}
func (h homepageResult) NextURL() string {
	if h.Page < h.Pages {
		return h.URL(h.Page + 1)
	}
	return ""
}
func homepagePageNumber(r *http.Request) int {
	raw := r.URL.Query().Get("page")
	if raw == "" {
		return 1
	}
	page, err := strconv.Atoi(raw)
	if err != nil || page < 1 {
		fail(400, "Choose a valid page number.")
	}
	return page
}
func (a *App) homepageData(r *http.Request, theme Row) homepageResult {
	design := object(theme["homepage"])
	selectedTags := homepageSelectedTags(r)
	h := homepageResult{Featured: []Row{}, IncludeFeatured: !homepageHasFeatured(design) || design.yes("includeFeaturedInFeed"), Posts: []Row{}, Page: homepagePageNumber(r), PageSize: int(design["pageSize"].(float64)), Query: strings.TrimSpace(r.URL.Query().Get("q")), SelectedTags: selectedTags}
	if len(selectedTags) > 0 {
		h.Tag = selectedTags[0]
	}
	if _, composed := design["sections"]; composed {
		h.HeroPosts = a.homepageHeroPosts(r)
	}
	terms := searchQuery(r)
	h.Tags, h.TopTags, h.TagCounts = a.homepageTags(r)
	if h.Query != "" {
		return a.homepageSearch(r, h, terms)
	}
	h.Featured = a.homepageFeatured(r, h.SelectedTags)
	query, args := a.homepageWhere(h.SelectedTags, !h.IncludeFeatured)
	count := first(a.DB.Must(r.Context(), "SELECT COUNT(*) AS total FROM posts"+query, args...))
	h.Total, _ = strconv.Atoi(fmt.Sprint(count["total"]))
	h.clamp()
	args = append(args, h.PageSize, h.Offset())
	query += " ORDER BY created_at DESC,id ASC LIMIT $" + strconv.Itoa(len(args)-1) + " OFFSET $" + strconv.Itoa(len(args))
	for _, row := range a.DB.Must(r.Context(), "SELECT * FROM posts"+query, args...) {
		h.Posts = append(h.Posts, post(row))
	}
	return h
}
func (h *homepageResult) clamp() {
	h.Pages = max(1, (h.Total+h.PageSize-1)/h.PageSize)
	h.Page = min(h.Page, h.Pages)
}
func homepageSelectedTags(r *http.Request) []string {
	values := r.URL.Query()["tag"]
	if len(values) > 100 {
		fail(400, "Choose at most 100 topics.")
	}
	seen := map[string]bool{}
	tags := []string{}
	for _, tag := range values {
		if utf8.RuneCountInString(tag) > 100 {
			fail(400, "Topic is too long.")
		}
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags
}
func (a *App) homepageWhere(tags []string, excludeFeatured bool) (string, []any) {
	query := " WHERE status='published'"
	if excludeFeatured {
		query += " AND featured=FALSE"
	}
	args := []any{}
	if len(tags) > 0 {
		placeholders := make([]string, len(tags))
		for i := range tags {
			placeholders[i] = "$" + strconv.Itoa(i+1)
		}
		predicate := "EXISTS (SELECT 1 FROM jsonb_array_elements_text(posts.tags) AS topic(value) WHERE topic.value IN (" + strings.Join(placeholders, ",") + "))"
		if a.DB.Kind == "sqlite" {
			predicate = "EXISTS (SELECT 1 FROM json_each(posts.tags) AS topic WHERE topic.value IN (" + strings.Join(placeholders, ",") + "))"
		}
		query += " AND " + predicate
		for _, tag := range tags {
			args = append(args, tag)
		}
	}
	return query, args
}
func (a *App) homepageTags(r *http.Request) ([]string, []string, map[string]int) {
	from := "FROM posts p JOIN json_each(p.tags) AS topic"
	tag := "topic.value"
	where := "p.status='published' AND topic.type='text'"
	if a.DB.Kind != "sqlite" {
		from = "FROM posts p CROSS JOIN LATERAL jsonb_array_elements(p.tags) AS topic(value)"
		tag = "topic.value #>> '{}'"
		where = "p.status='published' AND jsonb_typeof(topic.value)='string'"
	}
	query := "WITH post_tags AS (SELECT DISTINCT p.id AS post_id, " + tag + " AS tag " + from + " WHERE " + where + ") SELECT tag,COUNT(*) AS total FROM post_tags GROUP BY tag"
	rows := a.DB.Must(r.Context(), query+" ORDER BY tag")
	counts := map[string]int{}
	tags := make([]string, 0, len(rows))
	for _, row := range rows {
		tag := row.str("tag")
		count, err := strconv.Atoi(fmt.Sprint(row["total"]))
		must(err)
		counts[tag] = count
		tags = append(tags, tag)
	}
	top := []string{}
	for _, row := range a.DB.Must(r.Context(), query+" ORDER BY total DESC,tag LIMIT 10") {
		top = append(top, row.str("tag"))
	}
	return tags, top, counts
}
func (a *App) homepageSearch(r *http.Request, h homepageResult, terms []string) homepageResult {
	h.Featured = a.searchResultsPage(r, true, "published", terms, h.SelectedTags, false, true, 0, 0)
	h.Total = a.searchCount(r, true, "published", terms, h.SelectedTags, !h.IncludeFeatured)
	h.clamp()
	h.Posts = a.searchResultsPage(r, true, "published", terms, h.SelectedTags, !h.IncludeFeatured, false, h.PageSize, h.Offset())
	return h
}
func containsTopic(tags []string, value string) bool {
	for _, tag := range tags {
		if tag == value {
			return true
		}
	}
	return false
}
func containsAnyTopic(tags, selected []string) bool {
	for _, tag := range selected {
		if containsTopic(tags, tag) {
			return true
		}
	}
	return false
}
func (a *App) publicHomepage(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.homepageData(r, a.settings(r.Context())))
}
