package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPWorkspaceNotesRoleDiscovery(t *testing.T) {
	app, _ := coreFixture(t)
	allTools := []string{
		"list_notes", "get_note", "create_note",
		"update_note", "delete_note", "share_note", "duplicate_note",
	}
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		session := mcpTestSession(t, app, roleToken(t, app, role))
		tools := mcpToolMap(t, session)
		canWrite := role != "reader"
		for _, name := range allTools {
			want := canWrite || name == "list_notes" || name == "get_note"
			if (tools[name] != nil) != want {
				t.Fatalf("role %s tool %s: got %v want %v", role, name, tools[name] != nil, want)
			}
		}
		if canWrite && (!isDestructive(tools["update_note"]) || !isDestructive(tools["delete_note"]) || isDestructive(tools["list_notes"])) {
			t.Fatalf("role %s unexpected destructive hints on note tools", role)
		}
	}
}

func TestMCPWorkspaceNotesOAuthScopeDiscovery(t *testing.T) {
	cases := []struct {
		scope       string
		read, write bool
	}{
		{"content:read", true, false},
		{"content:draft", false, true},
		{"settings:manage", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.scope, func(t *testing.T) {
			app := oauthFixture(t)
			_, tokens := oauthSelectedTokens(t, app, tc.scope, []string{tc.scope}, "https://blog.test/mcp")
			session := mcpTestSession(t, app, tokens.str("access_token"))
			tools := mcpToolMap(t, session)
			checks := map[string]bool{
				"list_notes":     tc.read,
				"get_note":       tc.read,
				"create_note":    tc.write,
				"update_note":    tc.write,
				"delete_note":    tc.write,
				"share_note":     tc.write,
				"duplicate_note": tc.write,
			}
			for name, want := range checks {
				if (tools[name] != nil) != want {
					t.Fatalf("scope %s tool %s: got %v want %v", tc.scope, name, tools[name] != nil, want)
				}
			}
		})
	}
}

func TestMCPWorkspaceNotesWorkflowAndValidation(t *testing.T) {
	app, _ := coreFixture(t)
	writer := mcpTestSession(t, app, roleToken(t, app, "writer"))
	reader := mcpTestSession(t, app, roleToken(t, app, "reader"))

	created := mcpCall(t, writer, "create_note", Row{"input": Row{
		"title":   "Launch checklist",
		"content": "Verify dark mode contrast.",
		"links":   []Row{{"url": "https://example.test/checklist", "title": "Spec"}},
	}}, 201)
	id := created.str("id")
	if id == "" || created.yes("isPublic") {
		t.Fatalf("unexpected created note: %+v", created)
	}

	notes := mcpResearchRows(t, reader, "list_notes", Row{})
	if len(notes) != 1 || notes[0].str("id") != id {
		t.Fatalf("expected created note in list_notes, got %+v", notes)
	}

	updated := mcpCall(t, writer, "update_note", Row{
		"id":    id,
		"input": Row{"isPublic": true},
	}, 200)
	if !updated.yes("isPublic") || updated.str("title") != "Launch checklist" {
		t.Fatalf("expected partial update to preserve title and set isPublic, got %+v", updated)
	}

	assertMCPNoteShareAndDuplicate(t, app, writer, id)
	assertMCPInvalidNoteCalls(t, writer, id)

	mcpCall(t, writer, "delete_note", Row{"id": id}, 200)
	mcpCall(t, reader, "get_note", Row{"id": id}, 404)
}

func assertMCPNoteShareAndDuplicate(t *testing.T, app *App, writer *mcp.ClientSession, id string) {
	t.Helper()
	shared := mcpCall(t, writer, "share_note", Row{"id": id, "input": Row{"enabled": true}}, 200)
	shareToken := shared.str("shareToken")
	if shareToken == "" || !shared.yes("shared") {
		t.Fatalf("expected share token, got %+v", shared)
	}
	expectStatus(t, request(t, app, "GET", "/api/public/notes/"+shareToken, nil, false), 200)

	mcpCall(t, writer, "share_note", Row{"id": id, "input": Row{"enabled": false}}, 200)
	expectStatus(t, request(t, app, "GET", "/api/public/notes/"+shareToken, nil, false), 404)

	dup := mcpCall(t, writer, "duplicate_note", Row{"id": id}, 201)
	if dup.str("id") == id || dup.yes("isPublic") || dup.str("content") != "Verify dark mode contrast." {
		t.Fatalf("unexpected duplicated note: %+v", dup)
	}
}

