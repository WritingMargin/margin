package blog

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func campaignFixture(t *testing.T) (*App, Row, *[]Row) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.example.com")
	messages := []Row{}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true, "effectiveSenderEmail": "journal@margin.dev"}), nil
		case "/v1/newsletter/campaign":
			var input Row
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			messages = append(messages, input)
			return fixtureResponse(Row{"accepted": true}), nil
		default:
			t.Fatalf("unexpected Central request %s", r.URL)
			return nil, nil
		}
	})
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", Row{"enabled": true, "delivery": "managed", "senderEmail": ""}, true), 200)
	post := readableFixturePost(t, a, "published", "newsletter-story", "A full article body.")
	return a, post, &messages
}
func campaignDraft(t *testing.T, a *App, post Row) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/newsletter/campaigns", Row{"subject": "From the journal", "intro": "A note for our readers.", "postIds": []string{post.str("id")}}, true), 201)
}
func campaignSubscriber(a *App, email, status string) {
	a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,unsubscribe_hash) VALUES($1,$2,$3)", email, status, hash(newsletterToken()))
}
func queueFixtureCampaign(t *testing.T, a *App, draft Row, audience int) Row {
	t.Helper()
	return responseRow(t, request(t, a, "POST", "/api/newsletter/campaigns/"+draft.str("id")+"/send", Row{"revision": draft["revision"], "audience": audience}, true), 202)
}
func TestNewsletterCampaignAccentPrecedenceAndContrast(t *testing.T) {
	cases := []struct {
		theme Row
		want  string
	}{
		{Row{}, "#202020"},
		{Row{"accent": "#396548"}, "#396548"},
		{Row{"accent": "#396548", "homepage": Row{"accent": "#2457c5"}}, "#2457c5"},
		{Row{"accent": "#396548", "homepage": Row{"accent": ""}}, "#396548"},
	}
	for _, tc := range cases {
		if got := campaignAccent(tc.theme); got != tc.want {
			t.Fatalf("accent %s, want %s", got, tc.want)
		}
	}
	if newsletterButtonText("#a9c7ff") != "#172033" || newsletterButtonText("#202020") != "#ffffff" {
		t.Fatal("button text does not contrast with light/dark accents")
	}
}
func TestNewsletterCampaignReviewUsesBlogTemplateColor(t *testing.T) {
	a, post, _ := campaignFixture(t)
	theme := a.settings(context.Background())
	theme["accent"] = "#396548"
	object(theme["homepage"])["accent"] = "#a9c7ff"
	a.DB.Must(context.Background(), "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", encode(theme))
	draft := campaignDraft(t, a, post)
	requireReadableText(t, draft.str("html"), "background-color:#a9c7ff", "color:#172033", "Read the story", "https://blog.example.com/post/newsletter-story")
	if draft.str("accent") != "#a9c7ff" {
		t.Fatal("template accent missing")
	}
	if strings.Contains(draft.str("html"), ">Unsubscribe</a>") {
		t.Fatal("test preview exposes a nonfunctional unsubscribe link")
	}
}
func TestNewsletterCampaignQueueExcludesUnconfirmedAndDoesNotReplay(t *testing.T) {
	a, post, messages := campaignFixture(t)
	for _, status := range []string{"subscribed", "pending", "unsubscribed"} {
		campaignSubscriber(a, status+"@example.com", status)
	}
	draft := campaignDraft(t, a, post)
	queueFixtureCampaign(t, a, draft, 1)
	responseRow(t, request(t, a, "POST", "/api/newsletter/campaigns/"+draft.str("id")+"/send", Row{"revision": draft["revision"], "audience": 1}, true), 200)
	a.campaignTick(context.Background())
	a.campaignTick(context.Background())
	if len(*messages) != 1 || (*messages)[0].str("to") != "subscribed@example.com" {
		t.Fatal("duplicate or unconfirmed recipient", len(*messages))
	}
	issue := object((*messages)[0]["issue"])
	token := strings.TrimPrefix(issue.str("unsubscribeUrl"), "https://blog.example.com/newsletter/unsubscribe#")
	if !newsletterTokenRE.MatchString(token) || issue.yes("preview") {
		t.Fatal("missing real campaign unsubscribe token")
	}
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/unsubscribe", Row{"token": token}, false), 200)
	if first(a.DB.Must(context.Background(), "SELECT status FROM newsletter_subscribers WHERE email='subscribed@example.com'")).str("status") != "unsubscribed" {
		t.Fatal("campaign unsubscribe did not suppress reader")
	}
	if a.campaign(context.Background(), draft.str("id")).str("status") != "complete" {
		t.Fatal("campaign not completed")
	}
}
func TestNewsletterCampaignSkipsReadersWhoLeaveAfterQueue(t *testing.T) {
	a, post, messages := campaignFixture(t)
	campaignSubscriber(a, "reader@example.com", "subscribed")
	draft := campaignDraft(t, a, post)
	queueFixtureCampaign(t, a, draft, 1)
	a.DB.Must(context.Background(), "UPDATE newsletter_subscribers SET status='unsubscribed'")
	a.campaignTick(context.Background())
	if len(*messages) != 0 || first(a.DB.Must(context.Background(), "SELECT status FROM newsletter_deliveries")).str("status") != "skipped" {
		t.Fatal("unsubscribed reader was not suppressed")
	}
}
func TestNewsletterCampaignRejectsStaleReviewAndAudience(t *testing.T) {
	a, post, _ := campaignFixture(t)
	campaignSubscriber(a, "reader@example.com", "subscribed")
	draft := campaignDraft(t, a, post)
	path := "/api/newsletter/campaigns/" + draft.str("id") + "/send"
	expectStatus(t, request(t, a, "POST", path, Row{"revision": draft["revision"], "audience": 2}, true), 409)
	if len(a.DB.Must(context.Background(), "SELECT * FROM newsletter_deliveries")) != 0 {
		t.Fatal("audience conflict partially queued")
	}
	a.DB.Must(context.Background(), "UPDATE posts SET revision=$1 WHERE id=$2", uuid(), post["id"])
	expectStatus(t, request(t, a, "POST", path, Row{"revision": draft["revision"], "audience": 1}, true), 409)
}
func TestNewsletterCampaignTestDoesNotSubscribeRecipient(t *testing.T) {
	a, post, messages := campaignFixture(t)
	draft := campaignDraft(t, a, post)
	responseRow(t, request(t, a, "POST", "/api/newsletter/campaigns/"+draft.str("id")+"/test", Row{"revision": draft["revision"], "email": "test@example.com"}, true), 200)
	if len(*messages) != 1 || len(a.DB.Must(context.Background(), "SELECT email FROM newsletter_subscribers")) != 0 {
		t.Fatal("test changed audience or did not send")
	}
	issue := object((*messages)[0]["issue"])
	if !issue.yes("preview") || !strings.HasPrefix(issue.str("subject"), "[Test]") {
		t.Fatal("test email not identified")
	}
}
func TestNewsletterCampaignAmbiguousSendDoesNotRetry(t *testing.T) {
	a, post, _ := campaignFixture(t)
	campaignSubscriber(a, "reader@example.com", "subscribed")
	draft := campaignDraft(t, a, post)
	queueFixtureCampaign(t, a, draft, 1)
	previous := a.Client.Transport
	sends := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/newsletter/campaign" {
			sends++
			return nil, fmt.Errorf("connection lost after DATA")
		}
		return previous.RoundTrip(r)
	})
	a.campaignTick(context.Background())
	a.campaignTick(context.Background())
	if sends != 1 || first(a.DB.Must(context.Background(), "SELECT status FROM newsletter_deliveries")).str("status") != "uncertain" {
		t.Fatal("ambiguous send replayed")
	}
}
func TestNewsletterCampaignInterruptedSendNeedsReview(t *testing.T) {
	a, post, messages := campaignFixture(t)
	campaignSubscriber(a, "reader@example.com", "subscribed")
	draft := campaignDraft(t, a, post)
	queueFixtureCampaign(t, a, draft, 1)
	a.DB.Must(context.Background(), "UPDATE newsletter_deliveries SET status='sending',started_at=$1", time.Now().Add(-time.Hour).Unix())
	a.campaignTick(context.Background())
	if len(*messages) != 0 || first(a.DB.Must(context.Background(), "SELECT status FROM newsletter_deliveries")).str("status") != "uncertain" {
		t.Fatal("interrupted send replayed")
	}
}
func TestNewsletterCampaignRequiresOwnerAndPublishedContent(t *testing.T) {
	a, post, _ := campaignFixture(t)
	expectStatus(t, request(t, a, "POST", "/api/newsletter/campaigns", Row{}, false), 401)
	expectStatus(t, request(t, a, "GET", "/api/newsletter/campaigns", nil, false), 401)
	a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", post["id"])
	expectStatus(t, request(t, a, "POST", "/api/newsletter/campaigns", Row{"subject": "News", "intro": "", "postIds": []string{post.str("id")}}, true), 409)
}
func TestNewsletterIssueSMTPAndManagedTemplateStayIdentical(t *testing.T) {
	central, err := os.ReadFile("../../../../margin-central/internal/central/newsletter_issue.html")
	if os.IsNotExist(err) {
		t.Skip("Central source not included in this checkout")
	}
	if err != nil {
		t.Fatal(err)
	}
	if string(central) != newsletterIssueSource {
		t.Fatal("SMTP and managed campaign templates diverged")
	}
}

func TestNewsletterCampaignCoverURLsRespectPublicationMount(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	if got := campaignCover("/api/public/covers/photo", "https://blog.example.com/journal"); got != "https://blog.example.com/journal/api/public/covers/photo" {
		t.Fatal(got)
	}
	for _, raw := range []string{"javascript:alert(1)", "data:image/png;base64,invalid", "", "https://user:secret@example.com/cover.png"} {
		if campaignCover(raw, "https://blog.example.com/journal") != "" {
			t.Fatal("unsafe/empty cover accepted", raw)
		}
	}
}
func TestNewsletterCampaignRoutesExcludeRestrictedTokens(t *testing.T) {
	for _, role := range []string{"writer", "publisher"} {
		for _, route := range []string{"GET /api/newsletter/campaigns", "POST /api/newsletter/campaigns", "GET /api/newsletter/campaigns/{id}", "POST /api/newsletter/campaigns/{id}/test", "POST /api/newsletter/campaigns/{id}/send"} {
			if tokenRouteAllowed(role, route) {
				t.Fatal("restricted token can access newsletter audience", role, route)
			}
		}
	}
}
