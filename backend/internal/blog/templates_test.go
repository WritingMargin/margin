package blog

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func templateCatalogFixture(t *testing.T) Row {
	t.Helper()
	theme := defaultTheme()
	groups := Row{"schemaVersion": 4, "version": "test.1"}
	for _, section := range []string{"homepage", "article"} {
		look := object(theme[section])
		design := Row{}
		keys := []string{"font", "width", "border", "radius", "showDates", "showTags"}
		if section == "homepage" {
			keys = append(keys, "layout", "heroLayout", "showHero", "showArtwork", "showExcerpts", "showImages")
		} else {
			keys = append(keys, "headerLayout", "showCover", "showExcerpt")
		}
		for _, key := range keys {
			design[key] = look[key]
		}
		for _, key := range []string{"background", "text", "accent"} {
			design[key] = theme[key]
		}
		groups[section] = []Row{{"id": "test", "name": "Test", "description": "A test template.", "design": design}}
	}
	groups["writing"] = []Row{{"id": "note", "name": "Note", "description": "An outline.", "content": "## Notes\n\nStart here."}}
	var decoded Row
	if err := json.Unmarshal([]byte(encode(groups)), &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

func TestTemplatesFetchWithoutAccountAndKeepSavedDesign(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "private-token-must-not-be-sent")
	catalog, calls := templateCatalogFixture(t), 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		assertCatalogRequest(t, r)
		if calls == 2 {
			if r.Header.Get("If-None-Match") != `"test.1"` {
				t.Fatal("missing conditional revalidation")
			}
			return &http.Response{StatusCode: 304, Body: io.NopCloser(strings.NewReader(""))}, nil
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Etag": {`"test.1"`}}, Body: io.NopCloser(strings.NewReader(encode(catalog)))}, nil
	})
	expectStatus(t, request(t, a, "GET", "/api/settings/templates", nil, false), 401)
	before := encode(a.settings(context.Background()))
	for i := 0; i < 2; i++ {
		result := responseRow(t, request(t, a, "GET", "/api/settings/templates", nil, true), 200)
		if result.str("version") != "test.1" {
			t.Fatal(result)
		}
	}
	if calls != 2 {
		t.Fatalf("catalog must revalidate on each visit: %d calls", calls)
	}
	if before != encode(a.settings(context.Background())) {
		t.Fatal("catalog changed saved design")
	}
	// A refresh failure serves the last valid catalog; a later success replaces it.
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	responseRow(t, request(t, a, "GET", "/api/settings/templates", nil, true), 200)
	catalog["version"] = "test.2"
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(encode(catalog)))}, nil
	})
	result := responseRow(t, request(t, a, "GET", "/api/settings/templates", nil, true), 200)
	if result.str("version") != "test.2" {
		t.Fatal("catalog did not refresh")
	}
}

func TestTemplatesRejectInvalidCatalogs(t *testing.T) {
	mutations := []func(Row){
		func(row Row) { row["schemaVersion"] = float64(999) },
		func(row Row) { row["homepage"] = []any{} },
		func(row Row) { row["writing"] = append(row["writing"].([]any), row["writing"].([]any)[0]) },
		func(row Row) { object(row["writing"].([]any)[0])["content"] = " " },
		func(row Row) { object(object(row["homepage"].([]any)[0])["design"])["title"] = "Replace welcome" },
		func(row Row) {
			object(object(row["article"].([]any)[0])["design"])["background"] = "red;url(https://bad.example)"
		},
	}
	if !validTemplateCatalog(templateCatalogFixture(t)) {
		t.Fatal("valid catalog rejected")
	}
	for _, mutate := range mutations {
		catalog := templateCatalogFixture(t)
		mutate(catalog)
		if validTemplateCatalog(catalog) {
			t.Fatal("invalid catalog accepted")
		}
	}
}

func TestTemplatesOutageSizeLimitRedirectAndRecovery(t *testing.T) {
	for _, payload := range []string{"{", "{}", strings.Repeat(" ", (1<<20)+1)} {
		a, _ := coreFixture(t)
		a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(payload))}, nil
		})
		responseRow(t, request(t, a, "GET", "/api/settings/templates", nil, true), 503)
	}
	a, _ := coreFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": {"https://other.example"}}, Body: io.NopCloser(strings.NewReader("{}"))}, nil
	})
	for i := 0; i < 2; i++ {
		responseRow(t, request(t, a, "GET", "/api/settings/templates", nil, true), 503)
	}
	if calls != 2 {
		t.Fatalf("each visit should try once without following redirects: %d", calls)
	}
	// Existing design and post APIs remain available during a catalog outage.
	responseRow(t, request(t, a, "GET", "/api/settings", nil, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/posts", nil, true), 200)
}

func assertCatalogRequest(t *testing.T, r *http.Request) {
	t.Helper()
	if r.URL.String() != "https://central.example/v1/templates?schemaVersion=5" || r.Method != "GET" || r.Body != nil || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
		t.Fatalf("unexpected catalog request: %s %s", r.Method, r.URL)
	}
}
