package blog

import (
	"context"
	"database/sql"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func (a *App) createSectionFlag(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "section-flags", 5, 15*time.Minute, false)
	reader := a.requireCommentReader(r)
	post := a.publishedInteractionPost(r)
	input := body(w, r)
	strict(input, "revision", "quote", "occurrence", "kind", "body", "proposedText")
	quote := a.validatePassage(r, input, post)
	kind := enumField(input, "kind", "unclear", "outdated")
	message := stringField(input, "body", 0, 2000, true)
	proposal := stringField(input, "proposedText", 0, 4000, true)
	if message == "" && proposal == "" {
		fail(400, "Explain the issue or propose a fix.")
	}
	occurrence := anchorOccurrence(input)
	position := a.anchorPosition(r.Context(), post, quote, occurrence)
	id := uuid()
	name := reader.str("name")
	if name == "" {
		name = "Reader"
	}
	a.DB.Must(r.Context(), `INSERT INTO section_flags(id,post_id,reader_id,source_revision,quote,occurrence,position,kind,body,proposed_text,display_name)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, post["id"], reader["id"], post["revision"], quote, occurrence, position, kind, message, proposal, name)
	send(w, 201, Row{"id": id, "message": "Your feedback was sent to the writer."})
}

func sectionFlagPublic(row Row) Row {
	if row.str("guide_section") != "" {
		row["kind"] = "step_problem"
	}
	return Row{"id": row["id"], "postId": row["post_id"], "postTitle": row["post_title"], "section": row["guide_section"],
		"quote": row["quote"], "kind": row["kind"], "body": row["body"], "proposedText": row["proposed_text"],
		"status": row["status"], "createdAt": row["created_at"], "contributorName": row["display_name"],
		"acceptedDraftRevision": row["accepted_draft_revision"], "appliedRevision": row["applied_revision"]}
}

func (a *App) sectionFlags(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := moderationChoice(q.Get("status"), "pending", "Invalid flag status.", "all", "pending", "accepted", "applied", "dismissed")
	offset := moderationOffset(q.Get("offset"), "Invalid flag offset.")
	rows := a.DB.Must(r.Context(), `SELECT f.*,p.title AS post_title,g.section AS guide_section FROM section_flags f JOIN posts p ON p.id=f.post_id LEFT JOIN guide_step_flags g ON g.flag_id=f.id
		WHERE ($1='all' OR f.status=$1) ORDER BY f.created_at DESC,f.id DESC LIMIT 21 OFFSET $2`, status, offset)
	hasMore := len(rows) > 20
	if hasMore {
		rows = rows[:20]
	}
	flags := make([]Row, 0, len(rows))
	for _, row := range rows {
		flags = append(flags, sectionFlagPublic(row))
	}
	counts := Row{"pending": int64(0), "accepted": int64(0), "applied": int64(0), "dismissed": int64(0)}
	for _, row := range a.DB.Must(r.Context(), "SELECT status,COUNT(*) AS count FROM section_flags GROUP BY status") {
		counts[row.str("status")] = row["count"]
	}
	send(w, 200, Row{"flags": flags, "hasMore": hasMore, "counts": counts})
}

func (a *App) moderateSectionFlag(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "action", "reviewedContent", "revision")
	action := enumField(input, "action", "accept", "dismiss")
	flag := first(a.DB.Must(r.Context(), "SELECT * FROM section_flags WHERE id=$1", r.PathValue("id")))
	if flag == nil {
		fail(404, "Flag not found.")
	}
	if flag.str("status") != "pending" {
		fail(409, "This flag has already been reviewed.")
	}
	if action == "dismiss" {
		a.DB.Must(r.Context(), "UPDATE section_flags SET status='dismissed',updated_at=NOW() WHERE id=$1 AND status='pending'", flag["id"])
		send(w, 200, Row{"ok": true, "status": "dismissed"})
		return
	}
	revision := a.acceptFlagDraft(r, flag, input)
	a.DB.Must(r.Context(), "UPDATE section_flags SET status='accepted',accepted_draft_revision=$2,updated_at=NOW() WHERE id=$1 AND status='pending'", flag["id"], revision)
	send(w, 200, Row{"ok": true, "status": "accepted", "draftRevision": revision})
}

func (a *App) acceptFlagDraft(r *http.Request, flag, input Row) string {
	_, manual := input["reviewedContent"]
	if flag.str("proposed_text") == "" && !manual {
		fail(400, "This flag has no proposed fix to apply.")
	}
	ctx := r.Context()
	post := a.getPost(ctx, flag.str("post_id"))
	if post.str("status") != "published" {
		fail(409, "Publish this article before applying a reader fix.")
	}
	draft := a.savedPostDraft(ctx, post.str("id"))
	previous := post
	if draft != nil {
		if draft.str("base_revision") != post.str("revision") {
			coded(409, "The working draft is based on an older article revision.", "REVISION_CONFLICT")
		}
		previous = object(draft["snapshot"])
	}
	content := a.postContent(ctx, previous).str("content")
	if manual {
		return a.acceptReviewedFlagDraft(r, post, draft, previous, content, input)
	}
	updated, ok := replaceFlagQuote(content, flag.str("quote"), int(flag["occurrence"].(int64)), flag.str("proposed_text"))
	if !ok {
		fail(409, "Only a unique, complete prose paragraph can be applied automatically. Review and apply this fix manually.")
	}
	return a.savePostDraft(r, post, Row{"revision": previous["revision"], "content": updated}).str("revision")
}

func (a *App) acceptReviewedFlagDraft(r *http.Request, post, draft, previous Row, content string, input Row) string {
	updated := stringField(input, "reviewedContent", 0, 2000000, false)
	revision := stringField(input, "revision", 1, 200, false)
	if updated != content {
		return a.savePostDraft(r, post, Row{"revision": revision, "content": updated}).str("revision")
	}
	if draft == nil || content == a.postContent(r.Context(), post).str("content") {
		fail(400, "Edit the working draft before accepting this reader contribution.")
	}
	if revision != previous.str("revision") {
		coded(409, "The working draft changed. Reload it before accepting this contribution.", "REVISION_CONFLICT")
	}
	return revision
}

func replaceFlagQuote(content, quote string, occurrence int, replacement string) (string, bool) {
	if occurrence != 0 || !plainFlagParagraph(quote) || !plainFlagParagraph(replacement) || strings.Count(content, quote) != 1 {
		return "", false
	}
	// The selected text must be the entire Markdown paragraph, separated by
	// blank lines. A substring can leave a trailing fragment in the draft.
	start := strings.Index(content, quote)
	before, after := content[:start], content[start+len(quote):]
	if before != "" && !strings.HasSuffix(before, "\n\n") {
		return "", false
	}
	if after != "" && !strings.HasPrefix(after, "\n\n") {
		return "", false
	}
	return content[:start] + replacement + content[start+len(quote):], true
}

// Match Markdown block prefixes, including ordered lists with one to four digits.
var flagBlockPrefix = regexp.MustCompile(`^(?:[#>|]|[-+] |---|~~~|[0-9]{1,4}[.)] )`)

func plainFlagParagraph(value string) bool {
	return value != "" && strings.TrimSpace(value) == value &&
		!strings.ContainsAny(value, "\r\n\t`<>[]{}\\*_") && !flagBlockPrefix.MatchString(value)
}

// Only a reviewed draft that was actually published earns credit and an alert.
func (a *App) reconcileAppliedSectionFlags(ctx context.Context, tx *sql.Tx, row Row) {
	if row.str("status") != "published" {
		return
	}
	draft, ok := ctx.Value(draftPublicationKey{}).(draftPublication)
	if !ok || draft.ID != row.str("id") {
		return
	}
	query, args := a.DB.adapt(`SELECT id,reader_id FROM section_flags WHERE post_id=$1 AND status='accepted' AND accepted_draft_revision=$2`, []any{row["id"], draft.Revision})
	rows, err := tx.QueryContext(ctx, query, args...)
	must(err)
	defer rows.Close()
	items := []Row{}
	for rows.Next() {
		var id, readerID string
		must(rows.Scan(&id, &readerID))
		items = append(items, Row{"id": id, "reader": readerID})
	}
	must(rows.Err())
	must(rows.Close())
	for _, item := range items {
		a.execInteraction(ctx, tx, "UPDATE section_flags SET status='applied',applied_revision=$2,updated_at=NOW() WHERE id=$1", item["id"], row["revision"])
		a.insertReaderAlertTx(ctx, tx, item.str("reader"), "section_updated", row.str("id"), item.str("id"), "section:"+item.str("id")+":"+row.str("revision"), "The section you noted was updated")
	}
}

func (a *App) publicContributors(ctx context.Context, postID string) []Row {
	rows := a.DB.Must(ctx, `SELECT f.id,f.display_name,f.quote,f.position,f.applied_revision FROM section_flags f
		WHERE f.post_id=$1 AND f.status='applied' ORDER BY f.position,f.created_at,f.id`, postID)
	result := make([]Row, 0, len(rows))
	for _, row := range rows {
		result = append(result, Row{"id": row["id"], "name": row["display_name"], "quote": row["quote"], "position": row["position"], "revision": row["applied_revision"]})
	}
	return result
}
