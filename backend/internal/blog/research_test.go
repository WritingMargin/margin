package blog

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestResearchSourcesStayWithDraft(t *testing.T) {
	a, _ := coreFixture(t)
	post := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-notes"), true), 201)
	base := "/api/posts/" + post.str("id")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.crossref.org" || r.URL.Query().Get("query.bibliographic") != "sample size" {
			t.Fatal(r.URL)
		}
		return fixtureResponse(Row{"message": Row{"items": []Row{{"DOI": "10.1234/work", "title": []string{"Sample study"}, "abstract": "<jats:p>Private excerpt</jats:p>"}}}}), nil
	})
	hits := request(t, a, "GET", base+"/research?q=sample+size", nil, true)
	expectStatus(t, hits, 200)
	containsHTML(t, hits.Body.String(), "https://doi.org/10.1234/work", "Private excerpt")
	excludesHTML(t, hits.Body.String(), "jats:p")
	source := Row{"url": "https://doi.org/10.1234/work", "title": "Sample study", "excerpt": "Private excerpt"}
	one := responseRow(t, request(t, a, "POST", base+"/sources", source, true), 200)
	two := responseRow(t, request(t, a, "POST", base+"/sources", source, true), 200)
	if one["id"] != two["id"] {
		t.Fatal("duplicate source on retry")
	}
	expectStatus(t, request(t, a, "GET", base+"/sources", nil, false), 401)
	expectStatus(t, request(t, a, "POST", base+"/draft/publish", Row{"revision": post["revision"]}, true), 200)
	excludesHTML(t, request(t, a, "GET", "/post/research-notes", nil, false).Body.String(), "Private excerpt", "Sample study", "10.1234")
}

func TestSavedResearchSourceOrderAndIsolation(t *testing.T) {
	a, _ := coreFixture(t)
	p1 := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-one"), true), 201)
	p2 := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("research-two"), true), 201)
	firstPath := "/api/posts/" + p1.str("id") + "/sources"
	secondPath := "/api/posts/" + p2.str("id") + "/sources"
	for _, title := range []string{"Zulu", "Alpha"} {
		source := Row{"title": title, "url": "https://example.test/" + title, "excerpt": "An abstract"}
		responseRow(t, request(t, a, "POST", firstPath, source, true), 200)
	}
	updated := responseRow(t, request(t, a, "POST", firstPath, Row{"title": "Zulu", "url": "https://example.test/Zulu", "excerpt": ""}, true), 200)
	if updated.str("excerpt") != "An abstract" {
		t.Fatal("Saving an existing URL as a manual source removed the abstract")
	}
	w := request(t, a, "GET", firstPath, nil, true)
	expectStatus(t, w, 200)
	var sources []Row
	if err := json.Unmarshal(w.Body.Bytes(), &sources); err != nil {
		t.Fatal(err)
	}
	if len(sources) != 2 || sources[0].str("title") != "Alpha" || sources[1].str("title") != "Zulu" {
		t.Fatalf("unexpected order: %v", sources)
	}
	second := request(t, a, "GET", secondPath, nil, true)
	expectStatus(t, second, 200)
	excludesHTML(t, second.Body.String(), "Alpha", "Zulu")
	for _, unsafe := range []string{"javascript:alert(1)", "https://reader:password@example.test/private"} {
		expectStatus(t, request(t, a, "POST", firstPath, Row{"title": "link", "url": unsafe, "excerpt": ""}, true), 400)
	}
}

func TestUnsavedWritingResearchRequiresOwnerAndLimitsDiscovery(t *testing.T) {
	a, _ := coreFixture(t)
	searches := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.crossref.org" || r.URL.Query().Get("rows") != "3" {
			t.Fatalf("unexpected research request: %s", r.URL)
		}
		searches++
		return fixtureResponse(Row{"message": Row{"items": []Row{}}}), nil
	})
	path := "/api/ai/research?q=evidence&limit=3"
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	if searches != 0 {
		t.Fatal("anonymous request reached Crossref")
	}
	expectStatus(t, request(t, a, "GET", path, nil, true), 200)
	if searches != 1 {
		t.Fatalf("expected one discovery, got %d", searches)
	}
}
