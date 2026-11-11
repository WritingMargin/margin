package blog

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func writingStreamFixture(events ...string) *http.Response {
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: io.NopCloser(strings.NewReader(strings.Join(events, "")))}
}

func TestWritingAssistantStreamValidatesFinalResponse(t *testing.T) {
	a, _ := coreFixture(t)
	plan := Row{"reply": "Consider the opening claim.", "sections": []any{}, "questions": []any{}, "formatting": Row{"changes": []any{}}}
	a.Client.Transport = writingSuccessTransport(t, plan)
	w := request(t, a, "POST", "/api/ai/writing/stream", Row{"conversationMode": true, "mode": "ideas", "brief": "What should I check?"}, true)
	assertWritingStreamSuccess(t, w)
}

func TestWritingAssistantGreetingDoesNotCreateSuggestions(t *testing.T) {
	a, _ := coreFixture(t)
	plan := Row{
		"reply":      "Hi! What would you like to work on?",
		"sections":   []Row{{"heading": "Unrequested review", "quote": "", "notes": []string{"Change the opening."}}},
		"questions":  []string{"What should the draft say next?"},
		"formatting": Row{"changes": []any{}},
	}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		assertGreetingContext(t, object(payload["input"]))
		return writingStreamFixture("event: complete\ndata: " + encode(Row{"plan": plan}) + "\n\n"), nil
	})
	w := request(t, a, "POST", "/api/ai/writing/stream", Row{"conversationMode": true, "researchMode": true, "mode": "questions", "brief": "Hi", "content": "A draft with an opening."}, true)
	assertGreetingResponse(t, w)
}

func assertGreetingContext(t *testing.T, context Row) {
	t.Helper()
	if context.str("title") != "" || context.str("content") != "" {
		t.Fatalf("greeting sent draft text: %v", context)
	}
	for _, key := range []string{"history", "passage", "researchMode", "formattingCandidates"} {
		if context[key] != nil {
			t.Fatalf("greeting sent %s: %v", key, context)
		}
	}
}

func assertGreetingResponse(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != 200 {
		t.Fatalf("greeting failed: %d %s", w.Code, w.Body.String())
	}
	for _, expected := range []string{`"reply":"Hi! What would you like to work on?"`, `"questions":[]`, `"sections":[]`} {
		if !strings.Contains(w.Body.String(), expected) {
			t.Fatalf("greeting created suggestions: %s", w.Body.String())
		}
	}
	if strings.Contains(w.Body.String(), "contextExcerpted") || strings.Contains(w.Body.String(), "researchSources") {
		t.Fatalf("greeting included unrelated context: %s", w.Body.String())
	}
}

func writingSuccessTransport(t *testing.T, plan Row) testTransport {
	t.Helper()
	return testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/generations/writing/stream" || r.Header.Get("Idempotency-Key") == "" || r.Header.Get("Accept") != "text/event-stream" {
			t.Fatalf("wrong stream request: %s", r.URL)
		}
		return writingStreamFixture(
			"event: progress\ndata: {\"message\":\"Generating\"}\n\n",
			"event: thinking\ndata: {\"text\":\"Checking the draft.\"}\n\n",
			"event: delta\ndata: {\"text\":\"Consider the opening claim.\"}\n\n",
			"event: complete\ndata: "+encode(Row{"plan": plan})+"\n\n",
		), nil
	})
}

func assertWritingStreamSuccess(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != 200 || w.Header().Get("Content-Type") != "text/event-stream" || w.Header().Get("Cache-Control") != "no-cache" || w.Header().Get("X-Accel-Buffering") != "no" {
		t.Fatalf("wrong stream headers: %d %v", w.Code, w.Header())
	}
	body := w.Body.String()
	if !strings.Contains(body, "event: thinking") || !strings.Contains(body, "event: delta") || !strings.Contains(body, "event: complete") || !strings.Contains(body, `"reply":"Consider the opening claim."`) {
		t.Fatalf("wrong stream body: %s", body)
	}
}

func TestWritingAssistantStreamPreservesCentralError(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return writingStreamFixture("event: error\ndata: {\"error\":\"The provider failed. Your credits were returned.\",\"code\":\"AI_FUSED_FAILED\"}\n\n"), nil
	})
	w := request(t, a, "POST", "/api/ai/writing/stream", Row{"conversationMode": true, "mode": "ideas", "brief": "What next?"}, true)
	if !strings.Contains(w.Body.String(), `"code":"AI_FUSED_FAILED"`) || strings.Contains(w.Body.String(), "event: complete") {
		t.Fatalf("wrong error event: %s", w.Body.String())
	}
}

func TestWritingAssistantStreamRejectsInvalidFinalPlan(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return writingStreamFixture("event: complete\ndata: {\"plan\":{\"reply\":\"\"}}\n\n"), nil
	})
	w := request(t, a, "POST", "/api/ai/writing/stream", Row{"conversationMode": true, "mode": "ideas", "brief": "What next?"}, true)
	if !strings.Contains(w.Body.String(), "event: error") || !strings.Contains(w.Body.String(), "AI_INVALID_RESPONSE") || strings.Contains(w.Body.String(), "event: complete") {
		t.Fatalf("invalid final plan was accepted: %s", w.Body.String())
	}
}
