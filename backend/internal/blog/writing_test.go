package blog

import (
	"context"
	"encoding/json"
	"margin/backend/internal/writing"
	"net/http"
	"testing"
)

func writingTestPlan() Row {
	return Row{"sections": []Row{{"heading": "Small habits, bigger questions", "notes": []string{"Recall a time when lowering the bar helped you begin.", "Compare consistency with intensity using your own experience."}}, {"heading": "Give the idea a shape", "notes": []string{"Open with a specific moment you remember.", "Explore what changed, then what the reader could try."}}}, "questions": []string{"What did you notice after a week?", "Who would find this useful?"}}
}
func TestWritingAssistantPrivateBriefDoesNotMutatePosts(t *testing.T) {
	a, storage := coreFixture(t)
	before := encode(a.DB.Must(context.Background(), "SELECT * FROM posts"))
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Path != "/v1/generations/writing" {
			t.Fatalf("unexpected request %s", r.URL.Path)
		}
		var payload Row
		json.NewDecoder(r.Body).Decode(&payload)
		input := object(payload["input"])
		if input.str("brief") != "Creative habits" || input.str("content") != "" || input.str("title") != "" {
			t.Fatalf("unexpected context: %v", input)
		}
		return fixtureResponse(Row{"plan": writingTestPlan()}), nil
	})
	input := Row{"mode": "ideas", "brief": "Creative habits"}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, false), 401)
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	if got["plan"] == nil || calls != 1 {
		t.Fatal(got, calls)
	}
	if encode(a.DB.Must(context.Background(), "SELECT * FROM posts")) != before || len(storage.objects) != 0 {
		t.Fatal("planning changed stored content")
	}
}
func TestWritingAssistantRejectsInvalidResultsAndRequiresAccount(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"plan": Row{"article": "Unwanted prose"}}), nil
	})
	input := Row{"mode": "opening", "brief": "Help me choose a starting point"}
	got := responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 502)
	if got.str("code") != "AI_INVALID_RESPONSE" {
		t.Fatal(got)
	}
	t.Setenv("AI_SERVICE_TOKEN", "")
	got = responseRow(t, request(t, a, "POST", "/api/ai/writing", input, true), 503)
	if got.str("code") != "ACCOUNT_REQUIRED" {
		t.Fatal(got)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM central_connection")) != 0 {
		t.Fatal("silently created an account")
	}
}

func TestWritingUsesOnlyCentralConnection(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("AI_MODE", "openai")
	t.Setenv("OPENAI_API_KEY", "fixture-key")
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/generations/writing" || r.URL.Host == "api.openai.com" {
			t.Fatalf("unexpected provider %s", r.URL)
		}
		calls++
		var payload Row
		json.NewDecoder(r.Body).Decode(&payload)
		if payload.str("instructions") != writing.Instructions || payload.str("schemaName") != "writing_plan" || encode(payload["schema"]) != encode(writing.Schema()) {
			t.Fatal("missing engine-owned coaching contract")
		}
		if object(payload["input"]).str("content") != "My explicitly shared draft" || object(payload["input"]).str("passage") != "A selected claim" || r.Header.Get("Idempotency-Key") == "" {
			t.Fatal("missing requested context or idempotency key")
		}
		return fixtureResponse(Row{"plan": writingTestPlan()}), nil
	})
	input := Row{"mode": "questions", "brief": "What evidence would strengthen this claim?", "content": "My explicitly shared draft", "passage": "A selected claim"}
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", input, true), 200)
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestWritingFollowUpForwardsFeedbackAndPreviousNotes(t *testing.T) {
	a, _ := coreFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		json.NewDecoder(r.Body).Decode(&payload)
		input := object(payload["input"])
		if input.str("brief") != "Creative habits" || input.str("feedback") != "Focus on beginners" || encode(input["previous"]) != encode(writingTestPlan()) {
			t.Fatalf("missing follow-up context: %v", input)
		}
		return fixtureResponse(Row{"plan": writingTestPlan()}), nil
	})
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", Row{"mode": "ideas", "brief": "Creative habits", "previous": writingTestPlan(), "feedback": "Focus on beginners"}, true), 200)
}
