package blog

import (
	"encoding/json"
	cli "margin-cli"
	"strings"
	"testing"
)

func TestPublicAuthoringGuideMatchesOfflineSkill(t *testing.T) {
	app, _ := coreFixture(t)
	expected, err := cli.AuthoringGuide()
	if err != nil {
		t.Fatal(err)
	}
	w := request(t, app, "GET", "/authoring.md", nil, false)
	expectStatus(t, w, 200)
	if w.Body.String() != string(expected) || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/markdown") {
		t.Fatal("guide differs from offline skill")
	}
	catalog, err := cli.AuthoringBlocks()
	if err != nil {
		t.Fatal(err)
	}
	w = request(t, app, "GET", "/authoring-blocks.json", nil, false)
	expectStatus(t, w, 200)
	if w.Body.String() != string(catalog) {
		t.Fatal("catalog differs from offline skill")
	}
	response := responseRow(t, request(t, app, "GET", "/api/public/authoring", nil, false), 200)
	if response.str("markdown") != string(expected) || len(response["blocks"].([]any)) != 5 {
		t.Fatal("incomplete authoring API")
	}
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		expectStatus(t, tokenRequest(app, roleToken(t, app, role), "GET", "/api/public/authoring", nil), 200)
	}
}

func TestAuthoringDiscoveryRespectsMountPath(t *testing.T) {
	app, _ := coreFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	response := responseRow(t, request(t, app, "GET", "/blog/api/public/authoring", nil, false), 200)
	if response.str("guideUrl") != "/blog/authoring.md" || response.str("catalogUrl") != "/blog/authoring-blocks.json" {
		t.Fatal("unmounted reference links")
	}
	for _, path := range []string{response.str("guideUrl"), response.str("catalogUrl")} {
		expectStatus(t, request(t, app, "GET", path, nil, false), 200)
	}
	index := request(t, app, "GET", "/blog/llms.txt", nil, false)
	expectStatus(t, index, 200)
	requireReadableText(t, index.Body.String(), "http://blog.test/blog/authoring.md", "http://blog.test/blog/authoring-blocks.json", "http://blog.test/blog/api/public/authoring")
	spec := responseRow(t, request(t, app, "GET", "/blog/openapi.json", nil, false), 200)
	if object(spec["externalDocs"]).str("url") != "/blog/authoring.md" {
		t.Fatal("OpenAPI docs must use mount path")
	}
}

func TestAuthoringOpenAPIContract(t *testing.T) {
	var spec Row
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	operation := object(object(object(spec["paths"])["/api/public/authoring"])["get"])
	if operation.str("operationId") != "getAuthoringGuide" {
		t.Fatal("authoring tool is missing")
	}
	if security, exists := operation["security"]; exists && len(security.([]any)) != 0 {
		t.Fatal("static authoring reference should not require auth")
	}
}
