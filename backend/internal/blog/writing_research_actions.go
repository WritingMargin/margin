package blog

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	guuid "github.com/google/uuid"
	"margin/backend/internal/writing"
)

func researchRequestID(key, draft string) string {
	return guuid.NewSHA1(guuid.NameSpaceURL, []byte("margin:research:"+draft+":"+key)).String()
}

var researchBriefURL = regexp.MustCompile(`https://[^\s<>"']+`)

// Build the URL allowlist from actual search results and the author's brief.
func researchSourceLookup(input writing.Input, sources []Row) map[string]Row {
	lookup := map[string]Row{}
	for _, raw := range researchBriefURL.FindAllString(input.Brief, -1) {
		u, err := url.Parse(researchURLFromText(raw))
		if err != nil || u.Hostname() == "" || u.User != nil || len(raw) > 2048 {
			continue
		}
		lookup[u.String()] = Row{"url": u.String(), "title": u.Hostname(), "excerpt": ""}
	}
	for _, source := range sources {
		lookup[source.str("url")] = source
	}
	for _, selected := range input.ResearchSources {
		lookup[selected.URL] = Row{"url": selected.URL, "title": selected.Title, "excerpt": selected.Excerpt}
	}
	return lookup
}

// Match Central's URL extraction, including DOIs that contain balanced parentheses.
func researchURLFromText(raw string) string {
	raw = strings.TrimRight(raw, ".,;!]}")
	for strings.HasSuffix(raw, ")") && strings.Count(raw, ")") > strings.Count(raw, "(") {
		raw = strings.TrimSuffix(raw, ")")
	}
	return raw
}

func (a *App) applyWritingResearch(ctx context.Context, input writing.Input, key string, sources []Row, raw any) Row {
	actions, _ := raw.([]any)
	sourceItems, noteItems := []Row{}, []Row{}
	if len(actions) == 0 {
		return Row{"sources": 0, "notes": 0, "sourceItems": sourceItems, "noteItems": noteItems}
	}
	if len(actions) > 4 {
		invalidWritingAction()
	}
	lookup := researchSourceLookup(input, sources)
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	for i, item := range actions {
		action := object(item)
		id := guuid.NewSHA1(guuid.NameSpaceURL, []byte(fmt.Sprintf("%s:%d", key, i))).String()
		switch action.str("kind") {
		case "save_source":
			sourceItems = append(sourceItems, a.saveWritingSource(ctx, tx, input.PostID, id, action, lookup))
		case "save_thinking_note":
			noteItems = append(noteItems, a.saveWritingThinkingNote(ctx, tx, input.PostID, id, action))
		default:
			invalidWritingAction()
		}
	}
	must(tx.Commit())
	return Row{"sources": len(sourceItems), "notes": len(noteItems), "sourceItems": sourceItems, "noteItems": noteItems}
}

func invalidWritingAction() {
	coded(502, "The assistant returned an invalid research action. The changes could not be saved.", "AI_INVALID_RESPONSE")
}

func (a *App) saveWritingSource(ctx context.Context, tx *sql.Tx, draft, id string, action Row, lookup map[string]Row) Row {
	source, ok := lookup[action.str("url")]
	if !ok {
		invalidWritingAction()
	}
	a.execInteraction(ctx, tx, `INSERT INTO research_sources(id,post_id,url,title,excerpt) VALUES($1,$2,$3,$4,$5) ON CONFLICT(post_id,url) DO NOTHING`, id, draft, source["url"], source["title"], source["excerpt"])
	row := a.queryPostTransaction(ctx, tx, "SELECT url,title,excerpt FROM research_sources WHERE post_id=$1 AND url=$2", draft, source["url"])
	if row == nil {
		invalidWritingAction()
	}
	return row
}

func (a *App) saveWritingThinkingNote(ctx context.Context, tx *sql.Tx, draft, id string, action Row) Row {
	if strings.TrimSpace(action.str("body")) == "" || utf8.RuneCountInString(action.str("body")) > 4000 || utf8.RuneCountInString(action.str("title")) > 80 {
		invalidWritingAction()
	}
	note := validWritingNote(Row{"title": action.str("title"), "body": action.str("body")})
	a.execInteraction(ctx, tx, `INSERT INTO writing_notes(id,post_id,note) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`, id, draft, encode(note))
	row := a.queryPostTransaction(ctx, tx, "SELECT id,note FROM writing_notes WHERE post_id=$1 AND id=$2", draft, id)
	if row == nil {
		invalidWritingAction()
	}
	stored := object(decodeJSONColumn(row["note"]))
	return Row{"id": row["id"], "title": stored["title"], "body": stored["body"]}
}
