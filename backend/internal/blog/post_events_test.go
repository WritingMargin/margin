package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type postEventRecorder struct {
	headers http.Header
	packets chan string
}

func (w *postEventRecorder) Header() http.Header { return w.headers }
func (w *postEventRecorder) WriteHeader(int)     {}
func (w *postEventRecorder) Write(data []byte) (int, error) {
	w.packets <- string(data)
	return len(data), nil
}
func (w *postEventRecorder) Flush() {}
func openPostStream(t *testing.T, a *App, path, key string) (*postEventRecorder, func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "http://blog.test"+path, nil).WithContext(ctx)
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	} else {
		req.AddCookie(&http.Cookie{Name: sessionCookieName("margin_session"), Value: "live-session"})
	}
	out := &postEventRecorder{headers: http.Header{}, packets: make(chan string, 10)}
	done := make(chan struct{})
	go func() { defer close(done); a.ServeHTTP(out, req) }()
	close := func() {
		cancel()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Error("post stream did not stop")
		}
	}
	t.Cleanup(close)
	return out, close
}
func readPostPacket(t *testing.T, out *postEventRecorder) string {
	t.Helper()
	select {
	case packet := <-out.packets:
		return packet
	case <-time.After(4 * time.Second):
		t.Fatal("no post event received")
		return ""
	}
}
func testPostEventLifecycle(t *testing.T, a *App) {
	reader := roleToken(t, a, "reader")
	saved := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("live-post"), true), 201)
	path := "/api/posts/" + saved.str("id")
	expectStatus(t, request(t, a, "GET", path+"/events", nil, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/posts/missing/events", nil, true), 404)
	out, close := openPostStream(t, a, path+"/events", reader)
	packet := readPostPacket(t, out)
	if !strings.Contains(packet, saved.str("revision")) || strings.Contains(packet, saved.str("content")) {
		t.Fatal(packet)
	}
	if out.Header().Get("X-Accel-Buffering") != "no" {
		t.Fatal(out.Header())
	}
	saved = responseRow(t, request(t, a, "PUT", path, Row{"revision": saved["revision"], "content": "Agent saved fresh content"}, true), 200)
	if packet = readPostPacket(t, out); !strings.Contains(packet, saved.str("revision")) {
		t.Fatal(packet)
	}
	close()
	// Reconnects always receive the current revision, including updates missed offline.
	db := a.DB
	if db.Kind == "postgres" {
		// A separate server pool must receive commits without sharing a local hub.
		var err error
		db, err = OpenDatabase(db.dsn, "")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.SQL.Close() })
	}
	other := NewApp(db, a.Storage, a.Client, a.Web)
	out, _ = openPostStream(t, other, path+"/events", reader)
	if packet = readPostPacket(t, out); !strings.Contains(packet, saved.str("revision")) {
		t.Fatal(packet)
	}
	expectStatus(t, request(t, a, "DELETE", path, Row{"revision": saved["revision"]}, true), 200)
	if packet = readPostPacket(t, out); !strings.Contains(packet, `"deleted":true`) {
		t.Fatal(packet)
	}
}
func TestPostEventLifecycle(t *testing.T) { a, _ := coreFixture(t); testPostEventLifecycle(t, a) }
func TestPostgreSQLPostEventLifecycle(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _ := postgresApp(t, db)
	testPostEventLifecycle(t, a)
}
func TestPostEventRevokedToken(t *testing.T) {
	a, _ := coreFixture(t)
	reader := roleToken(t, a, "reader")
	saved := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("live-auth"), true), 201)
	out, _ := openPostStream(t, a, "/api/posts/"+saved.str("id")+"/events", reader)
	readPostPacket(t, out)
	a.DB.Must(context.Background(), "DELETE FROM api_tokens WHERE token_hash=$1", hash(reader))
	responseRow(t, request(t, a, "PUT", "/api/posts/"+saved.str("id"), Row{"revision": saved["revision"], "content": "Changed after token revocation"}, true), 200)
	if packet := readPostPacket(t, out); !strings.Contains(packet, "event: unauthorized") {
		t.Fatal(packet)
	}
}

func TestPostEventBrowserSessionAndMount(t *testing.T) {
	a, _ := coreFixture(t)
	saved := responseRow(t, request(t, a, "POST", "/api/posts", draftInput("live-browser"), true), 201)
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	a.DB.Must(context.Background(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("live-session"), "2099-01-01T00:00:00.000Z")
	out, _ := openPostStream(t, a, "/blog/api/posts/"+saved.str("id")+"/events", "")
	if packet := readPostPacket(t, out); !strings.Contains(packet, saved.str("revision")) {
		t.Fatal(packet)
	}
	a.DB.Must(context.Background(), "DELETE FROM sessions WHERE token_hash=$1", hash("live-session"))
	responseRow(t, request(t, a, "PUT", "/blog/api/posts/"+saved.str("id"), Row{"revision": saved["revision"], "content": "Changed after logout"}, true), 200)
	if packet := readPostPacket(t, out); !strings.Contains(packet, "event: unauthorized") {
		t.Fatal(packet)
	}
}

func readPostEventData(t *testing.T, out *postEventRecorder) Row {
	t.Helper()
	packet := readPostPacket(t, out)
	_, data, ok := strings.Cut(packet, "data: ")
	if !ok {
		t.Fatal(packet)
	}
	var event Row
	if err := json.Unmarshal([]byte(strings.TrimSpace(data)), &event); err != nil {
		t.Fatal(err)
	}
	return event
}
func assertPostEventRevisions(t *testing.T, out *postEventRecorder, live, draft string) {
	t.Helper()
	event := readPostEventData(t, out)
	if event.str("revision") != live || event.str("draftRevision") != draft {
		t.Fatal(event)
	}
	if draft == "" {
		if _, present := event["draftRevision"]; present {
			t.Fatal("empty staged revision must be omitted", event)
		}
	}
}
func TestPostEventsFollowStagedDraftAndDiscard(t *testing.T) {
	a, _ := coreFixture(t)
	saved := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Staged events", "slug": "staged-events", "content": "Live version", "status": "published"}, true), 201)
	path := "/api/posts/" + saved.str("id")
	out, _ := openPostStream(t, a, path+"/events", roleToken(t, a, "writer"))
	assertPostEventRevisions(t, out, saved.str("revision"), "")
	staged := responseRow(t, request(t, a, "PUT", path+"/draft", Row{"revision": saved["revision"], "content": "Team edit"}, true), 200)
	assertPostEventRevisions(t, out, saved.str("revision"), staged.str("revision"))
	// Existing REST consumers still receive the current live revision. A live
	// edit is observable even while the staged revision remains unchanged.
	live := responseRow(t, request(t, a, "PUT", path, Row{"revision": saved["revision"], "content": "Updated live version"}, true), 200)
	assertPostEventRevisions(t, out, live.str("revision"), staged.str("revision"))
	expectStatus(t, request(t, a, "DELETE", path+"/draft", Row{"revision": staged["revision"]}, true), 200)
	assertPostEventRevisions(t, out, live.str("revision"), "")
}
