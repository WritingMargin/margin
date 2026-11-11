package blog

import (
	stdhtml "html"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func guideSections(content string) []contentsHeading {
	root := contentsElement("div", "")
	root.DataAtom = atom.Div
	nodes, err := html.ParseFragment(strings.NewReader(markdownMarkup(content, "", false, true)), root)
	must(err)
	for _, node := range nodes {
		root.AppendChild(node)
	}
	headings := []contentsHeading{}
	collectContents(root, &headings, sectionIDs{}, "")
	return headings
}

func guideSection(headings []contentsHeading, id string) contentsHeading {
	for _, heading := range headings {
		if heading.id == id {
			return heading
		}
	}
	fail(400, "Guide step not found.")
	return contentsHeading{}
}

func (a *App) completedGuideSteps(r *http.Request, reader, post Row, headings []contentsHeading) []string {
	valid := map[string]bool{}
	for _, heading := range headings {
		valid[heading.id] = true
	}
	completed := []string{}
	for _, row := range a.DB.Must(r.Context(), "SELECT section FROM reader_guide_steps WHERE reader_id=$1 AND post_id=$2 ORDER BY section", reader["id"], post["id"]) {
		if valid[row.str("section")] {
			completed = append(completed, row.str("section"))
		}
	}
	return completed
}

func (a *App) saveReaderGuideStep(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	reader := a.requireCommentReader(r)
	a.limit(r, "guide-step", 240, time.Minute, false)
	post := a.guideProgressPost(r)
	input := body(w, r)
	strict(input, "section", "revision", "completed")
	booleanField(input, "completed")
	section := stringField(input, "section", 1, 2048, true)
	validateGuideRevision(input, post)
	guideSection(guideSections(a.postContent(r.Context(), post).str("content")), section)
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	if input.yes("completed") {
		a.execInteraction(r.Context(), tx, "INSERT INTO reader_guide_steps(reader_id,post_id,section) VALUES($1,$2,$3) ON CONFLICT(reader_id,post_id,section) DO NOTHING", reader["id"], post["id"], section)
	} else {
		a.execInteraction(r.Context(), tx, "DELETE FROM reader_guide_steps WHERE reader_id=$1 AND post_id=$2 AND section=$3", reader["id"], post["id"], section)
	}
	must(tx.Commit())
	send(w, 200, Row{"section": section, "completed": input["completed"]})
}

func validateGuideRevision(input, post Row) {
	if stringField(input, "revision", 1, 100, true) != post.str("revision") {
		coded(409, "This guide changed. Reload it to save your progress.", "REVISION_CONFLICT")
	}
}

// Reports use the writer's existing private feedback inbox and moderation flow.
func (a *App) reportGuideStep(w http.ResponseWriter, r *http.Request) {
	reader := a.requireCommentReader(r)
	a.limit(r, "section-flags", 5, 15*time.Minute, false)
	post := a.guideProgressPost(r)
	input := body(w, r)
	strict(input, "section", "revision", "body")
	validateGuideRevision(input, post)
	section := stringField(input, "section", 1, 2048, true)
	message := stringField(input, "body", 1, 2000, true)
	source := a.postContent(r.Context(), post).str("content")
	heading := guideSection(guideSections(source), section)
	quote, occurrence := guideHeadingAnchor(source, heading)
	position := a.anchorPosition(r.Context(), post, quote, occurrence)
	id := uuid()
	name := reader.str("name")
	if name == "" {
		name = "Reader"
	}
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.lockInteractionPost(r.Context(), tx, post)
	a.execInteraction(r.Context(), tx, `INSERT INTO section_flags(id,post_id,reader_id,source_revision,quote,occurrence,position,kind,body,display_name)
 VALUES($1,$2,$3,$4,$5,$6,$7,'unclear',$8,$9)`, id, post["id"], reader["id"], post["revision"], quote, occurrence, position, message, name)
	a.execInteraction(r.Context(), tx, "INSERT INTO guide_step_flags(flag_id,section) VALUES($1,$2)", id, section)
	must(tx.Commit())
	send(w, 201, Row{"id": id, "message": "Your step report was sent to the writer."})
}

func guideHeadingAnchor(source string, heading contentsHeading) (string, int) {
	// Count occurrences before this heading in the same normalized prose used by flags.
	markup := sectionedArticle(source, "", false, "off", nil, "")
	start := strings.Index(markup, `id="`+heading.id+`"`)
	if start < 0 {
		fail(400, "Guide step not found.")
	}
	prefix := markup[:strings.LastIndex(markup[:start], "<")]
	// The prefix ends inside the heading's opening tag, before its text.
	text := readableLine(stdhtml.UnescapeString(passageTags.ReplaceAllString(passageBlocks.ReplaceAllString(prefix, " "), "")))
	return heading.title, strings.Count(text, heading.title)
}
