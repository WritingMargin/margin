package blog

import (
	"context"
	"strings"
)

// Reviewers can annotate staged revisions while readers annotate the live post.
// Derive review markers from immutable snapshots, independently of live anchors.
func (a *App) locateReviewPassages(ctx context.Context, post Row, notes []Row) {
	originals := map[string]string{}
	var current string
	for _, note := range notes {
		revision := note.str("revision")
		if revision == post.str("revision") {
			continue
		}
		original, exists := originals[revision]
		if !exists {
			row := first(a.DB.Must(ctx, "SELECT snapshot FROM post_revisions WHERE post_id=$1 AND revision=$2", post["id"], revision))
			if row != nil {
				original = passageText(a.postContent(ctx, object(row["snapshot"])).str("content"))
			}
			originals[revision] = original
		}
		if current == "" {
			current = passageText(post.str("content"))
		}
		locateReviewPassage(note, original, current)
	}
}

func locateReviewPassage(note Row, original, current string) {
	occurrence, _ := note["occurrence"].(int64)
	quote := note.str("quote")
	initial := nthPassagePosition(original, quote, int(occurrence))
	if initial < 0 {
		note["anchorStatus"] = "earlier"
		return
	}
	mapped := remapAnchorPosition(original, current, initial)
	position := nearestQuotePosition(current, quote, mapped)
	if position < 0 {
		note["anchorStatus"] = "earlier"
		return
	}
	note["occurrence"] = strings.Count(current[:position], quote)
}
