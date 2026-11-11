package blog

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type pollOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}
type pollDefinition struct {
	ID                string       `json:"id"`
	Title             string       `json:"title"`
	Description       string       `json:"description"`
	Type              string       `json:"type"`
	Options           []pollOption `json:"options"`
	AllowReason       bool         `json:"allowReason"`
	ResultsVisibility string       `json:"resultsVisibility"`
	ClosesAt          string       `json:"closesAt"`
}

var pollBlockRE = regexp.MustCompile("(?is)(?:```poll\\s*\\n(.*?)\\n```|\\[poll\\]\\s*(.*?)\\s*\\[/poll\\])")
var pollIDRE = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

func (a *App) pollRoutes() {
	a.mux.HandleFunc("GET /api/public/posts/{id}/polls/{poll}", a.publicPoll)
	a.mux.HandleFunc("POST /api/public/posts/{id}/polls/{poll}", a.votePoll)
	a.mux.HandleFunc("GET /api/posts/{id}/polls", a.writerPolls)
	a.mux.HandleFunc("GET /api/posts/{id}/polls/{poll}", a.writerPoll)
	a.mux.HandleFunc("POST /api/posts/{id}/polls/{poll}/close", a.closePoll)
}

func (a *App) postPoll(r *http.Request) (Row, pollDefinition) {
	post := a.publishedInteractionPost(r)
	content, err := a.Storage.Get(r.Context(), post.str("content_key"))
	must(err)
	wanted := r.PathValue("poll")
	var found pollDefinition
	count := 0
	for _, poll := range pollBlocks(string(content)) {
		if poll.ID != wanted {
			continue
		}
		found = poll
		count++
	}
	if count != 1 {
		fail(404, "Poll not found or its ID is not unique in this article.")
	}
	return post, found
}

func pollBlocks(content string) []pollDefinition {
	result := []pollDefinition{}
	for _, match := range pollBlockRE.FindAllStringSubmatch(content, -1) {
		source := match[1]
		if source == "" {
			source = match[2]
		}
		var poll pollDefinition
		decoder := json.NewDecoder(bytes.NewReader([]byte(source)))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&poll) == nil && validPoll(poll) {
			result = append(result, poll)
		}
	}
	return result
}

func validPoll(poll pollDefinition) bool {
	if !pollIDRE.MatchString(poll.ID) || strings.TrimSpace(poll.Title) == "" || len(poll.Title) > 160 {
		return false
	}
	if !validPollSettings(poll) {
		return false
	}
	if poll.Type == "agree-disagree" {
		return len(poll.Options) == 0
	}
	if poll.Type != "multiple-choice" || poll.AllowReason {
		return false
	}
	return validPollOptions(poll.Options)
}

func validPollSettings(poll pollDefinition) bool {
	if poll.ResultsVisibility != "" && poll.ResultsVisibility != "after-vote" && poll.ResultsVisibility != "after-close" {
		return false
	}
	if poll.ResultsVisibility == "after-close" && poll.ClosesAt == "" {
		return false
	}
	if poll.ClosesAt != "" {
		if _, err := time.Parse(time.RFC3339, poll.ClosesAt); err != nil {
			return false
		}
	}
	return true
}

func validPollOptions(options []pollOption) bool {
	if len(options) < 2 || len(options) > 8 {
		return false
	}
	seen := map[string]bool{}
	for _, option := range options {
		if !pollIDRE.MatchString(option.ID) || seen[option.ID] || strings.TrimSpace(option.Label) == "" || len(option.Label) > 160 {
			return false
		}
		seen[option.ID] = true
	}
	return true
}

func pollAllowsOption(poll pollDefinition, id string) bool {
	if poll.Type == "agree-disagree" {
		return id == "agree" || id == "disagree"
	}
	for _, option := range poll.Options {
		if option.ID == id {
			return true
		}
	}
	return false
}

func (a *App) pollClosed(ctx context.Context, post Row, poll pollDefinition) bool {
	if poll.ClosesAt != "" {
		closes, _ := time.Parse(time.RFC3339, poll.ClosesAt)
		if !time.Now().Before(closes) {
			a.DB.Must(ctx, "INSERT INTO poll_closures(post_id,poll_id) VALUES($1,$2) ON CONFLICT(post_id,poll_id) DO NOTHING", post["id"], poll.ID)
			return true
		}
	}
	return first(a.DB.Must(ctx, "SELECT closed_at FROM poll_closures WHERE post_id=$1 AND poll_id=$2", post["id"], poll.ID)) != nil
}

func (a *App) pollResult(r *http.Request, post Row, poll pollDefinition, writer bool) Row {
	var chosen any
	if reader := a.commentReader(r); reader != nil && !writer {
		vote := first(a.DB.Must(r.Context(), "SELECT option_id FROM poll_votes WHERE post_id=$1 AND poll_id=$2 AND reader_id=$3", post["id"], poll.ID, reader["id"]))
		chosen = vote["option_id"]
	}
	closed := a.pollClosed(r.Context(), post, poll)
	visible := writer || closed || poll.ResultsVisibility != "after-close"
	result := Row{"votedOption": chosen, "reasonEnabled": poll.Type == "agree-disagree" && poll.AllowReason, "resultsVisible": visible, "closed": closed, "closesAt": poll.ClosesAt}
	if writer {
		reasons := []Row{}
		for _, row := range a.DB.Must(r.Context(), `SELECT v.option_id,r.reason,r.created_at FROM poll_vote_reasons r JOIN poll_votes v ON v.anchor_id=r.anchor_id
			WHERE v.post_id=$1 AND v.poll_id=$2 ORDER BY r.created_at,r.anchor_id`, post["id"], poll.ID) {
			reasons = append(reasons, Row{"optionId": row["option_id"], "reason": row["reason"], "createdAt": row["created_at"]})
		}
		result["reasons"] = reasons
	}
	if !visible {
		return result
	}
	counts := Row{}
	var total int64
	for _, row := range a.DB.Must(r.Context(), "SELECT option_id,COUNT(*) AS count FROM poll_votes WHERE post_id=$1 AND poll_id=$2 GROUP BY option_id", post["id"], poll.ID) {
		n := row["count"].(int64)
		counts[row.str("option_id")] = n
		total += n
	}
	result["counts"], result["total"] = counts, total
	return result
}

