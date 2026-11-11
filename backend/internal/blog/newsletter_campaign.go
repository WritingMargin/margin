package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type campaignSnapshot struct {
	Issue     newsletterIssue `json:"issue"`
	PostIDs   []string        `json:"postIds"`
	Revisions []string        `json:"revisions"`
}

func (a *App) campaignRoutes() {
	a.mux.HandleFunc("GET /api/newsletter/campaigns", a.listCampaigns)
	a.mux.HandleFunc("POST /api/newsletter/campaigns", a.createCampaign)
	a.mux.HandleFunc("GET /api/newsletter/campaigns/{id}", a.getCampaign)
	a.mux.HandleFunc("POST /api/newsletter/campaigns/{id}/test", a.testCampaign)
	a.mux.HandleFunc("POST /api/newsletter/campaigns/{id}/send", a.queueCampaign)
}
func (a *App) campaignReady(ctx context.Context) Row {
	config := a.newsletterStatus(ctx, nil)
	if !config.yes("enabled") || !config.yes("ready") {
		fail(409, "Enable and configure newsletter delivery in Readers settings first.")
	}
	return config
}
func campaignAccent(theme Row) string {
	accent := sectionColor(theme, object(theme["homepage"]), "accent")
	if !newsletterAccent.MatchString(accent) {
		return defaultTheme().str("accent")
	}
	return accent
}
func (a *App) campaignSnapshot(ctx context.Context, input Row) campaignSnapshot {
	strict(input, "subject", "intro", "postIds")
	subject := stringField(input, "subject", 1, 200, true)
	if strings.ContainsAny(subject, "\r\n") {
		fail(400, "Use a single line for the subject.")
	}
	if _, exists := input["intro"]; !exists {
		input["intro"] = ""
	}
	intro := stringField(input, "intro", 0, 2000, true)
	ids := campaignPostIDs(input["postIds"])
	theme, origin := a.settings(ctx), a.newsletterOrigin(ctx)
	issue := newsletterIssue{Publication: theme.str("name"), PublicationURL: origin, Subject: subject, Intro: intro, Accent: campaignAccent(theme), UnsubscribeURL: origin + "/newsletter/unsubscribe#" + strings.Repeat("0", 64), Preview: true}
	result := campaignSnapshot{Issue: issue, PostIDs: ids, Revisions: []string{}}
	for _, id := range ids {
		post := first(a.DB.Must(ctx, "SELECT * FROM posts WHERE id=$1 AND status='published'", id))
		if post == nil {
			fail(409, "Choose only published articles. One of these articles is no longer available.")
		}
		result.Issue.Stories = append(result.Issue.Stories, campaignStory(post, origin))
		result.Revisions = append(result.Revisions, post.str("revision"))
	}
	if _, err := newsletterIssueHTML(result.Issue); err != nil {
		fail(400, "Check the publication name, article previews and public URL before creating a campaign.")
	}
	return result
}
func campaignPostIDs(value any) []string {
	data, _ := json.Marshal(value)
	var ids []string
	if json.Unmarshal(data, &ids) != nil || len(ids) < 1 || len(ids) > 5 {
		fail(400, "Choose between one and five published articles.")
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if id == "" || seen[id] {
			fail(400, "Choose each article only once.")
		}
		seen[id] = true
	}
	return ids
}
func campaignStory(post Row, origin string) newsletterStory {
	story := newsletterStory{Title: post.str("title"), Excerpt: rssShortSummary(rssSummary(post, "")), URL: origin + "/post/" + url.PathEscape(post.str("slug"))}
	tags := rssTags(post["tags"])
	if len(tags) > 0 {
		story.Category = tags[0]
	}
	cover := campaignCover(post.str("cover"), origin)
	if newsletterWebURL(cover) {
		story.CoverURL = cover
	}
	return story
}
func (a *App) listCampaigns(w http.ResponseWriter, r *http.Request) {
	campaigns := a.DB.Must(r.Context(), "SELECT id,revision,status,configuration,created_at,queued_at FROM newsletter_campaigns ORDER BY created_at DESC LIMIT 100")
	for _, campaign := range campaigns {
		a.campaignPublic(r.Context(), campaign, false)
	}
	posts := a.DB.Must(r.Context(), "SELECT id,title FROM posts WHERE status='published' ORDER BY created_at DESC LIMIT 100")
	send(w, 200, Row{"campaigns": campaigns, "posts": posts})
}
func (a *App) createCampaign(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "campaign-draft", 30, time.Hour, true)
	a.campaignReady(r.Context())
	snapshot := a.campaignSnapshot(r.Context(), body(w, r))
	data, err := json.Marshal(snapshot)
	must(err)
	row := first(a.DB.Must(r.Context(), "INSERT INTO newsletter_campaigns(id,revision,configuration) VALUES($1,$2,$3) RETURNING *", uuid(), uuid(), string(data)))
	a.campaignPublic(r.Context(), row, true)
	send(w, 201, row)
}
func (a *App) campaign(ctx context.Context, id string) Row {
	row := first(a.DB.Must(ctx, "SELECT * FROM newsletter_campaigns WHERE id=$1", id))
	if row == nil {
		fail(404, "Campaign not found.")
	}
	return row
}
func decodeCampaign(row Row) campaignSnapshot {
	var snapshot campaignSnapshot
	must(json.Unmarshal([]byte(encode(row["configuration"])), &snapshot))
	return snapshot
}
func (a *App) campaignPublic(ctx context.Context, row Row, preview bool) {
	snapshot := decodeCampaign(row)
	row["subject"], row["accent"] = snapshot.Issue.Subject, snapshot.Issue.Accent
	row["counts"] = a.DB.Must(ctx, "SELECT status,COUNT(*) AS total FROM newsletter_deliveries WHERE campaign_id=$1 GROUP BY status", row["id"])
	row["audience"] = first(a.DB.Must(ctx, "SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE status='subscribed'"))["total"]
	if preview {
		content, err := newsletterIssueHTML(snapshot.Issue)
		must(err)
		row["html"] = content
	}
	delete(row, "configuration")
}
func (a *App) getCampaign(w http.ResponseWriter, r *http.Request) {
	row := a.campaign(r.Context(), r.PathValue("id"))
	a.campaignPublic(r.Context(), row, true)
	send(w, 200, row)
}
func (a *App) requireCampaignCurrent(ctx context.Context, row Row, revision string) campaignSnapshot {
	if row.str("revision") != revision {
		fail(409, "Reload this campaign before sending.")
	}
	snapshot := decodeCampaign(row)
	current := a.campaignSnapshot(ctx, Row{"subject": snapshot.Issue.Subject, "intro": snapshot.Issue.Intro, "postIds": snapshot.PostIDs})
	if encode(snapshot) != encode(current) {
		fail(409, "The articles or blog design changed. Create a fresh preview before sending.")
	}
	return snapshot
}
func (a *App) testCampaign(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "campaign-test", 10, time.Hour, true)
	input := body(w, r)
	strict(input, "email", "revision")
	email := emailField(input, "email", true)
	config := a.campaignReady(r.Context())
	row := a.campaign(r.Context(), r.PathValue("id"))
	snapshot := a.requireCampaignCurrent(r.Context(), row, input.str("revision"))
	snapshot.Issue.Subject = "[Test] " + snapshot.Issue.Subject
	// A test does not enroll its recipient or change their subscription. Its footer
	// points to the journal; real campaigns receive a per-recipient unsubscribe link.
	snapshot.Issue.UnsubscribeURL = snapshot.Issue.PublicationURL + "/newsletter/unsubscribe#" + strings.Repeat("0", 64)
	a.deliverCampaign(r.Context(), config, email, snapshot.Issue, hash(uuid()))
	send(w, 200, Row{"accepted": true})
}
func (a *App) deliverCampaign(ctx context.Context, config Row, email string, issue newsletterIssue, key string) {
	if config.str("delivery") == "managed" {
		input := a.managedNewsletterInput(ctx, config)
		input["blogName"], input["publicUrl"], input["to"], input["issue"], input["messageKey"] = issue.Publication, issue.PublicationURL, email, issue, key
		result := a.serviceRequest(ctx, "/v1/newsletter/campaign", input, "")
		if !result.yes("accepted") {
			fail(502, "Email acceptance could not be confirmed.")
		}
		return
	}
	content, err := newsletterIssueHTML(issue)
	must(err)
	a.sendSMTPMessage(ctx, config.str("effectiveSenderEmail"), email, issue.Publication, issue.Subject, content)
}

func campaignCover(raw, origin string) string {
	raw = coverImage(raw)
	if raw == "" {
		return ""
	}
	base, err := url.Parse(origin + "/")
	if err != nil {
		return ""
	}
	relative, err := url.Parse(mediaPath(raw))
	if err != nil {
		return ""
	}
	resolved := base.ResolveReference(relative).String()
	if !newsletterWebURL(resolved) {
		return ""
	}
	return resolved
}
