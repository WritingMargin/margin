package blog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
)

// indexPostSearch runs in the same transaction as the post revision. It stores
// only normalized terms, their strongest field weight, and first body position.
func (a *App) indexPostSearch(ctx context.Context, tx *sql.Tx, row Row, content string) error {
	text := searchBodyText(content)
	doc := buildSearchDocument(row, text)
	if err := a.execPostIndex(ctx, tx, `INSERT INTO post_search_documents(post_id,revision,title_text,excerpt_text)
		VALUES($1,$2,$3,$4) ON CONFLICT(post_id) DO UPDATE SET revision=EXCLUDED.revision,
		title_text=EXCLUDED.title_text,excerpt_text=EXCLUDED.excerpt_text`, row["id"], row["revision"], doc.title, doc.excerpt); err != nil {
		return err
	}
	if err := a.execPostIndex(ctx, tx, "DELETE FROM post_search_terms WHERE post_id=$1", row["id"]); err != nil {
		return err
	}
	positions := searchBodyPositions(text)
	values := make([]string, 0, 200)
	args := make([]any, 0, 800)
	flush := func() error {
		if len(values) == 0 {
			return nil
		}
		if err := a.execPostIndex(ctx, tx, `INSERT INTO post_search_terms(post_id,term,weight,body_position) VALUES `+strings.Join(values, ","), args...); err != nil {
			return err
		}
		values = values[:0]
		args = args[:0]
		return nil
	}
	for term, weight := range doc.terms {
		var position any
		if p, found := positions[term]; found {
			position = p
		}
		base := len(args)
		values = append(values, fmt.Sprintf("($%d,$%d,$%d,$%d)", base+1, base+2, base+3, base+4))
		args = append(args, row["id"], term, weight, position)
		if len(values) == 200 {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	return flush()
}

func searchBodyPositions(text string) map[string]int {
	positions := map[string]int{}
	for i, word := range strings.Fields(text) {
		for _, term := range searchWords(word) {
			if _, found := positions[term]; !found {
				positions[term] = i
			}
		}
	}
	return positions
}

func searchBodyText(content string) string {
	return strings.Join(strings.Fields(html.UnescapeString(searchHTMLTags.ReplaceAllString(rssMarkdown(content, "https://search.invalid/"), " "))), " ")
}

// A pattern encodes one insertion, deletion, replacement or adjacent swap.
// SQL evaluates those patterns against indexed terms; it never scores or sorts
// stored rows in Go.
func searchEditPatterns(word string, depth int) []string {
	makeEdits := func(input []rune) []string {
		result := make([]string, 0, len(input)*4+1)
		for i := 0; i <= len(input); i++ {
			with := make([]rune, 0, len(input)+1)
			with = append(with, input[:i]...)
			with = append(with, '_')
			with = append(with, input[i:]...)
			result = append(result, string(with))
			if i == len(input) {
				continue
			}
			result = append(result, string(append(append([]rune{}, input[:i]...), input[i+1:]...)))
			change := append([]rune{}, input...)
			change[i] = '_'
			result = append(result, string(change))
			if i+1 < len(input) {
				swap := append([]rune{}, input...)
				swap[i], swap[i+1] = swap[i+1], swap[i]
				result = append(result, string(swap))
			}
		}
		return result
	}
	seen := map[string]bool{word: true}
	frontier := []string{word}
	for step := 0; step < depth; step++ {
		next := []string{}
		for _, pattern := range frontier {
			for _, edit := range makeEdits([]rune(pattern)) {
				if !seen[edit] {
					seen[edit] = true
					next = append(next, edit)
				}
			}
		}
		frontier = next
	}
	return frontier
}

type searchSQLBuilder struct {
	kind string
	args []any
}

func (b *searchSQLBuilder) bind(value any) string {
	b.args = append(b.args, value)
	return "$" + strconv.Itoa(len(b.args))
}

func (b *searchSQLBuilder) pattern(term string, depth int) string {
	length := len([]rune(term))
	if length < 4 || (depth == 2 && length < 8) {
		return "FALSE"
	}
	patterns, _ := json.Marshal(searchEditPatterns(term, depth))
	arg := b.bind(string(patterns))
	bounds := fmt.Sprintf("length(t.term) BETWEEN %d AND %d AND ", length-depth, length+depth)
	if b.kind == "sqlite" {
		return "(" + bounds + "EXISTS(SELECT 1 FROM json_each(" + arg + ") AS pattern WHERE t.term LIKE pattern.value))"
	}
	return "(" + bounds + "EXISTS(SELECT 1 FROM jsonb_array_elements_text(CAST(" + arg + " AS jsonb)) AS pattern(value) WHERE t.term LIKE pattern.value))"
}

func (b *searchSQLBuilder) matchTerm(i int, term string) (string, string, string, string) {
	name := "match" + strconv.Itoa(i)
	q := b.bind(term)
	one := b.pattern(term, 1)
	two := b.pattern(term, 2)
	prefix := "t.term LIKE " + q + " || '%'"
	fuzzy := "length(t.term)<=64 AND (" + one + " OR " + two + ")"
	cases := "CASE WHEN t.term=" + q + " THEN 1.0 WHEN " + prefix + " THEN 0.8 WHEN length(t.term)<=64 AND " + one + " THEN 0.5 WHEN length(t.term)<=64 AND " + two + " THEN 0.25 ELSE 0 END"
	part := name + " AS (SELECT t.post_id,MAX(t.weight*(" + cases + ")) AS score,MIN(t.body_position) AS body_position FROM post_search_terms t WHERE t.term=" + q + " OR " + prefix + " OR " + fuzzy + " GROUP BY t.post_id)"
	return part, " JOIN " + name + " ON " + name + ".post_id=p.id", name + ".score", "COALESCE(" + name + ".body_position,2147483647)"
}

func (b *searchSQLBuilder) where(status string, tags []string, excludeFeatured, onlyFeatured bool) string {
	where := " WHERE 1=1"
	if status != "all" {
		where += " AND p.status=" + b.bind(status)
	}
	if excludeFeatured {
		where += " AND p.featured=FALSE"
	}
	if onlyFeatured {
		where += " AND p.featured=TRUE"
	}
	if len(tags) > 0 {
		values := []string{}
		for _, tag := range tags {
			values = append(values, b.bind(tag))
		}
		if b.kind == "sqlite" {
			where += " AND EXISTS(SELECT 1 FROM json_each(p.tags) topic WHERE topic.value IN (" + strings.Join(values, ",") + "))"
		} else {
			where += " AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.tags) AS topic(value) WHERE topic.value IN (" + strings.Join(values, ",") + "))"
		}
	}
	return where
}

func (a *App) searchSQL(terms []string, status string, tags []string, excludeFeatured, onlyFeatured bool) (string, []any) {
	b := &searchSQLBuilder{kind: a.DB.Kind}
	parts := []string{}
	joins := []string{}
	scores := []string{}
	positions := []string{}
	for i, term := range terms {
		part, join, score, position := b.matchTerm(i, term)
		parts = append(parts, part)
		joins = append(joins, join)
		scores = append(scores, score)
		positions = append(positions, position)
	}
	phrase := b.bind(strings.Join(terms, " "))
	contains := "instr"
	least := "MIN"
	if a.DB.Kind != "sqlite" {
		contains = "strpos"
		least = "LEAST"
	}
	position := positions[0]
	if len(positions) > 1 {
		position = least + "(" + strings.Join(positions, ",") + ")"
	}
	query := "WITH " + strings.Join(parts, ",") + " SELECT p.*, (" + strings.Join(scores, "+") + "+CASE WHEN " + contains + "(d.title_text," + phrase + ")>0 THEN 16 ELSE 0 END+CASE WHEN " + contains + "(d.excerpt_text," + phrase + ")>0 THEN 4 ELSE 0 END) AS search_score,NULLIF(" + position + ",2147483647) AS search_position FROM posts p JOIN post_search_documents d ON d.post_id=p.id AND d.revision=p.revision" + strings.Join(joins, "") + b.where(status, tags, excludeFeatured, onlyFeatured)
	return query, b.args
}

func (a *App) searchCount(r *http.Request, public bool, status string, terms, tags []string, excludeFeatured bool) int {
	if len(terms) == 0 {
		return 0
	}
	query, args := a.searchSQL(terms, status, tags, excludeFeatured, false)
	row := first(a.DB.Must(r.Context(), "SELECT COUNT(*) AS total FROM ("+query+") search_results", args...))
	total, _ := strconv.Atoi(fmt.Sprint(row["total"]))
	return total
}

func (a *App) searchResultsPage(r *http.Request, public bool, status string, terms, tags []string, excludeFeatured, onlyFeatured bool, limit, offset int) []Row {
	results := []Row{}
	if len(terms) == 0 {
		return results
	}
	query, args := a.searchSQL(terms, status, tags, excludeFeatured, onlyFeatured)
	query += " ORDER BY search_score DESC,p.updated_at DESC,p.id ASC"
	if limit > 0 {
		args = append(args, limit, offset)
		query += " LIMIT $" + strconv.Itoa(len(args)-1) + " OFFSET $" + strconv.Itoa(len(args))
	}
	for _, row := range a.DB.Must(r.Context(), query, args...) {
		must(r.Context().Err())
		doc := a.searchDocument(r.Context(), row)
		if !a.searchHitCurrent(r.Context(), row, public) {
			continue
		}
		result := post(row)
		position := 0
		if row["search_position"] != nil {
			position, _ = strconv.Atoi(fmt.Sprint(row["search_position"]))
		}
		result["searchSnippet"] = doc.snippetAt(position)
		result["searchMatches"] = searchHighlights(result, terms)
		results = append(results, result)
	}
	return results
}
