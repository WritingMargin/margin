package blog

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func searchResults(t *testing.T, a *App, path string, authenticated bool) []Row {
	t.Helper()
	response := request(t, a, "GET", path, nil, authenticated)
	expectStatus(t, response, 200)
	var rows []Row
	must(json.Unmarshal(response.Body.Bytes(), &rows))
	return rows
}
func searchFixturePost(t *testing.T, a *App, title, slug, content, status string) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": title, "slug": slug, "content": content, "status": status}, true), 201)
}
func TestSearchFullContentRankingAndTypos(t *testing.T) {
	a, _ := coreFixture(t)
	body := searchFixturePost(t, a, "A notebook", "notebook", "## Observations\n\nA creative approach to orbital research.\n\n[Source](https://example.test/private-target) and **telescope** notes.", "published")
	title := searchFixturePost(t, a, "Orbital research", "orbital", "A different perspective.", "published")
	for _, scope := range []string{"/api/public/search", "/api/posts/search"} {
		rows := searchResults(t, a, scope+"?q=research+orbital", true)
		if len(rows) != 2 || rows[0].str("id") != title.str("id") || rows[1].str("id") != body.str("id") {
			t.Fatal(rows)
		}
		rows = searchResults(t, a, scope+"?q=TELESOCPE", true)
		if len(rows) != 1 || rows[0].str("id") != body.str("id") {
			t.Fatal(rows)
		}
		containsHTML(t, rows[0].str("searchSnippet"), "telescope")
		containsHTML(t, encode(rows[0]["searchMatches"]), "telescope")
		excludesHTML(t, encode(rows), "**", "content_key", "private-target")
		if rows[0]["content"] != nil {
			t.Fatal("search sent the full body")
		}
		if len(searchResults(t, a, scope+"?q=orb+res", true)) != 2 {
			t.Fatal("prefix matching failed")
		}
		if len(searchResults(t, a, scope+"?q=orbital+missing", true)) != 0 {
			t.Fatal("all independent words must match")
		}
	}
}
func TestSearchPublicationPrivacyAndFreshness(t *testing.T) {
	a, _ := coreFixture(t)
	draft := searchFixturePost(t, a, "Private", "private", "confidential nebula", "draft")
	public := searchFixturePost(t, a, "Public", "public", "ordinary nebula", "published")
	expectStatus(t, request(t, a, "GET", "/api/posts/search?q=nebula", nil, false), 401)
	if len(searchResults(t, a, "/api/posts/search?q=nebula", true)) != 2 {
		t.Fatal("workspace must search drafts")
	}
	rows := searchResults(t, a, "/api/public/search?q=nebula", false)
	if len(rows) != 1 || rows[0].str("id") != public.str("id") {
		t.Fatal(rows)
	}
	if len(searchResults(t, a, "/api/public/search?q=confidential", false)) != 0 {
		t.Fatal("draft leaked from the shared cache")
	}
	updated := responseRow(t, request(t, a, "PUT", "/api/posts/"+public.str("id"), Row{"revision": public["revision"], "content": "fresh galaxies"}, true), 200)
	if len(searchResults(t, a, "/api/public/search?q=nebula", false)) != 0 {
		t.Fatal("old revision remained searchable")
	}
	if len(searchResults(t, a, "/api/public/search?q=galaxies", false)) != 1 {
		t.Fatal("new revision missing")
	}
	updated = responseRow(t, request(t, a, "PUT", "/api/posts/"+public.str("id"), Row{"revision": updated["revision"], "status": "draft"}, true), 200)
	if len(searchResults(t, a, "/api/public/search?q=galaxies", false)) != 0 {
		t.Fatal("unpublished post remained public")
	}
	expectStatus(t, request(t, a, "DELETE", "/api/posts/"+public.str("id"), Row{"revision": updated["revision"]}, true), 200)
	if len(searchResults(t, a, "/api/posts/search?q=galaxies", true)) != 0 {
		t.Fatal("deleted post remained searchable")
	}
	responseRow(t, request(t, a, "PUT", "/api/posts/"+draft.str("id"), Row{"revision": draft["revision"], "status": "published"}, true), 200)
	if len(searchResults(t, a, "/api/public/search?q=confidential", false)) != 1 {
		t.Fatal("newly published post missing")
	}
}
func TestSearchValidationAndFailure(t *testing.T) {
	a, _ := coreFixture(t)
	for _, q := range []string{"", "+++", "%21%21"} {
		if len(searchResults(t, a, "/api/public/search?q="+q, false)) != 0 {
			t.Fatal(q)
		}
	}
	for _, q := range []string{strings.Repeat("a", 201), strings.Repeat("word+", 13), strings.Repeat("a", 65)} {
		expectStatus(t, request(t, a, "GET", "/api/public/search?q="+q, nil, false), 400)
	}
	searchFixturePost(t, a, "Search", "search", "find me", "published")
	a.Storage = unavailablePublicStorage{a.Storage}
	expectStatus(t, request(t, a, "GET", "/api/public/search?q=find", nil, false), 503)
}
func TestSearchMatchingQuality(t *testing.T) {
	for _, pair := range [][2]string{{"creatve", "creative"}, {"telesocpe", "telescope"}, {"researxh", "research"}, {"researhc", "research"}, {"research", "reserch"}} {
		if searchTermScore(pair[0], pair[1]) == 0 {
			t.Fatal(pair)
		}
	}
	for _, pair := range [][2]string{{"cat", "bat"}, {"apple", "applys"}, {"paper", "telescope"}} {
		if searchTermScore(pair[0], pair[1]) != 0 {
			t.Fatal(pair)
		}
	}
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Café observations", "slug": "cafe-observations", "tags": []string{"Astronomy"}, "content": "Independent body words", "status": "published"}, true), 201)
	rows := searchResults(t, a, "/api/public/search?q=ASTRONOMY+caf%C3%A9+body", false)
	if len(rows) != 1 || rows[0].str("id") != post.str("id") {
		t.Fatal("SQL cross-field or Unicode matching failed", rows)
	}
	if len(searchResults(t, a, "/api/public/search?q=astronomy+absent", false)) != 0 {
		t.Fatal("SQL accepted a missing term")
	}
}

