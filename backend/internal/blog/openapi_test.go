package blog

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
)

type testOpenAPISpec struct {
	Paths map[string]map[string]struct {
		Security   []Row    `json:"security"`
		Roles      []string `json:"x-token-roles"`
		Parameters []struct {
			Name   string `json:"name"`
			Schema struct {
				Items struct {
					Enum []string `json:"enum"`
				} `json:"items"`
			} `json:"schema"`
		} `json:"parameters"`
		Responses map[string]struct {
			Content map[string]struct {
				Schema map[string]any `json:"schema"`
			} `json:"content"`
		} `json:"responses"`
	} `json:"paths"`
	Components struct {
		Schemas map[string]struct {
			Properties map[string]any `json:"properties"`
		} `json:"schemas"`
	} `json:"components"`
}

func TestOpenAPIContractMatchesRoutesFieldsAndRoles(t *testing.T) {
	a, _ := coreFixture(t)
	var spec testOpenAPISpec
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for path, methods := range spec.Paths {
		for method, op := range methods {
			pattern := strings.ToUpper(method) + " " + path
			seen[pattern] = true
			r := httptest.NewRequest(strings.ToUpper(method), path, nil)
			_, actual := a.mux.Handler(r)
			if actual != pattern {
				t.Fatalf("documented route %s resolves to %s", pattern, actual)
			}
			testDocumentedRoles(t, pattern, len(op.Security) != 0, op.Roles)
			fields := ""
			for _, parameter := range op.Parameters {
				if parameter.Name == "fields" {
					fields = strings.Join(parameter.Schema.Items.Enum, ",")
				}
			}
			if fields != postResponseFields[pattern] {
				t.Fatalf("field drift for %s: %s", pattern, fields)
			}
			if fields == "" {
				continue
			}
			code := "200"
			if _, created := op.Responses["201"]; created {
				code = "201"
			}
			testDocumentedResponse(t, spec, pattern, fields, op.Responses[code].Content["application/json"].Schema)
		}
	}
	assertDocumentedFieldRoutes(t, seen)
}

func testDocumentedRoles(t *testing.T, pattern string, secured bool, got []string) {
	t.Helper()
	if !secured {
		if !strings.Contains(pattern, " /api/public/") {
			t.Fatalf("missing API key requirement for %s", pattern)
		}
		return
	}
	want := []string{}
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		if tokenRouteAllowed(role, pattern) {
			want = append(want, role)
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("role drift for %s: got %v want %v", pattern, got, want)
	}
}

func TestSwaggerDocsMountAndAssets(t *testing.T) {
	a, _ := coreFixture(t)
	a.Web = fstest.MapFS{
		"swagger-ui/swagger-ui-bundle.js": &fstest.MapFile{Data: []byte("/* bundled Swagger UI */")},
		"swagger-ui/swagger-ui.css":       &fstest.MapFile{Data: []byte("/* stylesheet */")},
		"swagger-ui/LICENSE":              &fstest.MapFile{Data: []byte("Apache License")},
	}
	for _, base := range []string{"", "/blog"} {
		t.Run(base, func(t *testing.T) {
			t.Setenv("MARGIN_BASE_PATH", base)
			w := request(t, a, "GET", base+"/openapi.json", nil, false)
			spec := responseRow(t, w, 200)
			want := base
			if want == "" {
				want = "/"
			}
			server := spec["servers"].([]any)[0].(map[string]any)["url"]
			if server != want || spec.str("openapi") != "3.0.0" {
				t.Fatal(spec)
			}
			if w.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
				t.Fatal(w.Header())
			}
			redirect := request(t, a, "GET", base+"/swagger", nil, false)
			expectStatus(t, redirect, 308)
			if redirect.Header().Get("Location") != base+"/swagger/" {
				t.Fatal(redirect.Header())
			}
			html := request(t, a, "GET", base+"/swagger/", nil, false)
			expectStatus(t, html, 200)
			containsHTML(t, html.Body.String(), `src="./swagger-ui-bundle.js"`, `src="./swagger-init.js"`)
			for _, asset := range []string{"swagger-init.js", "swagger-ui-bundle.js", "swagger-ui.css", "LICENSE"} {
				expectStatus(t, request(t, a, "GET", base+"/swagger/"+asset, nil, false), 200)
			}
			head := request(t, a, "HEAD", base+"/openapi.json", nil, false)
			expectStatus(t, head, 200)
			if head.Body.Len() != 0 {
				t.Fatal("HEAD returned a body")
			}
			expectStatus(t, request(t, a, "GET", base+"/swagger/private-file", nil, false), 404)
			expectStatus(t, request(t, a, "GET", base+"/api/posts", nil, false), 401)
		})
	}
	a.Web = nil
	expectStatus(t, request(t, a, "GET", "/swagger/swagger-ui-bundle.js", nil, false), 503)
}

func testDocumentedResponse(t *testing.T, spec testOpenAPISpec, pattern, fields string, schema map[string]any) {
	t.Helper()
	if schema["type"] == "array" {
		schema = schema["items"].(map[string]any)
	}
	name := strings.TrimPrefix(schema["$ref"].(string), "#/components/schemas/")
	properties := spec.Components.Schemas[name].Properties
	if len(properties) != len(strings.Split(fields, ",")) {
		t.Fatalf("response schema fields drift for %s", pattern)
	}
	for _, field := range strings.Split(fields, ",") {
		if _, ok := properties[field]; !ok {
			t.Fatalf("%s missing response property %s", pattern, field)
		}
	}
}

func assertDocumentedFieldRoutes(t *testing.T, seen map[string]bool) {
	t.Helper()
	for pattern := range postResponseFields {
		if !seen[pattern] {
			t.Fatalf("undocumented fields route %s", pattern)
		}
	}
}
