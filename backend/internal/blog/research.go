package blog

import (
	"context"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

func (a *App) researchRoutes() {
	a.mux.HandleFunc("GET /api/posts/{id}/sources", a.savedSources)
	a.mux.HandleFunc("POST /api/posts/{id}/sources", a.saveResearchSource)
	a.mux.HandleFunc("GET /api/posts/{id}/research", a.researchSearch)
	a.mux.HandleFunc("GET /api/ai/research", a.researchSearch)
}

// @Summary List saved research sources
// @ID listResearchSources
// @Description Return the private sources kept with this post, ordered by title and ID. These sources can be cited in a draft.
// @Tags Research
// @Produce json
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Success 200 {array} APISavedResearchSource
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/posts/{id}/sources [get]
func (a *App) savedSources(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.getPost(r.Context(), id)
	rows := a.DB.Must(r.Context(), "SELECT id,url,title,excerpt FROM research_sources WHERE post_id=$1 ORDER BY title,id", id)
	if rows == nil {
		rows = []Row{}
	}
	send(w, 200, rows)
}

// @Summary Save a source with a draft
// @ID saveResearchSource
// @Description Keep an HTTP or HTTPS source with this post. Saving an existing URL updates the title and preserves an existing excerpt when the new excerpt is empty. The article body is unchanged.
// @Tags Research
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Param input body APIResearchSource true "Source to keep"
// @Success 200 {object} APISavedResearchSource
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/posts/{id}/sources [post]
func (a *App) saveResearchSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.getPost(r.Context(), id)
	input := body(w, r)
	strict(input, "url", "title", "excerpt")
	address := stringField(input, "url", 1, 2048, true)
	parsed, err := url.Parse(address)
	if err != nil || parsed.Hostname() == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		fail(400, "Enter an HTTP or HTTPS source URL.")
	}
	title := stringField(input, "title", 1, 500, true)
	excerpt := ""
	if _, present := input["excerpt"]; present {
		excerpt = stringField(input, "excerpt", 0, 4000, true)
	}
	row := first(a.DB.Must(r.Context(), `INSERT INTO research_sources(id,post_id,url,title,excerpt) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(post_id,url) DO UPDATE SET title=EXCLUDED.title,
 excerpt=CASE WHEN EXCLUDED.excerpt='' THEN research_sources.excerpt ELSE EXCLUDED.excerpt END RETURNING id,url,title,excerpt`, uuid(), id, address, title, excerpt))
	send(w, 200, row)
}

type crossrefWork struct {
	DOI      string
	Title    []string
	Abstract string
}

var abstractMarkup = regexp.MustCompile("<[^>]*>")

func researchText(value string, limit int) string {
	plain := []rune(readableLine(html.UnescapeString(abstractMarkup.ReplaceAllString(value, " "))))
	return string(plain[:min(len(plain), limit)])
}

// @Summary Find publications for draft research
// @ID searchPublications
// @Description Search Crossref using the research question in q. Returns publication titles, DOI URLs and available abstract excerpts in provider order. Only the query is sent to Crossref. Review abstracts as source material and use saveResearchSource to keep selected references privately with the post.
// @Tags Research
// @Produce json
// @Security BearerAuth
// @Param id path string true "Post ID"
// @Param q query string true "Research question or bibliographic search" minlength(1) maxlength(500)
// @Param limit query int false "Maximum results, default 8" Enums(3,8)
// @Success 200 {array} APIResearchSource
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Failure 429 {object} APIError
// @Failure 502 {object} APIError
// @Router /api/posts/{id}/research [get]
func (a *App) researchSearch(w http.ResponseWriter, r *http.Request) {
	if id := r.PathValue("id"); id != "" {
		a.getPost(r.Context(), id)
	}
	a.limit(r, "research-search", 30, time.Minute, true)
	query := stringField(Row{"query": r.URL.Query().Get("q")}, "query", 1, 500, true)
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	rows := "8"
	if r.URL.Query().Get("limit") == "3" {
		rows = "3"
	}
	params := url.Values{"query.bibliographic": {query}, "rows": {rows}, "select": {"DOI,title,abstract"}}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.crossref.org/works?"+params.Encode(), nil)
	must(err)
	req.Header.Set("User-Agent", "Margin/1.0 (https://github.com/WritingMargin/margin)")
	res, err := a.Client.Do(req)
	if err != nil {
		fail(502, "Could not reach Crossref. Try the search again.")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		fail(502, "Crossref is unavailable. Try again later.")
	}
	var result struct {
		Message struct{ Items []crossrefWork }
	}
	if json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&result) != nil {
		fail(502, "Crossref returned unreadable results.")
	}
	sources := []Row{}
	for _, work := range result.Message.Items {
		if work.DOI == "" || len(work.Title) == 0 {
			continue
		}
		address := url.URL{Scheme: "https", Host: "doi.org", Path: "/" + strings.TrimSpace(work.DOI)}
		sources = append(sources, Row{"url": address.String(), "title": researchText(work.Title[0], 500), "excerpt": researchText(work.Abstract, 4000)})
	}
	send(w, 200, sources)
}
