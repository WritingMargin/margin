package blog

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type mcpOperation struct {
	method, path string
	parameters   []mcpParameter
	tool         *mcp.Tool
}
type mcpParameter struct {
	Name        string         `json:"name"`
	In          string         `json:"in"`
	Required    bool           `json:"required"`
	Description string         `json:"description"`
	Schema      map[string]any `json:"schema"`
}
type mcpRequestBody struct {
	Ref     string `json:"$ref"`
	Content map[string]struct {
		Schema map[string]any `json:"schema"`
	} `json:"content"`
}
type mcpAPIOperation struct {
	OperationID string         `json:"operationId"`
	Summary     string         `json:"summary"`
	Description string         `json:"description"`
	Parameters  []mcpParameter `json:"parameters"`
	RequestBody mcpRequestBody `json:"requestBody"`
}

// Keep the native tools deliberately scoped to authoring and design. New REST routes do
// not become tools automatically. Input schemas come from the same API contract.
func mcpOperations() []mcpOperation {
	var spec struct {
		Paths      map[string]map[string]mcpAPIOperation `json:"paths"`
		Components struct {
			Schemas       map[string]any            `json:"schemas"`
			RequestBodies map[string]mcpRequestBody `json:"requestBodies"`
		} `json:"components"`
	}
	must(json.Unmarshal(openAPISpec, &spec))
	definitions := []struct{ name, method, path string }{
		{"audit_article", "POST", "/api/posts/audit"},
		{"list_posts", "GET", "/api/posts/page"},
		{"search_posts", "GET", "/api/posts/search"},
		{"get_post", "GET", "/api/posts/{id}"},
		{"create_post", "POST", "/api/posts"},
		{"update_post", "PUT", "/api/posts/{id}"},
		{"list_revisions", "GET", "/api/posts/{id}/revisions"},
		{"search_publications", "GET", "/api/posts/{id}/research"},
		{"list_research_sources", "GET", "/api/posts/{id}/sources"},
		{"save_research_source", "POST", "/api/posts/{id}/sources"},
		{"list_thinking_notes", "GET", "/api/posts/{id}/writing-notes"},
		{"save_thinking_note", "POST", "/api/posts/{id}/writing-notes"},
		{"list_images", "GET", "/api/media/images"},
		{"upload_image", "POST", "/api/media/images"},
		{"preview_link", "POST", "/api/media/preview"},
		{"list_audio", "GET", "/api/media/audio"},
		{"upload_audio", "POST", "/api/media/audio"},
		{"list_videos", "GET", "/api/media/videos"},
		{"upload_video", "POST", "/api/media/videos"},
		{"get_blog_design", "GET", "/api/settings/design"},
		{"update_blog_design", "PUT", "/api/settings/design"},
		{"validate_blog_design", "POST", "/api/settings/design/validate"},
		{"list_search_console_properties", "GET", "/api/settings/publishing/google/properties"},
		{"submit_google_sitemap", "POST", "/api/settings/publishing/google/submit"},
		{"inspect_google_article", "POST", "/api/settings/publishing/google/inspect"},
		{"get_author_profile", "GET", "/api/settings/profile"},
		{"update_author_profile", "PUT", "/api/settings/profile"},
		{"get_site_seo", "GET", "/api/settings/seo"},
		{"update_site_seo", "PUT", "/api/settings/seo"},
	}
	rename := mcpOperationNames(spec.Paths, definitions)
	var operations []mcpOperation
	for _, definition := range definitions {
		source, exists := spec.Paths[definition.path][strings.ToLower(definition.method)]
		if !exists {
			panic("Missing MCP API contract: " + definition.name)
		}
		requestBody := source.RequestBody
		if requestBody.Ref != "" {
			requestBody = spec.Components.RequestBodies[strings.TrimPrefix(requestBody.Ref, "#/components/requestBodies/")]
		}
		_, jsonBody := requestBody.Content["application/json"]
		// MCP always sends the JSON body, so raw-bytes upload options cannot be used.
		binaryAlternative := jsonBody && len(requestBody.Content) > 1
		properties, required, parameters := mcpParameters(source.Parameters, spec.Components.Schemas, binaryAlternative, rename)
		if jsonBody {
			schema := mcpJSONSchema(requestBody.Content["application/json"].Schema, spec.Components.Schemas).(map[string]any)
			properties["input"] = schema
			required = append(required, "input")
		}
		description := strings.ReplaceAll(source.Description, "call getAuthoringGuide", "read the margin://authoring/guide resource")
		if binaryAlternative {
			description = mcpRawUploadSentence.ReplaceAllString(description, "Over MCP, send base64 JSON only; for files over 10 MiB use the binary REST upload instead.")
		}
		description = rename(description)
		destructive := definition.method == "PUT" || definition.name == "save_research_source"
		operations = append(operations, mcpOperation{
			method: definition.method, path: definition.path, parameters: parameters,
			tool: &mcp.Tool{Name: definition.name, Title: source.Summary, Description: description,
				InputSchema: map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false},
				Annotations: &mcp.ToolAnnotations{ReadOnlyHint: definition.method == "GET" || (definition.name == "audit_article" || definition.name == "validate_blog_design"), DestructiveHint: &destructive, IdempotentHint: definition.name == "save_research_source"},
			},
		})
	}
	return operations
}

