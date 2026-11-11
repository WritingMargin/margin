package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestReplaceLines(t *testing.T) {
	for _, tc := range []struct{ content, selected, replacement, want string }{
		{"one\ntwo\nthree\nfour\n", "2:3", "replacement\n", "one\nreplacement\nfour\n"},
		{"one\ntwo", "2:2", "three\nfour", "one\nthree\nfour"},
		{"one\r\ntwo\r\n", "1:1", "", "two\r\n"},
		{"one\n", "1:1", "", ""},
		{"one\n\n", "2:2", "last", "one\nlast\n"},
	} {
		got, err := replaceLines(tc.content, tc.selected, tc.replacement)
		if err != nil || got != tc.want {
			t.Errorf("replaceLines(%q, %q, %q) = %q, %v; want %q", tc.content, tc.selected, tc.replacement, got, err, tc.want)
		}
	}
	if !reflect.DeepEqual(lines("one\n\n"), []string{"one", ""}) {
		t.Fatal("blank lines lost")
	}
	for _, selected := range []string{"0:2", "3:2", "1:4", "1", "1.2:3", "-1:2", "01:2", "1:999999999999999999999"} {
		if _, _, err := lineRange(selected, 3); err == nil {
			t.Errorf("accepted invalid range %q", selected)
		}
	}
	if _, err := replaceLines("", "1:1", "new"); err == nil {
		t.Fatal("accepted range in empty document")
	}
}

func TestParse(t *testing.T) {
	for _, args := range [][]string{{"list", "--unknown"}, {"--json=true"}, {"--text"}, {"--text", "--json"}, {"--json", "--json"}, {"-x"}} {
		if _, err := parse(args); err == nil {
			t.Errorf("accepted %q", args)
		}
	}
	got, err := parse([]string{"update", "id", "--text=", "--lines", "1:1", "--json"})
	if err != nil {
		t.Fatal(err)
	}
	if value, ok := got.flags["text"]; !ok || value != "" {
		t.Fatal("empty text not retained")
	}
	got, err = parse([]string{"grep", "--json", "--", "--literal"})
	if err != nil || !reflect.DeepEqual(got.positions, []string{"grep", "--literal"}) {
		t.Fatalf("end of options: %#v %v", got, err)
	}
}

func TestInput(t *testing.T) {
	for _, flags := range []map[string]string{{}, {"file": "-", "text": "value"}} {
		if _, err := readInput(flags, strings.NewReader("")); err == nil {
			t.Fatal("accepted ambiguous input")
		}
	}
	got, err := readInput(map[string]string{"file": "-"}, strings.NewReader("日本語\r\n"))
	if err != nil || got != "日本語\r\n" {
		t.Fatalf("stdin: %q %v", got, err)
	}
	if _, err := readInput(map[string]string{"file": "-"}, strings.NewReader(strings.Repeat("x", 3_000_001))); err == nil {
		t.Fatal("accepted oversized input")
	}
}

func TestClientConfiguration(t *testing.T) {
	for _, raw := range []string{"ftp://example.test", "https://user:secret@example.test", "https://example.test?token=secret", "https://example.test?", "https://example.test#fragment", "not-a-url"} {
		if _, err := newClient(raw, "token"); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	if _, err := newClient("", ""); err == nil {
		t.Fatal("accepted missing token")
	}
}

func TestHTTPRedirects(t *testing.T) {
	var redirected int
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected++; w.Write([]byte(`{}`)) }))
	defer destination.Close()
	server := httptest.NewServer(httpFailureHandler(t, destination.URL))
	defer server.Close()
	c, err := newClient(server.URL, "fixture-token")
	if err != nil {
		t.Fatal(err)
	}
	var result any
	if err := c.request("GET", "/redirect", nil, &result); err == nil || redirected != 0 {
		t.Fatalf("redirect followed: %v", err)
	}
}

func TestHTTPFailures(t *testing.T) {
	server := httptest.NewServer(httpFailureHandler(t, "http://unused.test"))
	defer server.Close()
	c, err := newClient(server.URL, "fixture-token")
	if err != nil {
		t.Fatal(err)
	}
	var result any
	var failure *cliError
	if err := c.request("PUT", "/conflict", map[string]string{"revision": "old"}, &result); !errors.As(err, &failure) || failure.Status != 409 || failure.Code != "REVISION_CONFLICT" {
		t.Fatalf("lost API failure: %v", err)
	}
	if err := c.request("GET", "/html", nil, &result); err == nil || !strings.Contains(err.Error(), "502") {
		t.Fatalf("non-JSON error: %v", err)
	}
	if err := c.request("GET", "/invalid", nil, &result); err == nil || !strings.Contains(err.Error(), "valid JSON") {
		t.Fatalf("invalid response accepted: %v", err)
	}
}

