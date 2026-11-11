package blog

import (
	"context"
	"net/url"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func oauthSelectedTokens(t *testing.T, a *App, requested string, selected []string, resource string) (Row, Row) {
	t.Helper()
	client := oauthRegisterTest(t, a, requested)
	form := oauthConsentForm(t, a, oauthQuery(client.str("client_id"), requested, resource))
	form["permission"] = selected
	response := oauthHTTPRequest(a, "POST", "/oauth/consent", form, true)
	expectStatus(t, response, 303)
	target, err := url.Parse(response.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	tokens := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", oauthExchangeForm(client.str("client_id"), target.Query().Get("code")), false), 200)
	return client, tokens
}

func TestOAuthSelectedPermissionsCannotEscalate(t *testing.T) {
	a := oauthFixture(t)
	requested := "content:read content:draft content:publish media:write settings:manage"
	client, tokens := oauthSelectedTokens(t, a, requested, []string{"content:read", "content:draft"}, "https://blog.test/api")
	if tokens.str("scope") != "content:read content:draft" {
		t.Fatal(tokens.str("scope"))
	}
	access := tokens.str("access_token")
	post := responseRow(t, tokenRequest(a, access, "POST", "/api/posts", Row{"title": "Allowed draft", "slug": "scoped-draft", "content": "Private"}), 201)
	expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), 200)
	expectStatus(t, tokenRequest(a, access, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "status": "published"}), 403)
	expectStatus(t, tokenRequest(a, access, "DELETE", "/api/posts/"+post.str("id"), nil), 403)
	expectStatus(t, tokenRequest(a, access, "GET", "/api/settings", nil), 403)
	expectStatus(t, tokenRequest(a, access, "POST", "/api/media/images", Row{}), 403)
	refresh := url.Values{"grant_type": {"refresh_token"}, "client_id": {client.str("client_id")}, "refresh_token": {tokens.str("refresh_token")}}
	next := responseRow(t, oauthHTTPRequest(a, "POST", "/oauth/token", refresh, false), 200)
	if next.str("scope") != tokens.str("scope") {
		t.Fatal("refresh expanded scope")
	}
	expectStatus(t, tokenRequest(a, next.str("access_token"), "GET", "/api/settings", nil), 403)
}

func TestOAuthConsentRejectsUnrequestedOrEmptySelection(t *testing.T) {
	a := oauthFixture(t)
	client := oauthRegisterTest(t, a, "content:read")
	for _, selected := range [][]string{nil, {"settings:manage"}, {"content:read", "content:read"}} {
		form := oauthConsentForm(t, a, oauthQuery(client.str("client_id"), "content:read", "https://blog.test/api"))
		form["permission"] = selected
		expectStatus(t, oauthHTTPRequest(a, "POST", "/oauth/consent", form, true), 400)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM oauth_codes")) != 0 {
		t.Fatal("invalid selection issued code")
	}
}

func TestOAuthIndependentCapabilities(t *testing.T) {
	cases := []struct {
		scope                          string
		read, draft, publish, settings int
	}{
		{"content:read", 200, 403, 403, 403},
		{"content:draft", 403, 201, 403, 403},
		{"content:publish", 403, 403, 201, 403},
		{"settings:manage", 403, 403, 403, 200},
		{"media:write", 403, 403, 403, 403},
		{"administration:manage", 403, 403, 403, 403},
	}
	for _, test := range cases {
		t.Run(test.scope, func(t *testing.T) {
			a := oauthFixture(t)
			_, tokens := oauthSelectedTokens(t, a, test.scope, []string{test.scope}, "https://blog.test/api")
			access := tokens.str("access_token")
			expectStatus(t, tokenRequest(a, access, "GET", "/api/posts", nil), test.read)
			expectStatus(t, tokenRequest(a, access, "POST", "/api/posts", Row{"title": "Draft", "slug": "draft", "content": "Test"}), test.draft)
			expectStatus(t, tokenRequest(a, access, "POST", "/api/posts", Row{"title": "Published", "slug": "published", "content": "Test", "status": "published"}), test.publish)
			expectStatus(t, tokenRequest(a, access, "GET", "/api/settings", nil), test.settings)
			expectStatus(t, tokenRequest(a, access, "POST", "/api/tokens", Row{"name": "Escalate", "role": "owner"}), 403)
			expectStatus(t, tokenRequest(a, access, "GET", "/api/oauth/connections", nil), 403)
		})
	}
}

func TestOAuthMCPOnlyAdvertisesAndAllowsApprovedTools(t *testing.T) {
	a := oauthFixture(t)
	_, tokens := oauthSelectedTokens(t, a, "content:read content:draft settings:manage", []string{"settings:manage"}, "https://blog.test/mcp")
	session := mcpTestSession(t, a, tokens.str("access_token"))
	listed, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, tool := range listed.Tools {
		names[tool.Name] = true
	}
	for name, allowed := range map[string]bool{"get_blog_design": true, "update_site_seo": true, "list_posts": false, "create_post": false, "upload_image": false} {
		if names[name] != allowed {
			t.Fatal("unexpected tool access", name, names)
		}
	}
	mcpCall(t, session, "get_blog_design", nil, 200)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "list_posts", Arguments: Row{}})
	if err == nil && (result == nil || !result.IsError) {
		t.Fatal("unapproved tool was callable")
	}
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", "/api/settings", nil), 401)
}

func TestOAuthConsentExplainsPrivateAccessAndSelection(t *testing.T) {
	a := oauthFixture(t)
	client := oauthRegisterTest(t, a, "content:read content:draft")
	query := oauthQuery(client.str("client_id"), "content:read content:draft", "https://blog.test/mcp")
	response := oauthHTTPRequest(a, "GET", "/oauth/authorize?"+query.Encode(), nil, true)
	expectStatus(t, response, 200)
	if response.Header().Get("Referrer-Policy") != "same-origin" {
		t.Fatal("native consent forms need a same-origin referrer policy")
	}
	for _, text := range []string{"Choose permissions", "private drafts", `name="permission" value="content:read"`, `name="permission" value="content:draft"`, "Allow selected permissions", `type="submit"`, "cannot create API tokens"} {
		if !strings.Contains(response.Body.String(), text) {
			t.Fatal("missing consent detail", text)
		}
	}
	if strings.Contains(response.Body.String(), `name="permission" value="content:publish"`) {
		t.Fatal("offered unrequested permission")
	}
}
