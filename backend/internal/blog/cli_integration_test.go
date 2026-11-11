package blog

import (
	"bytes"
	"encoding/json"
	"io"
	cli "margin-cli"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCLIBrowserLoginPushAndLogout(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	server := httptest.NewServer(a)
	defer server.Close()
	t.Setenv("MARGIN_URL", "")
	t.Setenv("MARGIN_TOKEN", "")
	t.Setenv("MARGIN_CONFIG_DIR", t.TempDir())
	loginCLIThroughAdmin(t, a, server.URL+"/blog")
	runCLIResult(t, []string{"whoami", "--json"}, "", 0)
	created := runCLIResult(t, []string{"push", "--title", "CLI article", "--slug", "cli-article", "--file", "-", "--json"}, "# First draft\n", 0)
	if created.str("status") != "draft" {
		t.Fatal("push must default to draft")
	}
	expectStatus(t, request(t, a, "GET", "/blog/api/public/posts/cli-article", nil, false), 404)
	updated := runCLIResult(t, []string{"push", created.str("id"), "--revision", created.str("revision"), "--file", "-", "--publish", "--json"}, "# Ready to read\n", 0)
	if updated.str("status") != "published" {
		t.Fatal("push did not publish")
	}
	read := responseRow(t, request(t, a, "GET", "/blog/api/public/posts/cli-article", nil, false), 200)
	if read.str("content") != "# Ready to read\n" {
		t.Fatal("uploaded Markdown did not reach public article")
	}
	conflict := runCLIResult(t, []string{"push", created.str("id"), "--revision", created.str("revision"), "--file", "-", "--json"}, "stale", 1)
	if conflict.str("code") != "REVISION_CONFLICT" {
		t.Fatal(conflict)
	}
	runCLIResult(t, []string{"logout", "--json"}, "", 0)
	runCLIResult(t, []string{"whoami", "--json"}, "", 1)
	tokens := responseRowTokens(t, a)
	if len(tokens) != 1 {
		t.Fatal("logout did not revoke CLI token")
	}
}

func responseRowTokens(t *testing.T, a *App) []Row {
	t.Helper()
	w := request(t, a, "GET", "/blog/api/tokens", nil, true)
	expectStatus(t, w, 200)
	var rows []Row
	must(json.Unmarshal(w.Body.Bytes(), &rows))
	return rows
}

func loginCLIThroughAdmin(t *testing.T, a *App, address string) {
	t.Helper()
	r, w := io.Pipe()
	defer r.Close()
	var stderr bytes.Buffer
	done := make(chan int, 1)
	go func() {
		result := cli.Execute([]string{"login", "--url", address, "--no-browser", "--json"}, "test", nil, w, &stderr)
		w.Close()
		done <- result
	}()
	// Bound the test if the handshake regresses.
	timer := time.AfterFunc(10*time.Second, func() { r.Close() })
	defer timer.Stop()
	decoder := json.NewDecoder(r)
	var pending Row
	if err := decoder.Decode(&pending); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(pending.str("verificationUrl"), address+"/admin/settings?cliCode=") {
		t.Fatal("mount path lost")
	}
	expectStatus(t, request(t, a, "POST", "/blog/api/tokens/cli/approve", Row{"code": pending["code"]}, true), 201)
	var connected Row
	if err := decoder.Decode(&connected); err != nil {
		t.Fatal(err)
	}
	if code := <-done; code != 0 {
		t.Fatal("login failed", stderr.String())
	}
	if connected.str("status") != "Connected" {
		t.Fatal(connected)
	}
}

func runCLIResult(t *testing.T, args []string, input string, want int) Row {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := cli.Execute(args, "test", strings.NewReader(input), &stdout, &stderr)
	if code != want {
		t.Fatalf("CLI %s: exit %d, want %d: %s", args[0], code, want, stderr.String())
	}
	data := stdout.Bytes()
	if want != 0 {
		data = stderr.Bytes()
	}
	var result Row
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestCLIStagedDraftWorkflow(t *testing.T) {
	a, _ := coreFixture(t)
	server := httptest.NewServer(a)
	defer server.Close()
	t.Setenv("MARGIN_URL", server.URL)
	t.Setenv("MARGIN_TOKEN", "owner")
	t.Setenv("MARGIN_CONFIG_DIR", t.TempDir())
	created := runCLIResult(t, []string{"create", "--title", "CLI staged", "--slug", "cli-staged", "--text", "Original", "--json"}, "", 0)
	if !strings.HasSuffix(created.str("draftUrl"), "/draft/post/cli-staged") {
		t.Fatal(created)
	}
	live := runCLIResult(t, []string{"publish", created.str("id"), "--revision", created.str("revision"), "--json"}, "", 0)
	initial := runCLIResult(t, []string{"get", live.str("id"), "--draft", "--json"}, "", 0)
	staged := runCLIResult(t, []string{"push", live.str("id"), "--draft", "--file", "-", "--revision", initial.str("revision"), "--json"}, "New staged body\n", 0)
	staged = runCLIResult(t, []string{"update", live.str("id"), "--draft", "--lines", "1:1", "--text", "Revised staged body", "--revision", staged.str("revision"), "--json"}, "", 0)
	current := runCLIResult(t, []string{"get", live.str("id"), "--json"}, "", 0)
	if current.str("content") != "Original" || staged.str("status") != "draft" || staged.str("draftUrl") == "" {
		t.Fatal(current, staged)
	}
	runCLIResult(t, []string{"push", live.str("id"), "--draft", "--publish", "--file", "-", "--revision", staged.str("revision"), "--json"}, "Invalid", 1)
	published := runCLIResult(t, []string{"publish", live.str("id"), "--draft", "--revision", staged.str("revision"), "--json"}, "", 0)
	if published.str("content") != "Revised staged body\n" || published.str("status") != "published" {
		t.Fatal(published)
	}
	staged = runCLIResult(t, []string{"push", live.str("id"), "--draft", "--file", "-", "--revision", published.str("revision"), "--json"}, "Discard me", 0)
	runCLIResult(t, []string{"discard-draft", live.str("id"), "--revision", staged.str("revision"), "--json"}, "", 0)
	current = runCLIResult(t, []string{"get", live.str("id"), "--draft", "--json"}, "", 0)
	if current.str("revision") != published.str("revision") {
		t.Fatal(current)
	}
}
