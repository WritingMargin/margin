package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestContentTypeCommands(t *testing.T) {
	var received map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			io.WriteString(w, `{"id":"entry","content":"First line\nSecond line\n","contentType":"guide","revision":"reviewed"}`)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Error(err)
		}
		json.NewEncoder(w).Encode(received)
	}))
	defer server.Close()
	env := func(key string) string {
		return map[string]string{"MARGIN_TOKEN": "test-token", "MARGIN_URL": server.URL}[key]
	}
	for _, tc := range []struct {
		args []string
		kind string
	}{
		{[]string{"create", "--title", "Guide", "--slug", "guide", "--file", "-", "--content-type", "guide"}, "guide"},
		{[]string{"push", "--title", "Article", "--slug", "article", "--file", "-", "--content-type", "article"}, "article"},
		{[]string{"push", "entry", "--revision", "reviewed", "--file", "-"}, ""},
		{[]string{"update", "entry", "--revision", "reviewed", "--lines", "1:1", "--text", "Changed"}, ""},
		{[]string{"update", "entry", "--revision", "reviewed", "--lines", "1:1", "--text", "Changed", "--content-type", "article"}, "article"},
	} {
		received = nil
		if err := run(tc.args, strings.NewReader("Body"), io.Discard, env, "test"); err != nil {
			t.Fatal(tc.args, err)
		}
		if got, _ := received["contentType"].(string); got != tc.kind {
			t.Fatal("content type was dropped or implicitly reset", tc.args, received)
		}
	}
	var output bytes.Buffer
	if err := run([]string{"get", "entry", "--json"}, nil, &output, env, "test"); err != nil {
		t.Fatal(err)
	}
	var item map[string]any
	if err := json.Unmarshal(output.Bytes(), &item); err != nil || item["contentType"] != "guide" {
		t.Fatal("read dropped content type", output.String(), err)
	}
}

func TestContentTypeValidationBeforeConnection(t *testing.T) {
	env := func(string) string { t.Fatal("invalid content type read credentials"); return "" }
	for _, args := range [][]string{
		{"create", "--title", "Guide", "--slug", "guide", "--text", "Body", "--content-type", "unknown"},
		{"push", "--title", "Guide", "--slug", "guide", "--file", "-", "--content-type", ""},
		{"update", "entry", "--revision", "reviewed", "--lines", "1:1", "--text", "Body", "--content-type", "doc"},
	} {
		if err := run(args, nil, io.Discard, env, "test"); err == nil {
			t.Fatal("invalid content type accepted", args)
		}
	}
}
