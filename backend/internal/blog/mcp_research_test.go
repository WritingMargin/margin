package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPResearchStaysWithTheSelectedDraft(t *testing.T) {
	app, _ := coreFixture(t)
	writerToken := roleToken(t, app, "writer")
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	writer := mcpTestSession(t, app, writerToken)
	draft := mcpCall(t, writer, "create_post", Row{"input": draftInput("research-mcp")}, 201)
	other := mcpCall(t, writer, "create_post", Row{"input": draftInput("unrelated-mcp")}, 201)
	postID := draft.str("id")
	verifyMCPResearchSource(t, app, writer, postID)
	for _, name := range []string{"list_research_sources", "list_thinking_notes"} {
		if got := mcpResearchRows(t, writer, name, Row{"id": other.str("id")}); len(got) != 0 {
			t.Fatal(name, got)
		}
	}
	verifyMCPThinkingNotes(t, writer, postID)
	current := mcpCall(t, writer, "get_post", Row{"id": postID, "view": "draft"}, 200)
	if current.str("status") != "draft" || current.str("revision") != draft.str("revision") {
		t.Fatal(current)
	}
	mcpCall(t, writer, "search_publications", Row{"id": uuid(), "q": "sleep & memory", "limit": 3}, 404)
}

func verifyMCPResearchSource(t *testing.T, app *App, writer *mcp.ClientSession, postID string) {
	t.Helper()
	app.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.crossref.org" || r.URL.Query().Get("query.bibliographic") != "sleep & memory" || r.URL.Query().Get("rows") != "3" {
			t.Fatal(r.URL)
		}
		return fixtureResponse(Row{"message": Row{"items": []Row{{"DOI": "10.1000/study", "title": []string{"Sleep study"}, "abstract": "<jats:p>One finding.</jats:p>"}}}}), nil
	})
	hits := mcpResearchRows(t, writer, "search_publications", Row{"id": postID, "q": "sleep & memory", "limit": 3})
	if len(hits) != 1 || hits[0].str("excerpt") != "One finding." {
		t.Fatal(hits)
	}
	saved := mcpCall(t, writer, "save_research_source", Row{"id": postID, "input": hits[0]}, 200)
	retry := mcpCall(t, writer, "save_research_source", Row{"id": postID, "input": Row{"url": saved["url"], "title": "A more descriptive title"}}, 200)
	if retry.str("id") != saved.str("id") || retry.str("excerpt") != saved.str("excerpt") {
		t.Fatal(retry)
	}
	mcpCall(t, writer, "save_research_source", Row{"id": postID, "input": Row{"url": "javascript:unsafe", "title": "Invalid"}}, 400)
	if got := mcpResearchRows(t, writer, "list_research_sources", Row{"id": postID}); len(got) != 1 || got[0].str("id") != saved.str("id") {
		t.Fatal(got)
	}
}

func verifyMCPThinkingNotes(t *testing.T, session *mcp.ClientSession, postID string) {
	t.Helper()
	saved := mcpCall(t, session, "save_thinking_note", Row{"id": postID, "input": Row{"body": "Confirm sample selection.", "reason": "Eligibility criteria could affect interpretation."}}, 201)
	note := object(saved["note"])
	if saved.str("postId") != postID || note.str("title") != "Thinking note" || note.str("reason") == "" || note.yes("includedDraft") {
		t.Fatal(saved)
	}
	list := mcpResearchRows(t, session, "list_thinking_notes", Row{"id": postID})
	if len(list) != 1 || list[0].str("id") != saved.str("id") {
		t.Fatal(list)
	}
}
func mcpResearchRows(t *testing.T, session *mcp.ClientSession, name string, args Row) []Row {
	t.Helper()
	result := mcpCall(t, session, name, args, 200)
	items, ok := result["data"].([]any)
	if !ok {
		t.Fatalf("%s did not return an array: %v", name, result)
	}
	rows := make([]Row, 0, len(items))
	for _, item := range items {
		rows = append(rows, object(item))
	}
	return rows
}

func TestMCPResearchDiscoveryMatchesOAuthScopes(t *testing.T) {
	cases := []struct {
		scope       string
		read, write bool
	}{{"content:read", true, false}, {"content:draft", false, true}, {"settings:manage", false, false}}
	for _, tc := range cases {
		t.Run(tc.scope, func(t *testing.T) {
			a := oauthFixture(t)
			_, tokens := oauthSelectedTokens(t, a, tc.scope, []string{tc.scope}, "https://blog.test/mcp")
			session := mcpTestSession(t, a, tokens.str("access_token"))
			listed, err := session.ListTools(context.Background(), nil)
			if err != nil {
				t.Fatal(err)
			}
			tools := map[string]*mcp.Tool{}
			for _, tool := range listed.Tools {
				tools[tool.Name] = tool
			}
			for name, want := range map[string]bool{"search_publications": tc.read, "list_research_sources": tc.read, "list_thinking_notes": tc.read, "save_research_source": tc.write, "save_thinking_note": tc.write} {
				if (tools[name] != nil) != want {
					t.Fatal(name, tools[name])
				}
			}
		})
	}
}

func TestMCPResearchSchemasRequireDraftAndValidateInputs(t *testing.T) {
	app, _ := coreFixture(t)
	session := mcpTestSession(t, app, roleToken(t, app, "writer"))
	listed, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	required := map[string][]string{"search_publications": {"id", "q"}, "list_research_sources": {"id"}, "save_research_source": {"id", "input"}, "list_thinking_notes": {"id"}, "save_thinking_note": {"id", "input"}}
	for _, tool := range listed.Tools {
		if fields, ok := required[tool.Name]; ok {
			var schema struct{ Required []string }
			data, err := json.Marshal(tool.InputSchema)
			must(err)
			must(json.Unmarshal(data, &schema))
			if !reflect.DeepEqual(schema.Required, fields) {
				t.Fatal(tool.Name, schema.Required)
			}
			delete(required, tool.Name)
		}
	}
	if len(required) != 0 {
		t.Fatal(required)
	}
	for _, tc := range []struct {
		name string
		args Row
	}{
		{"search_publications", Row{"q": "missing post"}},
		{"search_publications", Row{"id": uuid(), "q": "query", "limit": 5}},
		{"save_thinking_note", Row{"id": uuid(), "input": Row{"title": "Missing note body"}}},
		{"save_research_source", Row{"id": uuid(), "input": Row{"url": "https://example.test", "title": strings.Repeat("x", 501)}}},
	} {
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: tc.name, Arguments: tc.args})
		if err == nil && (!result.IsError || result.StructuredContent != nil) {
			t.Fatalf("invalid %s input accepted", tc.name)
		}
	}
}
