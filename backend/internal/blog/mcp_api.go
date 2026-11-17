package blog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Dispatch only fixed, allowlisted API operations in-process. Going through
// ServeHTTP preserves authorization, validation, revision conflicts and hooks.
// Never forward cookies or let tool arguments choose a URL or HTTP method.
func (a *App) callMCPAPI(ctx context.Context, operation mcpOperation, input map[string]any) (result *mcp.CallToolResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err := responseError(recovered)
			result = mcpAPIResult(err.Status, Row{"error": err.Message, "code": err.Code})
		}
	}()
	if operation.tool.Name == "get_peer_review_attachment" {
		return a.callMCPPeerAttachment(ctx, input)
	}
	original, ok := ctx.Value(mcpRequestKey{}).(*http.Request)
	if !ok {
		return mcpAPIResult(401, Row{"error": "Missing request authorization."})
	}
	input = mcpDefaultPostFields(operation, input)
	operation, input = resolveMCPPostOperation(operation, input)
	target, err := mcpAPITarget(operation, input)
	if err != nil {
		return mcpAPIResult(400, Row{"error": err.Error()})
	}
	var data []byte
	if value, exists := input["input"]; exists {
		data, _ = json.Marshal(value)
	}
	request, err := http.NewRequestWithContext(ctx, operation.method, target, bytes.NewReader(data))
	if err != nil {
		return mcpAPIResult(400, Row{"error": "Invalid request arguments."})
	}
	request.Host = original.Host
	// Keep the original scheme for canonical links when PUBLIC_URL is unset.
	// The origin helper honors forwarded protocol only when TRUST_PROXY is enabled.
	request.TLS = original.TLS
	request.Header.Set("X-Forwarded-Proto", original.Header.Get("X-Forwarded-Proto"))
	request.Header.Set("Authorization", original.Header.Get("Authorization"))
	if data != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response := &mcpAPIResponse{header: make(http.Header), status: 200}
	a.ServeHTTP(response, request)
	var payload any
	if json.Unmarshal(response.body.Bytes(), &payload) != nil {
		return mcpAPIResult(500, Row{"error": "The API returned an unexpected response."})
	}
	return mcpAPIResult(response.status, payload)
}

func mcpAPITarget(operation mcpOperation, input map[string]any) (string, error) {
	path, query := operation.path, url.Values{}
	for _, parameter := range operation.parameters {
		value, exists := input[parameter.Name]
		if !exists {
			continue
		}
		if parameter.In == "path" {
			text := fmt.Sprint(value)
			if text == "" || text == "." || text == ".." || strings.ContainsAny(text, "/\\") {
				return "", fmt.Errorf("invalid path parameter")
			}
			path = strings.ReplaceAll(path, "{"+parameter.Name+"}", url.PathEscape(text))
		} else if parameter.In == "query" {
			query.Set(parameter.Name, mcpQueryValue(value))
		}
	}
	return sitePath(path) + "?" + query.Encode(), nil
}

func mcpQueryValue(value any) string {
	if values, ok := value.([]any); ok {
		items := make([]string, len(values))
		for i, item := range values {
			items[i] = fmt.Sprint(item)
		}
		return strings.Join(items, ",")
	}
	return fmt.Sprint(value)
}

func mcpAPIResult(status int, payload any) *mcp.CallToolResult {
	output := Row{"status": status, "data": payload}
	return &mcp.CallToolResult{IsError: status >= 400, StructuredContent: output, Content: []mcp.Content{&mcp.TextContent{Text: encode(output)}}}
}

type mcpAPIResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *mcpAPIResponse) Header() http.Header            { return w.header }
func (w *mcpAPIResponse) WriteHeader(status int)         { w.status = status }
func (w *mcpAPIResponse) Write(data []byte) (int, error) { return w.body.Write(data) }

// Compact defaults belong to MCP; REST clients retain their full response contract.
func mcpDefaultPostFields(operation mcpOperation, input map[string]any) map[string]any {
	if operation.tool.Name != "update_post" && operation.tool.Name != "create_post" {
		return input
	}
	if _, exists := input["fields"]; exists || input["action"] == "discard_draft" {
		return input
	}
	next := map[string]any{}
	for key, value := range input {
		next[key] = value
	}
	next["fields"] = []any{"id", "title", "slug", "status", "revision", "updatedAt", "draftUrl", "baseRevision", "publicationState", "warnings"}
	return next
}