var mcpRawUploadSentence = regexp.MustCompile(`Alternatively send raw [^.]*\.`)
var mcpCamelCaseWord = regexp.MustCompile(`\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b`)

// REST operation IDs that are not tools of their own map to the MCP view or action.
var mcpOperationAliases = map[string]string{
	"getAuthoringGuide": "the margin://authoring/guide resource",
	"readPostDraft":     "get_post with view=draft",
	"updatePostDraft":   "update_post with action=save_draft",
	"publishPostDraft":  "update_post with action=publish",
	"discardPostDraft":  "update_post with action=discard_draft",
	"previewPost":       "get_post with view=preview",
	"getPostLink":       "get_post with view=link",
	"readRevision":      "get_post with view=revision",
	"deletePost":        "delete post via REST",
}

// Contract descriptions name REST operation IDs (readPost, uploadImage). MCP clients
// cannot call those names, so rewrite each to its tool, view/action or REST route.
// Only camelCase words are considered, so ordinary words and field names are kept.
func mcpOperationNames(paths map[string]map[string]mcpAPIOperation, definitions []struct{ name, method, path string }) func(string) string {
	names := map[string]string{}
	for path, methods := range paths {
		for method, operation := range methods {
			if operation.OperationID != "" {
				names[operation.OperationID] = "the REST " + strings.ToUpper(method) + " " + path + " endpoint"
			}
		}
	}
	for _, definition := range definitions {
		if operation, exists := paths[definition.path][strings.ToLower(definition.method)]; exists && operation.OperationID != "" {
			names[operation.OperationID] = definition.name
		}
	}
	for id, alias := range mcpOperationAliases {
		names[id] = alias
	}
	return func(text string) string {
		return mcpCamelCaseWord.ReplaceAllStringFunc(text, func(word string) string {
			if name, exists := names[word]; exists {
				return name
			}
			return word
		})
	}
}

// Resolve the contract's local references and omit defaults: an omitted update
// field must remain omitted. Do not fetch schema references over the network.
func mcpJSONSchema(value any, schemas map[string]any) any {
	switch v := value.(type) {
	case map[string]any:
		return mcpSchemaObject(v, schemas)
	case []any:
		result := make([]any, len(v))
		for i, item := range v {
			result[i] = mcpJSONSchema(item, schemas)
		}
		return result
	default:
		return value
	}
}

func mcpSchemaObject(v map[string]any, schemas map[string]any) any {
	if ref, ok := v["$ref"].(string); ok {
		name, local := strings.CutPrefix(ref, "#/components/schemas/")
		schema, exists := schemas[name]
		if !local || !exists {
			panic(fmt.Sprintf("Unknown MCP schema reference %q", ref))
		}
		return mcpJSONSchema(schema, schemas)
	}
	result := map[string]any{}
	for key, item := range v {
		if key != "default" && key != "nullable" {
			result[key] = mcpJSONSchema(item, schemas)
		}
	}
	if v["nullable"] == true {
		if typ, ok := result["type"].(string); ok {
			result["type"] = []string{typ, "null"}
		}
	}
	return result
}

func mcpParameters(source []mcpParameter, schemas map[string]any, binaryAlternative bool, rename func(string) string) (map[string]any, []string, []mcpParameter) {
	properties := map[string]any{}
	required := []string{}
	parameters := []mcpParameter{}
	for _, parameter := range source {
		if binaryAlternative && parameter.In == "query" && strings.Contains(parameter.Description, "binary uploads only") {
			continue
		}
		parameters = append(parameters, parameter)
		schema := mcpJSONSchema(parameter.Schema, schemas).(map[string]any)
		description := parameter.Description
		if schema["type"] == "array" {
			// Arguments are JSON arrays; only the REST query string is comma-separated.
			description = strings.Replace(description, "comma-separated", "list of", 1)
		}
		schema["description"] = rename(description)
		properties[parameter.Name] = schema
		if parameter.Required {
			required = append(required, parameter.Name)
		}
	}
	return properties, required, parameters
}
