package blog

import (
	"context"
	"encoding/json"
	"margin/backend/internal/formatting"
	"net/http"
	"strings"
	"testing"
)

func TestFormattingProposalUsesCentralWithoutSaving(t *testing.T) {
	a, storage := coreFixture(t)
	before := encode(a.DB.Must(context.Background(), "SELECT * FROM posts"))
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		var payload Row
		json.NewDecoder(r.Body).Decode(&payload)
		if r.URL.Path != "/v1/generations/writing" || payload.str("schemaName") != "content_formatting" || payload.str("instructions") != formatting.Instructions || r.Header.Get("Idempotency-Key") == "" {
			t.Fatalf("Unexpected request: %s %#v", r.URL, payload)
		}
		if strings.Contains(encode(payload), "https://private.example") {
			t.Fatal("Protected media sent as formatting context")
		}
		return fixtureResponse(Row{"plan": Row{"changes": []Row{{"line": 1, "style": "heading2"}}}}), nil
	})
	input := Row{"content": "My existing heading\n\nMy paragraph.\n\n![Photo](https://private.example/image.png)"}
	expectStatus(t, request(t, a, "POST", "/api/ai/formatting", input, false), 401)
	got := responseRow(t, request(t, a, "POST", "/api/ai/formatting", input, true), 200)
	if !strings.Contains(got.str("content"), "## My existing heading") || calls != 1 {
		t.Fatal(got, calls)
	}
	if before != encode(a.DB.Must(context.Background(), "SELECT * FROM posts")) || len(storage.objects) != 0 {
		t.Fatal("Formatting persisted article content")
	}
}

func TestFormattingRejectsInvalidResultsAndInput(t *testing.T) {
	a, _ := coreFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return fixtureResponse(Row{"plan": Row{"changes": []Row{{"line": 1, "style": "heading2", "text": "New heading"}}}}), nil
	})
	input := Row{"content": "Original heading"}
	got := responseRow(t, request(t, a, "POST", "/api/ai/formatting", input, true), 502)
	if got.str("code") != "AI_INVALID_RESPONSE" || got["content"] != nil {
		t.Fatal(got)
	}
	for _, bad := range []Row{{"content": " "}, {"content": strings.Repeat("x", 40001)}, {"content": "Original", "instructions": "Rewrite it"}} {
		expectStatus(t, request(t, a, "POST", "/api/ai/formatting", bad, true), 400)
	}
	if calls != 1 {
		t.Fatal("Invalid input reached Central")
	}
	t.Setenv("AI_SERVICE_TOKEN", "")
	got = responseRow(t, request(t, a, "POST", "/api/ai/formatting", input, true), 503)
	if got.str("code") != "ACCOUNT_REQUIRED" {
		t.Fatal(got)
	}
}

func TestFormattingAlreadyFormattedAvoidsPaidRequest(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) { t.Fatal("Unnecessary AI call"); return nil, nil })
	content := "## Heading\n\n```\nLeave code alone\n```"
	got := responseRow(t, request(t, a, "POST", "/api/ai/formatting", Row{"content": content}, true), 200)
	if got.str("content") != content || got["changes"] != float64(0) {
		t.Fatal(got)
	}
}
