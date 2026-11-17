package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const mcpPeerAttachmentMaxBytes = 1 << 20

func mcpPeerAttachmentOperation() mcpOperation {
	operation := mcpPeerOperation("get_peer_review_attachment", "Read an assigned review attachment", "Read a referenced attachment from your assigned article. Use kind and id from the attachment URL in open_peer_review: documents -> document, covers -> cover, assets/*.png -> image, audio/videos -> audio/video, models -> model (include its extension). Returns base64 bytes, MIME type and Content-Range; default chunk is 256 KiB, maximum 1 MiB. Increment offset to read more. Unreferenced files and other articles are denied; arbitrary URLs are not accepted.", "POST", "/api/public/reviews/{invite}/open", nil, nil)
	schema := operation.tool.InputSchema.(map[string]any)
	properties := schema["properties"].(map[string]any)
	properties["kind"] = map[string]any{"type": "string", "enum": []string{"document", "cover", "image", "audio", "video", "model"}}
	properties["id"] = mcpPeerString(1, 100)
	properties["offset"] = map[string]any{"type": "integer", "minimum": 0, "maximum": 2147483647}
	properties["length"] = map[string]any{"type": "integer", "minimum": 1, "maximum": mcpPeerAttachmentMaxBytes}
	schema["required"] = []string{"invite", "kind", "id"}
	operation.tool.Annotations.ReadOnlyHint = true
	return operation
}
func mcpPeerAttachmentPath(kind, id string) string {
	paths := map[string]string{"document": "/api/public/documents/", "cover": "/api/public/covers/", "image": "/api/assets/", "audio": "/api/public/audio/", "video": "/api/public/videos/", "model": modelAddress}
	prefix, ok := paths[kind]
	if !ok {
		fail(400, "Choose a supported review attachment kind.")
	}
	if kind == "model" {
		if !modelFileID.MatchString(id) {
			fail(400, "Use the model filename returned in the article.")
		}
	} else if !uuidRE.MatchString(id) {
		fail(400, "Use the attachment ID returned in the article.")
	}
	suffix := ""
	if kind == "image" {
		suffix = ".png"
	}
	return prefix + id + suffix
}
func mcpAttachmentInteger(input map[string]any, key string, fallback, min, max int) int {
	value, present := input[key]
	if !present {
		return fallback
	}
	n, ok := value.(float64)
	if !ok || math.Trunc(n) != n || n < float64(min) || n > float64(max) {
		fail(400, "Use a valid attachment byte range.")
	}
	return int(n)
}
func (a *App) callMCPPeerAttachment(ctx context.Context, input map[string]any) *mcp.CallToolResult {
	original, ok := ctx.Value(mcpRequestKey{}).(*http.Request)
	if !ok {
		return mcpAPIResult(401, Row{"error": "Missing request authorization."})
	}
	fields := Row(input)
	invite := stringField(fields, "invite", 1, 100, false)
	kind := stringField(fields, "kind", 1, 20, false)
	id := stringField(fields, "id", 1, 100, false)
	path := mcpPeerAttachmentPath(kind, id)
	query := url.Values{"preview": {invite}}
	if kind == "document" {
		query = url.Values{"review": {invite}}
	}
	request, err := http.NewRequestWithContext(ctx, "GET", path+"?"+query.Encode(), nil)
	must(err)
	request.Host, request.TLS = original.Host, original.TLS
	request.Header.Set("Authorization", original.Header.Get("Authorization"))
	// Check the invitation and exact article reference even if the file happens
	// to be public elsewhere. The fixed dispatcher never accepts a caller URL.
	a.activePeer(request, invite)
	a.requireMCPPeerAttachment(request, kind, id)
	request.URL.Path = sitePath(path)
	offset := mcpAttachmentInteger(input, "offset", 0, 0, 2147483647)
	length := mcpAttachmentInteger(input, "length", 256<<10, 1, mcpPeerAttachmentMaxBytes)
	request.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", offset, int64(offset)+int64(length)-1))
	response := &mcpPeerAttachmentResponse{mcpAPIResponse: mcpAPIResponse{header: make(http.Header), status: 200}, limit: length}
	a.ServeHTTP(response, request)
	if response.oversized {
		return mcpAPIResult(413, Row{"error": "This attachment cannot be read within the requested byte limit."})
	}
	if response.status >= 400 {
		var payload any
		if json.Unmarshal(response.body.Bytes(), &payload) != nil {
			payload = Row{"error": "The review attachment could not be read."}
		}
		return mcpAPIResult(response.status, payload)
	}
	return mcpAPIResult(response.status, Row{"mimeType": response.header.Get("Content-Type"), "encoding": "base64", "data": base64.StdEncoding.EncodeToString(response.body.Bytes()), "offset": offset, "returnedBytes": response.body.Len(), "contentRange": response.header.Get("Content-Range")})
}
func (a *App) requireMCPPeerAttachment(r *http.Request, kind, id string) {
	allowed := false
	if kind == "document" {
		allowed = a.peerDocumentAllowed(r, id)
	} else {
		allowed = a.previewMediaAllowed(r)
	}
	if !allowed {
		fail(404, "Attachment is not referenced by this assigned article.")
	}
}

type mcpPeerAttachmentResponse struct {
	mcpAPIResponse
	limit     int
	oversized bool
}

func (w *mcpPeerAttachmentResponse) Write(data []byte) (int, error) {
	if w.body.Len()+len(data) > w.limit {
		w.oversized = true
		return 0, io.ErrShortBuffer
	}
	return w.mcpAPIResponse.Write(data)
}
