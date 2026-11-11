package blog

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPConsolidatedPostActions(t *testing.T) {
	a, _ := coreFixture(t)
	session := mcpTestSession(t, a, "owner")
	draft := mcpCall(t, session, "create_post", Row{"input": draftInput("consolidated")}, 201)
	live := mcpCall(t, session, "update_post", Row{"id": draft["id"], "action": "publish", "input": Row{"revision": draft["revision"]}}, 200)
	link := mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "link"}, 200)
	if link.str("url") == "" {
		t.Fatal(link)
	}
	historical := mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "revision", "revision": draft["revision"], "fields": []string{"revision", "status", "version"}}, 200)
	if historical.str("status") != "draft" || historical["version"] == nil {
		t.Fatal(historical)
	}
	staged := mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "save_draft", "input": Row{"revision": live["revision"], "content": "Pending body"}}, 200)
	mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "unpublish", "input": Row{"revision": live["revision"], "content": "Must not silently ignore"}}, 400)
	private := mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "unpublish", "fields": []string{"id", "revision", "status", "content", "draftUrl"}, "input": Row{"revision": live["revision"]}}, 200)
	if private.str("status") != "draft" || private.str("content") != "Pending body" || private.str("draftUrl") == "" {
		t.Fatal(private)
	}
	mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "link"}, 409)
	historical = mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "revision", "revision": staged["revision"]}, 200)
	if historical.str("content") != "Pending body" {
		t.Fatal(historical)
	}
	live = mcpCall(t, session, "update_post", Row{"id": private["id"], "action": "publish", "input": Row{"revision": private["revision"]}}, 200)
	testMCPDiscardAndArchive(t, session, live)
}

func testMCPDiscardAndArchive(t *testing.T, session *mcp.ClientSession, live Row) {
	t.Helper()
	staged := mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "save_draft", "input": Row{"revision": live["revision"], "title": "Discarded title"}}, 200)
	mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "discard_draft", "input": Row{"revision": staged["revision"]}}, 200)
	current := mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "draft"}, 200)
	if current.str("title") == "Discarded title" {
		t.Fatal(current)
	}
	archived := mcpCall(t, session, "update_post", Row{"id": live["id"], "action": "archive", "input": Row{"revision": live["revision"]}}, 200)
	if archived.str("status") != "archived" {
		t.Fatal(archived)
	}
	mcpCall(t, session, "get_post", Row{"id": live["id"], "view": "link", "fields": []string{"id"}}, 400)
	mcpCall(t, session, "get_post", Row{"id": live["id"], "revision": live["revision"]}, 400)
}

func TestMCPConsolidatedDiscoveryByRole(t *testing.T) {
	a, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		session := mcpTestSession(t, a, roleToken(t, a, role))
		listed, err := session.ListTools(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		assertMCPConsolidatedTools(t, listed.Tools, role)
	}
}

func assertMCPConsolidatedTools(t *testing.T, tools []*mcp.Tool, role string) {
	t.Helper()
	names := map[string]*mcp.Tool{}
	for _, tool := range tools {
		names[tool.Name] = tool
	}
	for _, old := range []string{"get_post_link", "get_post_draft", "get_revision", "update_post_draft", "publish_post_draft", "discard_post_draft", "update_post_seo"} {
		if names[old] != nil {
			t.Fatal("obsolete tool still advertised", old)
		}
	}
	if role == "owner" && len(tools) != 29 {
		t.Fatal("unexpected tool count", len(tools))
	}
	if role == "reader" {
		return
	}
	expected := []string{"save", "save_draft", "publish", "unpublish", "archive", "discard_draft"}
	if role == "writer" {
		expected = []string{"save", "save_draft", "discard_draft"}
	}
	assertMCPActions(t, names["update_post"], expected)
}

func assertMCPActions(t *testing.T, tool *mcp.Tool, expected []string) {
	t.Helper()
	data, err := json.Marshal(tool.InputSchema)
	if err != nil {
		t.Fatal(err)
	}
	var schema Row
	must(json.Unmarshal(data, &schema))
	actions := object(object(schema["properties"])["action"])["enum"].([]any)
	actual := []string{}
	for _, action := range actions {
		actual = append(actual, action.(string))
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("incorrect permitted actions", actual, expected)
	}
}

func TestMCPConsolidatedOAuthActions(t *testing.T) {
	for _, test := range []struct {
		scope   string
		actions []string
	}{
		{"content:draft", []string{"save", "save_draft", "discard_draft"}},
		{"content:publish", []string{"save", "publish", "unpublish", "archive"}},
	} {
		a := oauthFixture(t)
		_, tokens := oauthSelectedTokens(t, a, test.scope, []string{test.scope}, "https://blog.test/mcp")
		session := mcpTestSession(t, a, tokens.str("access_token"))
		listed, err := session.ListTools(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		for _, tool := range listed.Tools {
			if tool.Name == "update_post" {
				assertMCPActions(t, tool, test.actions)
			}
		}
	}
}

func TestMCPUnpublishCannotBypassRESTPermissions(t *testing.T) {
	a, _ := coreFixture(t)
	live := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "content": "Live", "status": "published"}, true), 201)
	writer := roleToken(t, a, "writer")
	original := httptest.NewRequest("POST", "http://blog.test/mcp", nil)
	original.Header.Set("Authorization", "Bearer "+writer)
	ctx := context.WithValue(context.Background(), mcpRequestKey{}, original)
	for _, operation := range mcpOperations() {
		if operation.tool.Name != "update_post" {
			continue
		}
		result := a.callMCPAPI(ctx, operation, Row{"id": live["id"], "action": "unpublish", "input": Row{"revision": live["revision"]}})
		if object(result.StructuredContent)["status"] != 403 {
			t.Fatal(result)
		}
	}
}
