package blog

import (
	"context"
	"database/sql"
	"math"
	"net/http"
	"strings"
	"time"
)

// Anchors keep the original quote and revision. Position follows later edits so
// an altered passage can still be shown near its former place in the article.
func anchorOccurrence(input Row) int {
	value, ok := input["occurrence"]
	if !ok {
		return 0
	}
	number, ok := value.(float64)
	if !ok || number < 0 || number > 10000 || math.Trunc(number) != number {
		fail(400, "Invalid passage occurrence.")
	}
	return int(number)
}

func nthPassagePosition(text, quote string, occurrence int) int {
	start := 0
	for index := 0; index <= occurrence; index++ {
		found := strings.Index(text[start:], quote)
		if found < 0 {
			return -1
		}
		start += found
		if index == occurrence {
			return start
		}
		start += len(quote)
	}
	return -1
}

func (a *App) anchorPosition(ctx context.Context, post Row, quote string, occurrence int) int {
	if quote == "" {
		return 0
	}
	content, err := a.Storage.Get(ctx, post.str("content_key"))
	must(err)
	return nthPassagePosition(passageText(string(content)), quote, occurrence)
}

func (a *App) insertAnchor(ctx context.Context, tx *sql.Tx, id string, post Row, kind, quote string, occurrence int) {
	position := a.anchorPosition(ctx, post, quote, occurrence)
	if quote != "" && position < 0 && kind != "note" && kind != "vote" {
		fail(400, "Select a passage from the current article.")
	}
	position = max(0, position)
	a.execInteraction(ctx, tx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position,occurrence) VALUES($1,$2,$3,$4,$5,$6,$7)", id, post["id"], kind, quote, post["revision"], position, occurrence)
}

func (a *App) reconcileAnchors(ctx context.Context, tx *sql.Tx, post Row, oldText, newText string) {
	query, args := a.DB.adapt("SELECT id,quote,position,occurrence FROM section_anchors WHERE post_id=$1 AND quote<>''", []any{post["id"]})
	rows, err := tx.QueryContext(ctx, query, args...)
	must(err)
	items := []Row{}
	for rows.Next() {
		var id, quote string
		var position, occurrence int
		must(rows.Scan(&id, &quote, &position, &occurrence))
		items = append(items, Row{"id": id, "quote": quote, "position": position, "occurrence": occurrence})
	}
	must(rows.Err())
	must(rows.Close())
	for _, item := range items {
		quote := item.str("quote")
		mapped := remapAnchorPosition(oldText, newText, item["position"].(int))
		position := nearestQuotePosition(newText, quote, mapped)
		status := "active"
		if position < 0 {
			status = "earlier"
			position = mapped
		}
		occurrence := item["occurrence"].(int)
		if status == "active" {
			occurrence = strings.Count(newText[:position], quote)
		}
		a.execInteraction(ctx, tx, "UPDATE section_anchors SET position=$1,anchor_status=$2,occurrence=$3 WHERE id=$4", position, status, occurrence, item["id"])
	}
}

func nearestQuotePosition(text, quote string, target int) int {
	best, distance := -1, len(text)+1
	for start := 0; start < len(text); {
		found := strings.Index(text[start:], quote)
		if found < 0 {
			break
		}
		position := start + found
		if gap := max(position-target, target-position); gap < distance {
			best, distance = position, gap
		}
		start = position + len(quote)
	}
	return best
}

func remapAnchorPosition(before, after string, position int) int {
	start := 0
	for start < len(before) && start < len(after) && before[start] == after[start] {
		start++
	}
	oldEnd, newEnd := len(before), len(after)
	for oldEnd > start && newEnd > start && before[oldEnd-1] == after[newEnd-1] {
		oldEnd--
		newEnd--
	}
	if position >= oldEnd {
		position += newEnd - oldEnd
	} else if position > start {
		position = start
	}
	return max(0, min(position, len(after)))
}

func (a *App) createPassageReaction(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "passage-reactions", 60, time.Hour, false)
	reader := a.requireCommentReader(r)
	post := a.publishedInteractionPost(r)
	input := body(w, r)
	quote := a.validatePassage(r, input, post)
	emoji := enumField(input, "emoji", "❤️", "👏", "💡", "🤔", "🔥")
	occurrence := anchorOccurrence(input)
	position := a.anchorPosition(r.Context(), post, quote, occurrence)
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	existing := a.queryPostTransaction(r.Context(), tx, `SELECT pr.anchor_id FROM passage_reactions pr
		JOIN section_anchors sa ON sa.id=pr.anchor_id WHERE sa.post_id=$1 AND sa.position=$2 AND pr.reader_id=$3 AND pr.emoji=$4`, post["id"], position, reader["id"], emoji)
	if existing == nil {
		id := uuid()
		a.insertAnchor(r.Context(), tx, id, post, "reaction", quote, occurrence)
		a.execInteraction(r.Context(), tx, "INSERT INTO passage_reactions(anchor_id,reader_id,emoji) VALUES($1,$2,$3)", id, reader["id"], emoji)
	}
	must(tx.Commit())
	send(w, 200, Row{"ok": true})
}

func (a *App) visibleReactions(ctx context.Context, postID string) []Row {
	return a.visibleReactionsForSection(ctx, postID, "", 0)
}

func (a *App) visibleReactionsForSection(ctx context.Context, postID, quote string, occurrence int) []Row {
	result := []Row{}
	for _, row := range a.DB.Must(ctx, `SELECT a.quote,a.anchor_status,a.position,a.occurrence,r.emoji,COUNT(*) AS count
		FROM passage_reactions r JOIN section_anchors a ON a.id=r.anchor_id
		WHERE a.post_id=$1 AND ($2='' OR (a.quote=$2 AND a.occurrence=$3))
		GROUP BY a.quote,a.anchor_status,a.position,a.occurrence,r.emoji ORDER BY count DESC,r.emoji`, postID, quote, occurrence) {
		result = append(result, row)
	}
	return result
}
