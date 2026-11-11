package blog

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// TestHomepageHundredPreviewLocal is an opt-in, loopback-only browser fixture.
// MARGIN_HUNDRED_POST_PREVIEW=1 go test ./internal/blog -run '^TestHomepageHundredPreviewLocal$' -v -timeout=3h
func TestHomepageHundredPreviewLocal(t *testing.T) {
	if os.Getenv("MARGIN_HUNDRED_POST_PREVIEW") != "1" {
		t.Skip("set MARGIN_HUNDRED_POST_PREVIEW=1 to run the local browser preview")
	}
	a, _ := coreFixture(t)
	setupFixtureOwner(t, a)
	a.Web = os.DirFS("../../../dist/client")
	expectStatus(t, request(t, a, "PUT", "/api/settings", defaultTheme(), true), 200)
	subjects := []string{"a calmer writing routine", "designing with fewer distractions", "making space for good ideas", "noticing the everyday", "building useful small things", "reading more thoughtfully", "learning through experiments", "working at a sustainable pace", "keeping a creative notebook", "finding your own perspective"}
	topics := []string{"Writing", "Design", "Creativity", "Everyday life", "Making", "Reading", "Learning", "Work", "Writing", "Creativity"}
	formats := []string{"A few thoughts on %s", "What I learned about %s", "Small experiments in %s", "The quiet value of %s", "A practical guide to %s", "Finding a rhythm for %s", "Questions worth asking about %s", "The unexpected joy of %s", "Notes from a month of %s", "A different approach to %s"}
	excerpts := []string{"A few practical observations, one small experiment, and a question to carry into the week.", "What changes when we slow down long enough to pay attention to the details?", "There is something useful in starting small. Here are the lessons worth keeping.", "An invitation to reconsider familiar habits and make room for a different way of working.", "Notes from the messy middle: the choices that helped, the ideas that did not, and what comes next."}
	for i := 0; i < 100; i++ {
		title := fmt.Sprintf(formats[i/10], subjects[i%10])
		body := "# " + title + "\n\n" + strings.Repeat("Good ideas often begin with an ordinary observation. Taking time to notice it gives us somewhere to start.\n\n", 20)
		p := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": title, "slug": fmt.Sprintf("journal-%03d", i+1), "excerpt": excerpts[i%5], "content": body, "status": "published", "tags": []string{topics[i%10]}}, true), 201)
		date := time.Date(2026, 10, 15, 9, 0, 0, 0, time.UTC).AddDate(0, 0, -i).Format("2006-01-02T15:04:05.000Z")
		a.DB.Must(context.Background(), "UPDATE posts SET created_at=$1,updated_at=$1 WHERE id=$2", date, p["id"])
	}
	listener, err := net.Listen("tcp", "127.0.0.1:57491")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/preview-login" {
			a.startSession(w, r)
			http.Redirect(w, r, "/admin/designer/homepage", http.StatusFound)
			return
		}
		a.ServeHTTP(w, r)
	})}
	defer server.Close()
	go server.Serve(listener)
	t.Log("PREVIEW http://127.0.0.1:57491/")
	time.Sleep(2 * time.Hour)
}
