package cli

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func startAuditTestServer(t *testing.T) (*httptest.Server, <-chan post) {
	t.Helper()
	bodies := make(chan post, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/posts/audit" || r.Method != "POST" {
			http.Error(w, "incorrect audit route", http.StatusNotFound)
			return
		}
		var body post
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		bodies <- body
		_, _ = io.WriteString(w, `{"mode":"draft","findings":[]}`)
	}))
	return server, bodies
}

func TestAuditForwardsMarkdownAndPublicArticle(t *testing.T) {
	s, bodies := startAuditTestServer(t)
	defer s.Close()
	getenv := func(k string) string {
		return map[string]string{"MARGIN_TOKEN": "test"}[k]
	}
	err := runAudit([]string{"-"}, map[string]string{"url": s.URL, "slug": "an-article", "intent": "hidden", "json": "true"}, strings.NewReader("# An article\nText"), io.Discard, getenv)
	if err != nil {
		t.Fatal(err)
	}
	body := <-bodies
	draft := body["article"].(map[string]any)
	if draft["title"] != "An article" || draft["slug"] != "an-article" || body["intent"] != "hidden" {
		t.Fatal(body)
	}
	err = runAudit(nil, map[string]string{"url": s.URL, "id": "article-id", "public": "true"}, nil, io.Discard, getenv)
	if err != nil {
		t.Fatal(err)
	}
	body = <-bodies
	if body["id"] != "article-id" || body["mode"] != "public" || body["article"] != nil {
		t.Fatal(body, err)
	}
}
