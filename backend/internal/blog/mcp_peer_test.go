package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type mcpPeerState struct {
	mu      sync.RWMutex
	member  Row
	removed bool
}

func (s *mcpPeerState) change(change func(Row)) { s.mu.Lock(); defer s.mu.Unlock(); change(s.member) }
func (s *mcpPeerState) response(r *http.Request) (*http.Response, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.removed {
		res := fixtureResponse(Row{"error": "Membership removed"})
		res.StatusCode = 403
		return res, nil
	}
	return fixtureResponse(s.member), nil
}

type mcpPeerFixtureState struct {
	app                 *App
	post, other         Row
	invite, otherInvite string
	state               *mcpPeerState
	tokens              Row
}

func newMCPPeerFixture(t *testing.T, scope, role string) mcpPeerFixtureState {
	t.Helper()
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	t.Setenv("PUBLIC_URL", "https://blog.test")
	input := draftInput("mcp-peer-assigned")
	input["content"] = "The sample included ten people."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	other := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("mcp-peer-other"), true), 201)
	member := Row{"subject": "reviewer-identity", "email": "reviewer@example.com", "name": "Reviewer", "role": role, "authVersion": "test-version", "membershipVersion": "membership-1", "articleIds": []string{post.str("id")}, "articleGrantVersions": Row{post.str("id"): "grant-1"}}
	state := &mcpPeerState{member: member}
	a.Client.Transport = testTransport(state.response)
	a.DB.Must(t.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("browser"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	a.DB.Must(t.Context(), "INSERT INTO session_principals(token_hash,subject,auth_version) VALUES($1,$2,$3)", hash("browser"), member["subject"], member["authVersion"])
	invite, otherInvite := token(), token()
	for id, article := range map[string]string{invite: post.str("id"), otherInvite: other.str("id")} {
		a.DB.Must(t.Context(), "INSERT INTO peer_reviews(id,post_id,email) VALUES($1,$2,$3)", id, article, member["email"])
	}
	_, tokens := oauthTokenTest(t, a, scope, "https://blog.test/mcp")
	return mcpPeerFixtureState{a, post, other, invite, otherInvite, state, tokens}
}
func assertMCPReviewTools(t *testing.T, session *mcp.ClientSession) {
	t.Helper()
	listed, err := session.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, tool := range listed.Tools {
		names[tool.Name] = true
	}
	for _, name := range []string{"list_peer_reviews", "open_peer_review", "add_peer_review_note", "approve_peer_review", "get_peer_review_note_fix", "get_peer_review_attachment"} {
		if !names[name] {
			t.Fatal("missing assigned review tool", name)
		}
	}
	if len(names) != 6 {
		t.Fatal("reviewer received unrelated tools", names)
	}
	resources, err := session.ListResources(t.Context(), nil)
	if err != nil || len(resources.Resources) != 0 {
		t.Fatal("reviewer received unrelated resources", resources, err)
	}
}
func TestMCPPeerReviewOAuthCycleAndArticleBoundary(t *testing.T) {
	fixture := newMCPPeerFixture(t, "review:assigned", "peer_reviewer")
	a := fixture.app
	session := mcpTestSession(t, a, fixture.tokens.str("access_token"))
	assertMCPReviewTools(t, session)
	reviews := mcpResearchRows(t, session, "list_peer_reviews", Row{})
	if len(reviews) != 1 || reviews[0].str("id") != fixture.invite {
		t.Fatal(reviews)
	}
	opened := mcpCall(t, session, "open_peer_review", Row{"invite": fixture.invite}, 200)
	if object(opened["post"]).str("id") != fixture.post.str("id") {
		t.Fatal("wrong assigned article", opened)
	}
	mcpCall(t, session, "open_peer_review", Row{"invite": fixture.otherInvite}, 404)
	noteInput := Row{"revision": fixture.post["revision"], "quote": "ten people", "body": "Check the sample size.", "submissionId": uuid()}
	mcpCall(t, session, "add_peer_review_note", Row{"invite": fixture.invite, "input": noteInput}, 201)
	mcpCall(t, session, "add_peer_review_note", Row{"invite": fixture.invite, "input": noteInput}, 200)
	mcpCall(t, session, "approve_peer_review", Row{"invite": fixture.invite, "input": Row{"revision": fixture.post["revision"], "badge": false}}, 409)
	author := "/api/posts/" + fixture.post.str("id")
	draft := responseRow(t, request(t, a, "PUT", author+"/draft", Row{"revision": fixture.post["revision"], "content": "The sample included twelve people."}, true), 200)
	note := a.peerNotes(t.Context(), fixture.invite)[0].str("id")
	expectStatus(t, request(t, a, "POST", author+"/reviews/notes/"+note+"/address", Row{"revision": draft["revision"]}, true), 200)
	fixed := mcpCall(t, session, "get_peer_review_note_fix", Row{"invite": fixture.invite, "note": note}, 200)
	if object(fixed["addressed_revision"]).str("content") != "The sample included twelve people." {
		t.Fatal("wrong addressed revision", fixed)
	}
	mcpCall(t, session, "get_peer_review_note_fix", Row{"invite": fixture.otherInvite, "note": note}, 404)
	mcpCall(t, session, "open_peer_review", Row{"invite": fixture.invite}, 200)
	mcpCall(t, session, "approve_peer_review", Row{"invite": fixture.invite, "input": Row{"revision": draft["revision"], "badge": false}}, 200)
	for _, name := range []string{"get_post", "search_posts", "list_images", "list_revisions", "update_post"} {
		result, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: name, Arguments: Row{"id": fixture.other["id"]}})
		if err == nil && !result.IsError {
			t.Fatal("reviewer called unrelated tool", name)
		}
	}
}
func TestMCPPeerAttachmentExactReferenceAndResourceBinding(t *testing.T) {
	fixture := newMCPPeerFixture(t, "review:assigned", "peer_reviewer")
	a := fixture.app
	session := mcpTestSession(t, a, fixture.tokens.str("access_token"))
	document, unrelated := uuid(), uuid()
	for _, id := range []string{document, unrelated} {
		must(a.Storage.Put(t.Context(), id, []byte("private PDF content")))
		a.DB.Must(t.Context(), "INSERT INTO source_documents(id,object_key,title) VALUES($1,$1,'Source')", id)
	}
	content := `[Citation url="/api/public/documents/` + document + `"]Evidence[/Citation]`
	responseRow(t, request(t, a, "PUT", "/api/posts/"+fixture.post.str("id")+"/draft", Row{"revision": fixture.post["revision"], "content": content}, true), 200)
	mcpCall(t, session, "open_peer_review", Row{"invite": fixture.invite}, 200)
	data := mcpCall(t, session, "get_peer_review_attachment", Row{"invite": fixture.invite, "kind": "document", "id": document, "offset": 0, "length": 7}, 206)
	bytes, err := base64.StdEncoding.DecodeString(data.str("data"))
	if err != nil || string(bytes) != "private" {
		t.Fatal(data, err)
	}
	mcpCall(t, session, "get_peer_review_attachment", Row{"invite": fixture.invite, "kind": "document", "id": unrelated}, 404)
	mcpCall(t, session, "get_peer_review_attachment", Row{"invite": fixture.otherInvite, "kind": "document", "id": document}, 404)
	// An MCP-bound credential cannot be replayed directly against asset/API routes.
	expectStatus(t, tokenRequest(a, fixture.tokens.str("access_token"), "GET", "/api/public/documents/"+document+"?review="+fixture.invite, nil), 404)
	result, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: "get_peer_review_attachment", Arguments: Row{"invite": fixture.invite, "kind": "document", "id": document, "url": "https://attacker.example"}})
	if err == nil && !result.IsError {
		t.Fatal("accepted arbitrary attachment URL")
	}
	fixture.state.change(func(member Row) { member["articleIds"] = []string{}; member["articleGrantVersions"] = Row{} })
	result, err = session.CallTool(t.Context(), &mcp.CallToolParams{Name: "get_peer_review_attachment", Arguments: Row{"invite": fixture.invite, "kind": "document", "id": document}})
	if err == nil && !result.IsError {
		t.Fatal("revoked article grant still served attachment")
	}
}
func TestMCPPeerOAuthIdentityAndRoleChangesFailClosed(t *testing.T) {
	for _, change := range []string{"subject", "role", "grant-version"} {
		t.Run(change, func(t *testing.T) {
			fixture := newMCPPeerFixture(t, "review:assigned", "peer_reviewer")
			session := mcpTestSession(t, fixture.app, fixture.tokens.str("access_token"))
			mcpCall(t, session, "open_peer_review", Row{"invite": fixture.invite}, 200)
			fixture.state.change(func(member Row) {
				switch change {
				case "subject":
					member["subject"] = "another-central-subject"
				case "role":
					member["role"] = "writer"
					member["membershipVersion"] = "membership-2"
				case "grant-version":
					member["articleGrantVersions"] = Row{fixture.post.str("id"): "replacement-grant"}
				}
			})
			result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "open_peer_review", Arguments: Row{"invite": fixture.invite}})
			if err == nil && !result.IsError {
				t.Fatal("stale or foreign identity retained review access")
			}
		})
	}
}
func TestMCPContentScopeDoesNotImplicitlyGrantReview(t *testing.T) {
	fixture := newMCPPeerFixture(t, "content:read", "writer")
	session := mcpTestSession(t, fixture.app, fixture.tokens.str("access_token"))
	listed, err := session.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range listed.Tools {
		if strings.Contains(tool.Name, "peer_review") {
			t.Fatal("content-only grant exposed review tool", tool.Name)
		}
	}
	// Exercise the dispatcher directly with an MCP request context to keep the
	// audience valid while ensuring public review handlers require review scope.
	original, _ := http.NewRequest("POST", "https://blog.test/mcp", nil)
	original.Header.Set("Authorization", "Bearer "+fixture.tokens.str("access_token"))
	ctx := context.WithValue(t.Context(), mcpRequestKey{}, original)
	result := fixture.app.callMCPAPI(ctx, mcpPeerOperations()[1], map[string]any{"invite": fixture.invite})
	if !result.IsError {
		raw, _ := json.Marshal(result)
		t.Fatal("content-only connection accessed assigned review", string(raw))
	}
}
