package blog

import (
	"context"
	"fmt"
	"html"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// Opt-in local browser fixture. All email stays in a fake inbox; the database is
// in memory. Social options are mocked and no provider is contacted.
func TestCommentVerificationPreview(t *testing.T) {
	if os.Getenv("MARGIN_COMMENT_PREVIEW") != "1" {
		t.Skip("set MARGIN_COMMENT_PREVIEW=1 for the local browser fixture")
	}
	a, _, mail := commentMailFixture(t)
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "preview@example.test", "unused-test-password")
	t.Setenv("PUBLIC_URL", "http://127.0.0.1:57503")
	a.Web = os.DirFS("../../../dist/client")
	transport := a.Client.Transport
	var mailboxMu sync.Mutex
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		mailboxMu.Lock()
		defer mailboxMu.Unlock()
		if r.URL.Path == "/turnstile/v0/siteverify" {
			return fixtureResponse(Row{"success": true, "hostname": "127.0.0.1"}), nil
		}
		return transport.RoundTrip(r)
	})
	expectStatus(t, request(t, a, "PUT", "/api/settings/captcha", Row{"provider": "turnstile", "siteKey": "1x00000000000000000000AA", "secretKey": "test-only"}, true), 200)
	setCommentPolicy(t, a, true, true)
	done := make(chan struct{})
	var stop sync.Once
	handler := commentPreviewHandler(a, mail, &mailboxMu, func() { stop.Do(func() { close(done) }) })
	listener, err := net.Listen("tcp", "127.0.0.1:57503")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	go server.Serve(listener)
	t.Log("Preview: http://127.0.0.1:57503/post/room; inbox: /__preview/mailbox; author: /__preview/login")
	select {
	case <-done:
	case <-time.After(20 * time.Minute):
	}
}

func commentPreviewHandler(a *App, mail *commentMailbox, mailboxMu *sync.Mutex, stop func()) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/__preview/login":
			a.startSession(w, r)
			http.Redirect(w, r, "/admin/readers", http.StatusFound)
		case "/__preview/mailbox":
			mailboxMu.Lock()
			defer mailboxMu.Unlock()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			var body strings.Builder
			body.WriteString("<h1>Test inbox — no emails sent</h1>")
			for i, message := range mail.messages {
				fmt.Fprintf(&body, `<p>Message %d to %s: <a href="/reader/sign-in#%s">Sign in %d</a></p>`, i+1, html.EscapeString(message.str("to")), message.str("verificationToken"), i+1)
			}
			body.WriteString(`<p><a href="/post/room">Article</a> · <a href="/__preview/login">Author settings</a></p><form action="/__preview/stop" method="post"><button>Stop preview</button></form>`)
			fmt.Fprint(w, body.String())
		case "/__preview/stop":
			if r.Method == "POST" {
				fmt.Fprint(w, "Preview stopped")
				stop()
			} else {
				w.WriteHeader(405)
			}
		default:
			a.ServeHTTP(w, r)
		}
	})
}
