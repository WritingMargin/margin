package blog

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// Runs only with explicit opt-in. Google authentication uses real local Central
// and the live Fused Engine. Content is in memory; no email is sent.
func TestCommentGoogleLivePreview(t *testing.T) {
	if os.Getenv("MARGIN_READER_LIVE_PREVIEW") != "1" {
		t.Skip("opt-in live Google browser test")
	}
	data, err := os.ReadFile("/tmp/margin-reader-live-account.json")
	must(err)
	var account Row
	must(json.Unmarshal(data, &account))
	a, _, mail := commentMailFixture(t)
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "preview@example.test", "unused-test-password")
	t.Setenv("PUBLIC_URL", "http://127.0.0.1:57503")
	t.Setenv("AI_SERVICE_URL", "http://127.0.0.1:57504")
	t.Setenv("AI_SERVICE_TOKEN", account.str("token"))
	a.Web = os.DirFS("../../../dist/client")
	transport := a.Client.Transport
	var mu sync.Mutex
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if strings.HasPrefix(r.URL.Path, "/v1/reader-auth/") {
			return http.DefaultTransport.RoundTrip(r)
		}
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path == "/turnstile/v0/siteverify" {
			return fixtureResponse(Row{"success": true, "hostname": "127.0.0.1"}), nil
		}
		return transport.RoundTrip(r)
	})
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "turnstile", "siteKey": "1x00000000000000000000AA", "secretKey": "test-only"}, true), 200)
	setCommentPolicy(t, a, true, false)
	done := make(chan struct{})
	var stop sync.Once
	handler := commentPreviewHandler(a, mail, &mu, func() { stop.Do(func() { close(done) }) })
	listener, err := net.Listen("tcp", "127.0.0.1:57503")
	must(err)
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	go server.Serve(listener)
	t.Log("Local article with LIVE Google: http://127.0.0.1:57503/post/room")
	select {
	case <-done:
	case <-time.After(35 * time.Minute):
	}
}
