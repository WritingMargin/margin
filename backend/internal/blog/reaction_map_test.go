package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReactionMapRoleAccess(t *testing.T) {
	pattern := "GET /api/analytics/reaction-map"
	if tokenRouteAllowed("reader", pattern) || !tokenRouteAllowed("writer", pattern) || !tokenRouteAllowed("publisher", pattern) {
		t.Fatal("reaction map must be limited to writers")
	}
}

func TestReactionMapUsesVisibleAnchorsAndScrollDepth(t *testing.T) {
	a, post := interactionFixture(t)
	content := `Before.

A **little room** for ideas.

[Poll]
{"id":"choice-1","title":"Which path?","description":"Choose together","type":"agree-disagree","allowReason":true}
[/Poll]

After.

` + "```json\n{\"secret\":\"SOURCE_ONLY\"}\n```"
	post = responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "content": content}, true), 200)
	quote := "A little room for ideas."
	question, note, pending := uuid(), uuid(), uuid()
	ctx := context.Background()
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,'Reader','reader@example.test','Question',TRUE)", question, post["id"])
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,'Reader','reader@example.test','Approved note',TRUE)", note, post["id"])
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,'Reader','reader@example.test','Private pending note',FALSE)", pending, post["id"])
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'question',$3,$4,0)", question, post["id"], quote, post["revision"])
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'note',$3,$4,0)", note, post["id"], quote, post["revision"])
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'note',$3,$4,0)", pending, post["id"], quote, post["revision"])
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'vote','Which path?',$3,0)", uuid(), post["id"], post["revision"])
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'reaction',$3,$4,0)", uuid(), post["id"], quote, post["revision"])
	visit := analyticsPayload(post)
	visit["events"] = []Row{{"id": uuid(), "kind": "highlight", "target": quote, "sectionId": "intro"}}
	analyticsSubmit(t, a, visit)
	path := "/api/analytics/reaction-map?postId=" + post.str("id")
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	response := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if response["views"] != float64(1) {
		t.Fatalf("views: %v", response["views"])
	}
	segments := response["segments"].([]any)
	assertReactionMapCounts(t, segments)
	assertReactionMapText(t, segments)
	expectStatus(t, request(t, a, "GET", "/api/analytics/reaction-map?postId=bad", nil, true), 400)
}

func assertReactionMapCounts(t *testing.T, segments []any) {
	t.Helper()
	totals := map[string]int{"questions": 0, "votes": 0, "reactions": 0, "highlights": 0, "scroll": 0}
	for _, item := range segments {
		segment := object(item)
		for key := range totals {
			totals[key] += int(segment[key].(float64))
		}
	}
	for _, key := range []string{"questions", "votes", "reactions", "highlights"} {
		if totals[key] != 1 {
			t.Errorf("got %d %s, want 1", totals[key], key)
		}
	}
	if totals["scroll"] <= 0 {
		t.Errorf("expected positive scroll depth, got %d", totals["scroll"])
	}
	for _, item := range segments {
		if _, exposed := object(item)["notes"]; exposed {
			t.Fatal("historical public notes must not appear in reaction map")
		}
	}
}

func assertReactionMapText(t *testing.T, segments []any) {
	t.Helper()
	var visible strings.Builder
	for _, item := range segments {
		visible.WriteString(object(item).str("text"))
	}
	for _, label := range []string{"Before.", "Poll: Which path?", "Choose together", "Agree", "Disagree", "After.", "Code example"} {
		if !strings.Contains(visible.String(), label) {
			t.Fatalf("reaction map omitted visible label %q: %s", label, visible.String())
		}
	}
	for _, source := range []string{"choice-1", "SOURCE_ONLY", "allowReason", "[/Poll]", "{\""} {
		if strings.Contains(visible.String(), source) {
			t.Fatalf("reaction map leaked block source %q: %s", source, visible.String())
		}
	}
}

func TestReactionMapScrollDepthThresholds(t *testing.T) {
	a, post := interactionFixture(t)
	for _, depth := range []int{0, 50, 100} {
		visit := analyticsPayload(post)
		visit["scrollDepth"] = depth
		analyticsSubmit(t, a, visit)
	}
	day := time.Now().UTC().Format("2006-01-02")
	segments := make([]reactionSegment, 4)
	views := a.addScrollHeat(httptest.NewRequest("GET", "http://blog.test", nil), analyticsRange{From: day, To: day}, post.str("id"), segments)
	if views != 3 {
		t.Fatalf("views: got %d, want 3", views)
	}
	for index, want := range []int{2, 2, 1, 1} {
		if segments[index].Scroll != want || segments[index].Score != want {
			t.Fatalf("segment %d: got scroll=%d score=%d, want %d", index, segments[index].Scroll, segments[index].Score, want)
		}
	}
	if got := a.addScrollHeat(httptest.NewRequest("GET", "http://blog.test", nil), analyticsRange{From: day, To: day}, post.str("id"), nil); got != 3 {
		t.Fatalf("empty map views: got %d, want 3", got)
	}
}
