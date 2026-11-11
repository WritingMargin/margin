package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	cli "margin-cli"
)

func mcpTestSession(t *testing.T, app *App, key string) *mcp.ClientSession {
	t.Helper()
	server := httptest.NewServer(app)
	t.Cleanup(server.Close)
	client := mcp.NewClient(&mcp.Implementation{Name: "margin-integration-test", Version: "1"}, nil)
	httpClient := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		cloned := r.Clone(r.Context())
		cloned.Header.Set("Authorization", "Bearer "+key)
		return http.DefaultTransport.RoundTrip(cloned)
	})}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: server.URL + sitePath("/mcp"), HTTPClient: httpClient, DisableStandaloneSSE: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { session.Close() })
	return session
}
func mcpCall(t *testing.T, session *mcp.ClientSession, name string, input Row, status int) Row {
	t.Helper()
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: input})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	var value Row
	if json.Unmarshal(data, &value) != nil || value["status"] != float64(status) || result.IsError != (status >= 400) {
		t.Fatalf("%s: unexpected result: %+v", name, result)
	}
	if item, ok := value["data"].(map[string]any); ok {
		return Row(item)
	}
	return value
}
func TestMCPResourcesAndRoleDiscovery(t *testing.T) {
	app, _ := coreFixture(t)
	for _, role := range []string{"reader", "writer", "publisher", "owner"} {
		session := mcpTestSession(t, app, roleToken(t, app, role))
		listed, err := session.ListTools(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		names := map[string]bool{}
		for _, tool := range listed.Tools {
			names[tool.Name] = true
		}
		for name, expected := range map[string]bool{"get_author_profile": role == "owner", "update_author_profile": role == "owner", "get_post": true, "list_images": true, "list_videos": true, "create_post": role != "reader", "update_site_seo": role == "owner", "createToken": false, "getAuthoringGuide": false, "get_blog_design": role == "owner", "update_blog_design": role == "owner", "validate_blog_design": role == "owner"} {
			if names[name] != expected {
				t.Fatalf("role %s tool %s: got %v", role, name, names[name])
			}
		}
		assertMCPResources(t, session)
	}
}

func assertMCPResources(t *testing.T, session *mcp.ClientSession) {
	t.Helper()
	resources, err := session.ListResources(context.Background(), nil)
	if err != nil || len(resources.Resources) != 4 {
		t.Fatalf("resources: %+v %v", resources, err)
	}
	for uri, read := range map[string]func() ([]byte, error){mcpGuideURI: cli.AuthoringGuide, mcpBlocksURI: cli.AuthoringBlocks, "margin://design/guide": cli.DesignGuide, "margin://design/schema": cli.DesignSchema} {
		resource, err := session.ReadResource(context.Background(), &mcp.ReadResourceParams{URI: uri})
		expected, _ := read()
		if err != nil || len(resource.Contents) != 1 || resource.Contents[0].Text != string(expected) {
			t.Fatalf("resource %s did not match canonical source: %v", uri, err)
		}
	}
}
func TestMCPAuthoringWorkflow(t *testing.T) {
	app, _ := coreFixture(t)
	writer := mcpTestSession(t, app, roleToken(t, app, "writer"))
	publisher := mcpTestSession(t, app, roleToken(t, app, "publisher"))
	draft := draftInput("mcp-workflow")
	draft["contentType"] = "guide"
	post := mcpCall(t, writer, "create_post", Row{"input": draft}, 201)
	image := mcpCall(t, writer, "upload_image", Row{"input": imageAPIInput()}, 201)
	video := mcpCall(t, writer, "upload_video", Row{"input": videoAPIInput("video/mp4")}, 201)
	images := mcpCall(t, writer, "list_images", Row{"source": "uploads"}, 200)
	videos := mcpCall(t, writer, "list_videos", Row{}, 200)
	if !strings.Contains(encode(images), image.str("url")) || !strings.Contains(encode(videos), video.str("url")) {
		t.Fatal("uploaded media missing from libraries")
	}
	body := "# Guide\n\n![Example](" + image.str("url") + ")\n\n[Video src=\"" + video.str("url") + "\" title=\"Demo\"]"
	oldRevision := post["revision"]
	post = mcpCall(t, writer, "update_post", Row{"id": post["id"], "input": Row{"revision": oldRevision, "content": body, "tableOfContents": "top"}}, 200)
	mcpCall(t, writer, "update_post", Row{"id": post["id"], "input": Row{"revision": oldRevision, "content": "stale"}}, 409)
	seo := Row{"title": "Search title", "description": "A guide", "image": image["url"]}
	post = mcpCall(t, writer, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "seo": seo}}, 200)
	post = mcpCall(t, writer, "get_post", Row{"id": post["id"]}, 200)
	if post.str("content") != body || post.str("contentType") != "guide" || post.str("tableOfContents") != "top" {
		t.Fatal("partial update changed unrelated content", post)
	}
	mcpCall(t, writer, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "status": "published"}}, 403)
	post = mcpCall(t, publisher, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "status": "published"}}, 200)
	mcpCall(t, writer, "update_post", Row{"id": post["id"], "input": Row{"revision": post["revision"], "seo": seo}}, 403)
	read := mcpCall(t, writer, "get_post", Row{"id": post["id"], "fields": []string{"id", "content", "status", "revision"}}, 200)
	if read.str("content") != body || read.str("status") != "published" || read["title"] != nil {
		t.Fatal(read)
	}
	mcpCall(t, writer, "list_posts", Row{"page": 1}, 200)
	mcpCall(t, writer, "search_posts", Row{"q": "Guide"}, 200)
	mcpCall(t, writer, "list_revisions", Row{"id": post["id"]}, 200)

}
func TestMCPAuthOriginMountAndRevocation(t *testing.T) {
	app, _ := coreFixture(t)
	key := roleToken(t, app, "writer")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	for _, item := range []struct {
		key, origin, method string
		status              int
	}{
		{"", "", "POST", 401}, {"bad", "", "POST", 401}, {key, "https://evil.example", "POST", 403}, {key, "https://evil.example", "GET", 403},
	} {
		r := httptest.NewRequest(item.method, "http://blog.test/blog/mcp", strings.NewReader("invalid JSON"))
		r.Header.Set("Content-Type", "application/json")
		if item.key != "" {
			r.Header.Set("Authorization", "Bearer "+item.key)
		}
		r.Header.Set("Origin", item.origin)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		expectStatus(t, w, item.status)
	}
	// An owner cookie is intentionally insufficient for the MCP endpoint.
	app.DB.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("mcp-cookie"), time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	r := httptest.NewRequest("GET", "http://blog.test/blog/mcp", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookieName("margin_session"), Value: "mcp-cookie"})
	r.Header.Set("Origin", "http://blog.test")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	expectStatus(t, w, 401)
	session := mcpTestSession(t, app, key)
	post := mcpCall(t, session, "create_post", Row{"input": draftInput("mounted-mcp")}, 201)
	mcpCall(t, session, "get_post", Row{"id": post["id"]}, 200)
	app.DB.Must(context.Background(), "UPDATE api_tokens SET role='reader' WHERE token_hash=$1", hash(key))
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "create_post", Arguments: Row{"input": draftInput("must-not-create")}})
	if err == nil && !result.IsError {
		t.Fatal("downgraded token retained write capability")
	}
	app.DB.Must(context.Background(), "DELETE FROM api_tokens WHERE token_hash=$1", hash(key))
	if _, err = session.ListResources(context.Background(), nil); err == nil {
		t.Fatal("revoked token retained access")
	}
}
func TestMCPLargeMediaAndInvalidArguments(t *testing.T) {
	app, _ := coreFixture(t)
	session := mcpTestSession(t, app, roleToken(t, app, "writer"))
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "update_post", Arguments: Row{"id": "post-id", "input": Row{"content": "no revision"}}})
	if err != nil || !result.IsError {
		t.Fatalf("missing revision accepted: %+v %v", result, err)
	}
	raw, _ := base64.StdEncoding.DecodeString(imageAPIInput().str("data"))
	raw = append(raw, make([]byte, 3<<20)...)
	mcpCall(t, session, "upload_image", Row{"input": Row{"contentType": "image/png", "data": base64.StdEncoding.EncodeToString(raw)}}, 201)
	for _, input := range []Row{
		{"id": "../tokens"}, {"id": ".."}, {"id": "x", "unexpected": true}, {"id": 3},
	} {
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "get_post", Arguments: input})
		if err != nil || !result.IsError {
			t.Fatalf("invalid input accepted: %+v %+v %v", input, result, err)
		}
	}
}

func TestMCPAuthorProfilePropagatesToArticle(t *testing.T) {
	app, _, _ := publicFixture(t)
	session := mcpTestSession(t, app, roleToken(t, app, "owner"))
	profile := mcpCall(t, session, "get_author_profile", Row{}, 200)
	profile["name"] = "Alex Writer"
	profile["website"] = "https://example.test/authors/alex"
	mcpCall(t, session, "update_author_profile", Row{"input": profile}, 200)
	seo := mcpCall(t, session, "get_site_seo", Row{}, 200)
	seo["image"] = "https://example.test/article.png"
	mcpCall(t, session, "update_site_seo", Row{"input": seo}, 200)
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	containsHTML(t, page.Body.String(), `rel="author" href="https://example.test/authors/alex">Alex Writer</a>`, `"url":"https://example.test/authors/alex"`, `property="article:author" content="https://example.test/authors/alex"`)
	containsHTML(t, page.Body.String(), `property="og:image" content="https://example.test/article.png"`, `name="twitter:image" content="https://example.test/article.png"`, `"image":"https://example.test/article.png"`)
}