func httpFailureHandler(t *testing.T, destination string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fixture-token" {
			t.Error("missing bearer token")
		}
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, destination, http.StatusTemporaryRedirect)
		case "/conflict":
			w.WriteHeader(409)
			w.Write([]byte(`{"error":"Post changed","code":"REVISION_CONFLICT"}`))
		case "/html":
			w.WriteHeader(502)
			w.Write([]byte("<html>upstream unavailable</html>"))
		default:
			w.Write([]byte("not json"))
		}
	}
}

func TestCommandValidationDoesNotContactServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected request: %s", r.URL)
		w.WriteHeader(500)
	}))
	defer server.Close()
	env := func(key string) string {
		if key == "MARGIN_TOKEN" {
			return "fixture-token"
		}
		return server.URL
	}
	for _, args := range [][]string{{"update", "id", "--lines", "1:1", "--text", "new"}, {"publish", "id"}, {"unpublish", "id"}, {"delete", "id", "--yes"}, {"unknown"}, {"list", "extra"}, {"get"}, {"list", "--publish"}, {"delete", "id"}, {"grep", "(?=unsupported)"}, {"update", "id", "--text", "new"}, {"create", "--title", "Title"}} {
		if err := run(args, strings.NewReader(""), io.Discard, env, "test"); err == nil {
			t.Errorf("accepted %q", args)
		}
	}
	for _, entry := range []post{{"content": "text"}, {"revision": "new"}} {
		if err := guardRevision(entry, map[string]string{"revision": "old"}); err == nil {
			t.Fatal("accepted unsafe revision")
		}
	}
}

// TestDotenvAndJSONErrors verifies environment precedence and structured errors without a real saved login.
func TestDotenvAndJSONErrors(t *testing.T) {
	// Execute resolves .env relative to the caller, without requiring a server or token for skills.
	directory := t.TempDir()
	t.Chdir(directory)
	if err := os.WriteFile(filepath.Join(directory, ".env"), []byte("export MARGIN_URL='http://localhost:3001' # comment\nMARGIN_TOKEN=local-token # comment\nUNRELATED=ignored\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := dotenv(); !reflect.DeepEqual(got, map[string]string{"MARGIN_URL": "http://localhost:3001", "MARGIN_TOKEN": "local-token"}) {
		t.Fatalf("dotenv: %#v", got)
	}
	// Keep developer credentials and URL overrides outside this missing-login scenario.
	t.Setenv("MARGIN_CONFIG_DIR", t.TempDir())
	t.Setenv("MARGIN_URL", "http://localhost:3001")
	t.Setenv("MARGIN_TOKEN", "") // Explicitly empty exported values take precedence over .env.
	var stdout, stderr bytes.Buffer
	code := Execute([]string{"list", "--json"}, "test", strings.NewReader(""), &stdout, &stderr)
	var failure cliError
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil {
		t.Fatal(err)
	}
	if code != 1 || stdout.Len() != 0 || !strings.Contains(failure.Message, "MARGIN_TOKEN") {
		t.Fatalf("failure: %d %q %q", code, stdout.String(), stderr.String())
	}
}

func TestVersionJSON(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := Execute([]string{"--version", "--json"}, "1.2.3", nil, &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatalf("version exit: %d", code)
	}
	var value map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &value); err != nil || value["version"] != "1.2.3" {
		t.Fatalf("version: %q %v", stdout.String(), err)
	}
}

func TestMandatoryRevisionGuard(t *testing.T) {
	for _, command := range []string{"update", "publish", "unpublish", "delete"} {
		for _, revision := range []string{"", " "} {
			err := requireRevision(command, map[string]string{"revision": revision, "yes": "true"})
			var failure *cliError
			if !errors.As(err, &failure) || failure.Code != "REVISION_REQUIRED" {
				t.Fatalf("%s accepted missing revision: %v", command, err)
			}
		}
	}
	if err := guardRevision(post{"revision": "latest"}, map[string]string{}); err == nil {
		t.Fatal("guard accepted a missing read revision")
	}
}
