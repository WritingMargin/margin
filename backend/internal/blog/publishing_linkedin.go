package blog

import (
	"context"
	"net/http"
)

// The server derives the destination and public article from the reviewed revision.
func (a *App) linkedInReview(ctx context.Context, input Row) (Row, Row) {
	row := a.publishingConnection(ctx, "linkedin")
	if row == nil {
		fail(409, "Connect a LinkedIn personal profile in Settings first.")
	}
	post := a.getPost(ctx, stringField(input, "id", 1, 128, true))
	if post.str("status") != "published" {
		fail(409, "Publish the article before sharing it.")
	}
	origin := a.searchOrigin(ctx)
	if origin == "" {
		fail(409, "Configure the public HTTPS publication URL first.")
	}
	text := stringField(input, "text", 1, 3000, true)
	url := readableLinks(post, origin).str("canonical")
	review := Row{"profile": row["display_name"], "url": url, "title": post["title"], "text": text}
	review["review"] = hash(encode([]any{row["connection_id"], post["revision"], review}))
	return row, review
}
func (a *App) previewLinkedIn(w http.ResponseWriter, r *http.Request) {
	a.requireOAuthOwner(r)
	input := body(w, r)
	strict(input, "id", "text")
	_, review := a.linkedInReview(r.Context(), input)
	send(w, 200, review)
}
func (a *App) publishLinkedIn(w http.ResponseWriter, r *http.Request) {
	a.requireOAuthOwner(r)
	input := body(w, r)
	strict(input, "id", "text", "review")
	ctx := r.Context()
	row, review := a.linkedInReview(ctx, input)
	if input.str("review") != review.str("review") {
		fail(409, "The article, message or connected profile changed. Review the share again.")
	}
	token := a.publishingToken(ctx, row)
	fingerprint := hash(encode([]any{row["subject"], review["url"], review["text"]}))
	claim := a.DB.Must(ctx, "INSERT INTO linkedin_shares(fingerprint) VALUES($1) ON CONFLICT(fingerprint) DO NOTHING RETURNING fingerprint", fingerprint)
	if len(claim) == 0 {
		receipt := first(a.DB.Must(ctx, "SELECT receipt FROM linkedin_shares WHERE fingerprint=$1", fingerprint)).str("receipt")
		if receipt == "" {
			fail(409, "Delivery has not been confirmed. Check your LinkedIn profile before sharing again.")
		}
		send(w, 200, Row{"receipt": receipt})
		return
	}
	content := Row{"shareCommentary": Row{"text": review["text"]}, "shareMediaCategory": "ARTICLE", "media": []Row{{"status": "READY", "originalUrl": review["url"], "title": Row{"text": review["title"]}}}}
	payload := Row{"author": "urn:li:person:" + row.str("subject"), "lifecycleState": "PUBLISHED", "visibility": Row{"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}, "specificContent": Row{"com.linkedin.ugc.ShareContent": content}}
	res, err := a.callPublishingProvider(ctx, token, "POST", "https://api.linkedin.com/v2/ugcPosts", payload)
	if err != nil {
		fail(502, "Delivery is uncertain. Check your LinkedIn profile before sharing again.")
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 && res.StatusCode < 500 && res.StatusCode != 408 {
		a.DB.Must(ctx, "DELETE FROM linkedin_shares WHERE fingerprint=$1", fingerprint)
		fail(502, "LinkedIn declined the share. Check the account permissions and message before retrying.")
	}
	receipt := res.Header.Get("X-Restli-Id")
	if res.StatusCode != 201 || receipt == "" {
		fail(502, "LinkedIn did not confirm delivery. Check your profile before sharing again.")
	}
	a.DB.Must(ctx, "UPDATE linkedin_shares SET receipt=$1 WHERE fingerprint=$2", receipt, fingerprint)
	send(w, 200, Row{"receipt": receipt})
}
