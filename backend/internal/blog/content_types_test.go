package blog

import "testing"

func TestContentTypesPersistAcrossLifecycleAndRevisions(t *testing.T) {
	app, _ := coreFixture(t)
	for _, kind := range []string{"article", "guide"} {
		t.Run(kind, func(t *testing.T) {
			input := draftInput(kind)
			input["contentType"] = kind
			created := responseRow(t, request(t, app, "POST", "/api/posts", input, true), 201)
			path := "/api/posts/" + created.str("id")
			for _, status := range []string{"published", "archived", "draft"} {
				created = responseRow(t, request(t, app, "PUT", path, Row{"revision": created["revision"], "status": status}, true), 200)
				if created["contentType"] != kind {
					t.Fatal("status update lost content type", created)
				}
			}
			oldRevision := created.str("revision")
			responseRow(t, request(t, app, "PUT", path, Row{"revision": oldRevision, "contentType": "article"}, true), 200)
			historical := responseRow(t, request(t, app, "GET", path+"/revisions/"+oldRevision+"?fields=contentType", nil, true), 200)
			if historical["contentType"] != kind {
				t.Fatal("revision lost original content type", historical)
			}
		})
	}
}

func TestContentTypeDefaultsValidationAndDiscovery(t *testing.T) {
	app, _ := coreFixture(t)
	legacy := responseRow(t, request(t, app, "POST", "/api/posts", draftInput("legacy"), true), 201)
	if legacy["contentType"] != "article" || postContentType(Row{}) != "article" || postContentType(Row{"content_type": "doc"}) != "article" {
		t.Fatal("legacy content must remain article")
	}
	for _, invalid := range []any{"", "blog", "doc", "Guide", nil, 7} {
		input := draftInput("invalid")
		input["contentType"] = invalid
		expectStatus(t, request(t, app, "POST", "/api/posts", input, true), 400)
	}
	input := draftInput("guide")
	input["contentType"], input["status"] = "guide", "published"
	created := responseRow(t, request(t, app, "POST", "/api/posts", input, true), 201)
	public := responseRow(t, request(t, app, "GET", "/api/public/posts/guide?fields=contentType", nil, false), 200)
	if public["contentType"] != "guide" {
		t.Fatal(public)
	}
	for _, path := range []string{"/api/public/posts?fields=id,contentType", "/api/public/search?q=searchable&fields=id,contentType"} {
		rows := responseRows(t, request(t, app, "GET", path, nil, false))
		if len(rows) != 1 || rows[0]["id"] != created["id"] || rows[0]["contentType"] != "guide" {
			t.Fatal(path, rows)
		}
	}
}

func TestContentDesignSettingsIndependence(t *testing.T) {
	app, _ := coreFixture(t)
	theme := defaultTheme()
	theme["guide"] = defaultTheme()["article"]
	object(theme["guide"])["background"] = "#112233"
	saved := responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	if object(saved["guide"])["background"] != "#112233" || object(saved["article"])["background"] != object(theme["article"])["background"] {
		t.Fatal("type designs were not preserved", saved)
	}
	unsupported := defaultTheme()
	unsupported["doc"] = unsupported["article"]
	if _, exists := parseTheme(map[string]any(unsupported))["doc"]; exists {
		t.Fatal("unsupported design remains exposed")
	}
	unsupported["doc"] = unsupported["article"]
	expectStatus(t, request(t, app, "PUT", "/api/settings", unsupported, true), 400)
	object(theme["guide"])["background"] = "red;url(https://invalid.example)"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 400)
}

func contentCatalogFixture(t *testing.T) Row {
	t.Helper()
	catalog := templateCatalogFixture(t)
	catalog["schemaVersion"] = float64(5)
	design := object(catalog["article"].([]any)[0])["design"]
	catalog["content"] = []any{map[string]any{"id": "reference", "name": "Reference", "description": "Articles and guides", "designs": map[string]any{"guide": design, "article": design}}}
	object(catalog["writing"].([]any)[0])["supportedContentTypes"] = []any{"guide", "article"}
	return catalog
}

func TestContentTemplatesValidateSupportedCombinations(t *testing.T) {
	if !validTemplateCatalog(contentCatalogFixture(t)) {
		t.Fatal("mixed article/guide catalog rejected")
	}
	mutations := []func(Row){
		func(c Row) { object(c["content"].([]any)[0])["designs"] = map[string]any{} },
		func(c Row) { object(object(c["content"].([]any)[0])["designs"])["unknown"] = map[string]any{} },
		func(c Row) { object(c["writing"].([]any)[0])["supportedContentTypes"] = []any{"guide", "guide"} },
		func(c Row) { object(c["writing"].([]any)[0])["supportedContentTypes"] = []any{} },
		func(c Row) { object(c["writing"].([]any)[0])["supportedContentTypes"] = []any{"unknown"} },
		func(c Row) { object(c["writing"].([]any)[0])["supportedContentTypes"] = []any{"doc"} },
		func(c Row) { object(object(c["content"].([]any)[0])["designs"])["doc"] = map[string]any{} },
	}
	for _, mutate := range mutations {
		catalog := contentCatalogFixture(t)
		mutate(catalog)
		if validTemplateCatalog(catalog) {
			t.Fatal("invalid content compatibility accepted", catalog)
		}
	}
}
