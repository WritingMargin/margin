package blog

import (
	"context"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestNewsletterUnsubscribeWithoutAccountOrDelivery(t *testing.T) {
	for _, status := range []string{"pending", "subscribed", "unsubscribed"} {
		t.Run(status, func(t *testing.T) {
			a, _ := coreFixture(t)
			t.Setenv("AI_SERVICE_TOKEN", "")
			a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
				t.Fatalf("unsubscribe must not contact a provider: %s", r.URL)
				return nil, nil
			})
			ctx := context.Background()
			// Readers can leave even when newsletters are paused and managed delivery is unavailable.
			a.DB.Must(ctx, "INSERT INTO newsletter_settings(id,configuration) VALUES(1,$1)", encode(Row{"enabled": false, "delivery": "managed", "senderEmail": ""}))
			token, confirmation := newsletterToken(), newsletterToken()
			a.DB.Must(ctx, "INSERT INTO newsletter_subscribers(email,status,confirmation_hash,confirmation_expires_at,unsubscribe_hash) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours',$4)", "reader@example.com", status, hash(confirmation), hash(token))
			// Merely opening a link (including an email scanner) must not change the subscription.
			request(t, a, "GET", "/newsletter/unsubscribe", nil, false)
			row := first(a.DB.Must(ctx, "SELECT * FROM newsletter_subscribers"))
			if row.str("status") != status {
				t.Fatal("GET changed subscription", row)
			}
			expectStatus(t, request(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": newsletterToken()}, false), 400)
			row = first(a.DB.Must(ctx, "SELECT * FROM newsletter_subscribers"))
			if row.str("status") != status {
				t.Fatal("invalid token changed subscription", row)
			}
			for range 2 {
				responseRow(t, request(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": token}, false), 200)
			}
			row = first(a.DB.Must(ctx, "SELECT * FROM newsletter_subscribers"))
			if row.str("status") != "unsubscribed" || row["confirmation_hash"] != nil || row["confirmation_expires_at"] != nil {
				t.Fatal("unsubscribe did not cancel subscription and pending confirmation", row)
			}
		})
	}
}

func TestNewsletterUnsubscribeFromReaderEmail(t *testing.T) {
	a, _ := coreFixture(t)
	ctx := context.Background()
	token := newsletterToken()
	a.DB.Must(ctx, "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES($1,'subscribed',$2)", "reader@example.com", hash(newsletterToken()))
	a.DB.Must(ctx, "INSERT INTO reader_email_links(token_hash,email,unsubscribe_hash,expires_at) VALUES($1,$2,$3,$4)", hash(newsletterToken()), "reader@example.com", hash(token), time.Now().Add(-time.Hour).UTC().Format(time.RFC3339))
	// Unsubscribe remains usable after the sign-in link expires.
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": token}, false), 200)
	row := first(a.DB.Must(ctx, "SELECT status FROM newsletter_subscribers"))
	if row.str("status") != "unsubscribed" {
		t.Fatal(row)
	}
}

func TestNewsletterEmailEscapesPublicURL(t *testing.T) {
	content := newsletterConfirmationHTML(`https://blog.example.com/notes"<`, strings.Repeat("a", 64), strings.Repeat("b", 64))
	if strings.Contains(content, `notes"<`) {
		t.Fatal("public URL escaped its HTML attribute")
	}
	for _, match := range regexp.MustCompile(`href="([^"]+)"`).FindAllStringSubmatch(content, -1) {
		link, err := url.PathUnescape(html.UnescapeString(match[1]))
		if err == nil && link == `https://blog.example.com/notes"</newsletter/unsubscribe#`+strings.Repeat("b", 64) {
			return
		}
	}
	t.Fatal("escaped unsubscribe link no longer points to the original URL")
}