func (a *App) publicPoll(w http.ResponseWriter, r *http.Request) {
	post, poll := a.postPoll(r)
	send(w, 200, a.pollResult(r, post, poll, false))
}

func (a *App) writerPoll(w http.ResponseWriter, r *http.Request) {
	post, poll := a.postPoll(r)
	send(w, 200, a.pollResult(r, post, poll, true))
}

func (a *App) writerPolls(w http.ResponseWriter, r *http.Request) {
	post := a.publishedInteractionPost(r)
	content, err := a.Storage.Get(r.Context(), post.str("content_key"))
	must(err)
	polls := pollBlocks(string(content))
	counts := map[string]int{}
	for _, poll := range polls {
		counts[poll.ID]++
	}
	result := []Row{}
	for _, poll := range polls {
		entry := a.pollResult(r, post, poll, true)
		entry["id"], entry["title"] = poll.ID, poll.Title
		entry["resultsVisibility"] = poll.ResultsVisibility
		if poll.Type == "agree-disagree" {
			entry["options"] = []pollOption{{ID: "agree", Label: "Agree"}, {ID: "disagree", Label: "Disagree"}}
		} else {
			entry["options"] = poll.Options
		}
		entry["duplicate"] = counts[poll.ID] > 1
		result = append(result, entry)
	}
	send(w, 200, Row{"polls": result})
}

func (a *App) closePoll(w http.ResponseWriter, r *http.Request) {
	post, poll := a.postPoll(r)
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	a.execInteraction(r.Context(), tx, "INSERT INTO poll_closures(post_id,poll_id) VALUES($1,$2) ON CONFLICT(post_id,poll_id) DO NOTHING", post["id"], poll.ID)
	must(tx.Commit())
	send(w, 200, a.pollResult(r, post, poll, true))
}

func (a *App) votePoll(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "poll-vote", 30, time.Hour, false)
	reader := a.requireCommentReader(r)
	input := body(w, r)
	post, poll := a.postPoll(r)
	if a.pollClosed(r.Context(), post, poll) {
		fail(409, "Voting has closed for this poll.")
	}
	option, reason := a.validatePollVote(r, input, post, poll)
	a.storePollVote(r, post, poll, reader, option, reason)
	send(w, 200, a.pollResult(r, post, poll, false))
}

func (a *App) validatePollVote(r *http.Request, input, post Row, poll pollDefinition) (string, string) {
	option := stringField(input, "optionId", 1, 64, false)
	if stringField(input, "revision", 1, 100, false) != post.str("revision") {
		coded(409, "This article changed. Reload it before voting.", "REVISION_CONFLICT")
	}
	if !pollAllowsOption(poll, option) {
		fail(400, "Choose an option in this poll.")
	}
	reason := ""
	if _, ok := input["reason"]; ok {
		reason = stringField(input, "reason", 0, 10000, true)
		if reason != "" && (poll.Type != "agree-disagree" || !poll.AllowReason) {
			fail(400, "This poll does not accept a reason.")
		}
	}
	return option, reason
}

func (a *App) storePollVote(r *http.Request, post Row, poll pollDefinition, reader Row, option, reason string) {
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	if a.pollClosedTx(r.Context(), tx, post, poll) {
		fail(409, "Voting has closed for this poll.")
	}
	id := uuid()
	a.insertAnchor(r.Context(), tx, id, post, "vote", poll.Title, 0)
	inserted := a.queryPostTransaction(r.Context(), tx, "INSERT INTO poll_votes(anchor_id,reader_id,post_id,poll_id,option_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(reader_id,post_id,poll_id) DO NOTHING RETURNING anchor_id", id, reader["id"], post["id"], poll.ID, option)
	if inserted == nil {
		fail(409, "You have already voted in this poll.")
	}
	if reason != "" {
		a.execInteraction(r.Context(), tx, "INSERT INTO poll_vote_reasons(anchor_id,reason) VALUES($1,$2)", id, reason)
	}
	must(tx.Commit())
}

func (a *App) pollClosedTx(ctx context.Context, tx *sql.Tx, post Row, poll pollDefinition) bool {
	if poll.ClosesAt != "" {
		closes, _ := time.Parse(time.RFC3339, poll.ClosesAt)
		if !time.Now().Before(closes) {
			a.execInteraction(ctx, tx, "INSERT INTO poll_closures(post_id,poll_id) VALUES($1,$2) ON CONFLICT(post_id,poll_id) DO NOTHING", post["id"], poll.ID)
			return true
		}
	}
	return a.queryPostTransaction(ctx, tx, "SELECT closed_at FROM poll_closures WHERE post_id=$1 AND poll_id=$2", post["id"], poll.ID) != nil
}
