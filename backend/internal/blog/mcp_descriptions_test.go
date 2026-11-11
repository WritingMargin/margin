package blog

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Tool text must only name things an MCP client can call: no REST operation IDs,
// no raw-bytes upload options and no comma-separated array arguments.
func TestMCPToolDescriptionsUseMCPNames(t *testing.T) {
	var spec struct {
		Paths map[string]map[string]mcpAPIOperation `json:"paths"`
	}
	must(json.Unmarshal(openAPISpec, &spec))
	operationIDs := restOperationIDs(spec.Paths)
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		session := mcpTestSession(t, app, roleToken(t, app, role))
		listed, err := session.ListTools(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		assertMCPDescriptions(t, role, listed.Tools, operationIDs)
		if role == "writer" {
			assertMCPWriterDescriptions(t, listed.Tools)
		}
		if role == "owner" {
			assertMCPDescriptionPhrases(t, listed.Tools, map[string]string{"get_site_seo": "returned by get_post", "update_blog_design": "from get_blog_design", "update_site_seo": "Read get_site_seo first"})
		}

	}
}

// Binary-only parameters are hidden from MCP, but JSON uploads keep their title.
func TestMCPUploadKeepsJSONTitle(t *testing.T) {
	app, _ := coreFixture(t)
	session := mcpTestSession(t, app, roleToken(t, app, "writer"))
	input := videoAPIInput("video/mp4")
	input["title"] = "Launch demo"
	mcpCall(t, session, "upload_video", Row{"input": input}, 201)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "upload_video", Arguments: Row{"title": "query only", "input": videoAPIInput("video/mp4")}})
	if err == nil && !result.IsError {
		t.Fatal("binary-only title parameter was accepted over MCP")
	}
}

func restOperationIDs(paths map[string]map[string]mcpAPIOperation) map[string]bool {
	operationIDs := map[string]bool{}
	for _, methods := range paths {
		for _, operation := range methods {
			if operation.OperationID != "" && operation.OperationID != strings.ToLower(operation.OperationID) {
				operationIDs[operation.OperationID] = true
			}
		}
	}
	return operationIDs
}

func assertMCPDescriptions(t *testing.T, role string, tools []*mcp.Tool, operationIDs map[string]bool) {
	t.Helper()
	for _, tool := range tools {
		schema, _ := json.Marshal(tool.InputSchema)
		text := tool.Description + " " + string(schema)
		for _, word := range regexp.MustCompile(`[A-Za-z][A-Za-z0-9]*`).FindAllString(text, -1) {
			if operationIDs[word] {
				t.Fatalf("role %s tool %s names REST operation %q", role, tool.Name, word)
			}
		}
		for _, banned := range []string{"comma-separated", "Alternatively send raw", "title query parameter", "binary uploads only"} {
			if strings.Contains(text, banned) {
				t.Fatalf("role %s tool %s still mentions %q", role, tool.Name, banned)
			}
		}
	}
}

func assertMCPWriterDescriptions(t *testing.T, tools []*mcp.Tool) {
	t.Helper()
	for _, tool := range tools {
		if tool.Name != "upload_audio" && tool.Name != "upload_video" {
			continue
		}
		properties := tool.InputSchema.(map[string]any)["properties"].(map[string]any)
		if _, exists := properties["title"]; exists || !strings.Contains(tool.Description, "Over MCP, send base64 JSON only") {
			t.Fatalf("%s still offers binary-only options: %s", tool.Name, tool.Description)
		}
	}
	assertMCPDescriptionPhrases(t, tools, map[string]string{"update_post": "get_post with view=preview", "upload_image": "then call update_post", "upload_video": "then update_post"})
}

func assertMCPDescriptionPhrases(t *testing.T, tools []*mcp.Tool, phrases map[string]string) {
	t.Helper()
	descriptions := map[string]string{}
	for _, tool := range tools {
		descriptions[tool.Name] = tool.Description
	}
	for name, phrase := range phrases {
		if !strings.Contains(descriptions[name], phrase) {
			t.Fatalf("%s description lacks %q", name, phrase)
		}
	}
}