type searchChangingStorage struct {
	Storage
	change func()
}

func (s searchChangingStorage) Get(ctx context.Context, key string) ([]byte, error) {
	content, err := s.Storage.Get(ctx, key)
	s.change()
	return content, err
}
func TestSearchRechecksPublicationAfterReadingBody(t *testing.T) {
	a, _ := coreFixture(t)
	p := searchFixturePost(t, a, "Concurrent", "concurrent", "sensitive phrase", "published")
	a.Storage = searchChangingStorage{a.Storage, func() { a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", p["id"]) }}
	if len(searchResults(t, a, "/api/public/search?q=sensitive", false)) != 0 {
		t.Fatal("concurrently unpublished body leaked")
	}
}

func TestStartupMigrationIndexesPublishedAndDraftRevisions(t *testing.T) {
	a, storage := coreFixture(t)
	public := searchFixturePost(t, a, "Visible", "visible", "existing telescope body", "published")
	draft := searchFixturePost(t, a, "Private", "private", "draft telescope body", "draft")
	for _, id := range []any{public["id"], draft["id"]} {
		a.DB.Must(context.Background(), "DELETE FROM post_search_terms WHERE post_id=$1", id)
		a.DB.Must(context.Background(), "DELETE FROM post_search_documents WHERE post_id=$1", id)
	}
	if len(searchResults(t, a, "/api/public/search?q=telescope", false)) != 0 {
		t.Fatal("search indexed a post during a request")
	}
	articleReads := 0
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "posts/") {
			articleReads++
		}
	}
	if err := a.MigrateContentIndexes(context.Background()); err != nil {
		t.Fatal(err)
	}
	if articleReads != 2 {
		t.Fatalf("startup loaded %d articles, want two", articleReads)
	}
	if err := a.MigrateContentIndexes(context.Background()); err != nil {
		t.Fatal(err)
	}
	if articleReads != 2 {
		t.Fatal("repeat startup reread indexed content")
	}
	storage.onGet = nil
	assertMigratedSearchVisibility(t, a, public, draft)
}

func assertMigratedSearchVisibility(t *testing.T, a *App, public, draft Row) {
	t.Helper()
	rows := searchResults(t, a, "/api/public/search?q=telescope", false)
	if len(rows) != 1 || rows[0].str("id") != public.str("id") {
		t.Fatal(rows)
	}
	if len(a.DB.Must(context.Background(), "SELECT 1 FROM post_search_documents WHERE post_id=$1", draft["id"])) != 1 {
		t.Fatal("startup did not index a draft for private search")
	}
	rows = searchResults(t, a, "/api/posts/search?q=telescope", true)
	if len(rows) != 2 {
		t.Fatal(rows)
	}
}

func TestSearchPreservesTwoEditsForLongTerms(t *testing.T) {
	a, _ := coreFixture(t)
	word := strings.Repeat("abcdefghijklmnopqrstuvwxyz", 2) + "abcdefghijkl"
	post := searchFixturePost(t, a, "Long word", "long-word", word, "published")
	query := []rune(word)
	query[3], query[4] = query[4], query[3]
	query[40], query[41] = query[41], query[40]
	rows := searchResults(t, a, "/api/public/search?q="+string(query), false)
	if len(rows) != 1 || rows[0].str("id") != post.str("id") {
		t.Fatal("long two-edit term was not found", rows)
	}
}

func TestSearchHighlightsUseTheSameMatchingRules(t *testing.T) {
	result := Row{"title": "Telescope research", "slug": "telescope-research", "excerpt": "Café observations", "searchSnippet": "A telescope, then TELESCOPE. Hidden words are absent.", "tags": []string{"Astronomy"}}
	matches := searchHighlights(result, searchWords("telesocpe café astro"))
	if strings.Join(matches, "|") != "Telescope|telescope|Café|TELESCOPE|Astronomy" {
		t.Fatal(matches)
	}
	if len(searchHighlights(result, searchWords("unmatched"))) != 0 {
		t.Fatal("unmatched text highlighted")
	}
}