func TestMCPWorkspaceNotesTeamIsolation(t *testing.T) {
	app, writerCookie, _ := memberFixture(t, "writer")

	ownerPrivate := responseRow(t, request(t, app, "POST", "/api/notes", Row{
		"title":   "Private draft",
		"content": "Only owner",
	}, true), 201)
	ownerPublic := responseRow(t, request(t, app, "POST", "/api/notes", Row{
		"title":    "Team brief",
		"content":  "Visible to team",
		"isPublic": true,
	}, true), 201)

	writerToken := oauthMemberToken(t, app, writerCookie)
	writer := mcpTestSession(t, app, writerToken)

	listed := mcpResearchRows(t, writer, "list_notes", Row{})
	if len(listed) != 1 || listed[0].str("id") != ownerPublic.str("id") {
		t.Fatalf("expected only owner public note, got %+v", listed)
	}
	mcpCall(t, writer, "get_note", Row{"id": ownerPrivate.str("id")}, 404)
	mcpCall(t, writer, "update_note", Row{"id": ownerPublic.str("id"), "input": Row{"title": "Tampered"}}, 403)
	mcpCall(t, writer, "delete_note", Row{"id": ownerPublic.str("id")}, 403)

	dup := mcpCall(t, writer, "duplicate_note", Row{"id": ownerPublic.str("id")}, 201)
	if !dup.yes("canEdit") || dup.yes("isPublic") {
		t.Fatalf("expected editable private copy for writer, got %+v", dup)
	}
}

func assertMCPInvalidNoteCalls(t *testing.T, session *mcp.ClientSession, noteID string) {
	t.Helper()
	for _, tc := range []struct {
		name string
		args Row
	}{
		{"create_note", Row{"input": Row{"unexpected": true}}},
		{"create_note", Row{"input": Row{"links": []Row{{"url": "javascript:alert(1)"}}}}},
		{"share_note", Row{"id": noteID, "input": Row{}}},
		{"get_note", Row{"id": "../secrets"}},
	} {
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: tc.name, Arguments: tc.args})
		if err == nil && !result.IsError {
			t.Fatalf("invalid %s input accepted: %+v", tc.name, tc.args)
		}
	}
}

func isDestructive(tool *mcp.Tool) bool {
	return tool != nil && tool.Annotations != nil && tool.Annotations.DestructiveHint != nil && *tool.Annotations.DestructiveHint
}

func mcpToolMap(t *testing.T, session *mcp.ClientSession) map[string]*mcp.Tool {
	t.Helper()
	listed, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	tools := make(map[string]*mcp.Tool, len(listed.Tools))
	for _, tool := range listed.Tools {
		tools[tool.Name] = tool
	}
	return tools
}

func oauthMemberToken(t *testing.T, a *App, memberCookie *http.Cookie) string {
	t.Helper()
	t.Setenv("PUBLIC_URL", "https://notes.pages.example")
	requested := "content:read content:draft"
	client := oauthRegisterTest(t, a, requested)
	query := oauthQuery(client.str("client_id"), requested, "https://notes.pages.example/mcp")

	getReq := httptest.NewRequest("GET", "https://notes.pages.example"+sitePath("/oauth/authorize")+"?"+query.Encode(), nil)
	getReq.Header.Set("Accept", "application/json")
	getReq.AddCookie(memberCookie)
	getRec := httptest.NewRecorder()
	a.ServeHTTP(getRec, getReq)
	expectStatus(t, getRec, 200)

	var data struct {
		Fields map[string]string `json:"fields"`
	}
	must(json.Unmarshal(getRec.Body.Bytes(), &data))
	form := url.Values{}
	for name, value := range data.Fields {
		form.Set(name, value)
	}
	form["permission"] = []string{"content:read", "content:draft"}
	form.Set("decision", "allow")

	postReq := httptest.NewRequest("POST", "https://notes.pages.example"+sitePath("/oauth/consent"), strings.NewReader(form.Encode()))
	postReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	postReq.Header.Set("Origin", "https://notes.pages.example")
	postReq.AddCookie(memberCookie)
	postRec := httptest.NewRecorder()
	a.ServeHTTP(postRec, postReq)
	expectStatus(t, postRec, 303)

	target, err := url.Parse(postRec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	tokenReq := httptest.NewRequest("POST", "https://notes.pages.example"+sitePath("/oauth/token"), strings.NewReader(oauthExchangeForm(client.str("client_id"), target.Query().Get("code")).Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	a.ServeHTTP(tokenRec, tokenReq)
	tokens := responseRow(t, tokenRec, 200)
	return tokens.str("access_token")
}
