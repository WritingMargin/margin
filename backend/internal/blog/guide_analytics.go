package blog

import (
	"net/http"
	"strconv"
	"strings"
)

func (a *App) guideAnalyticsRoutes() {
	a.mux.HandleFunc("GET /api/readers/guides", a.authorGuides)
	a.mux.HandleFunc("GET /api/readers/guides/{id}", a.authorGuideAnalytics)
	a.mux.HandleFunc("GET /api/readers/guides/{id}/readers/{reader}", a.authorGuideReports)
}

func (a *App) authorGuides(w http.ResponseWriter, r *http.Request) {
	rows := a.DB.Must(r.Context(), "SELECT id,title,slug,status FROM posts WHERE content_type='guide' ORDER BY title,id")
	if rows == nil {
		rows = []Row{}
	}
	send(w, 200, Row{"guides": rows})
}

func (a *App) authorGuide(r *http.Request) Row {
	post := a.getPost(r.Context(), r.PathValue("id"))
	if post.str("content_type") != "guide" {
		fail(404, "Guide not found.")
	}
	return post
}

// Match the main-heading steps shown by the reader's floating companion.
func guideMainSteps(headings []contentsHeading) []contentsHeading {
	level, titles := 7, 0
	hasSecondLevel := false
	for _, heading := range headings {
		level = min(level, heading.level)
		if heading.level == 1 {
			titles++
		}
		hasSecondLevel = hasSecondLevel || heading.level == 2
	}
	if titles == 1 && hasSecondLevel {
		level = 2
	}
	steps := []contentsHeading{}
	for _, heading := range headings {
		if heading.level == level {
			steps = append(steps, heading)
		}
	}
	return steps
}

const guideParticipants = `WITH participants AS (
 SELECT reader_id FROM reader_guide_progress WHERE post_id=$1
 UNION SELECT reader_id FROM reader_guide_steps WHERE post_id=$1
 UNION SELECT f.reader_id FROM section_flags f JOIN guide_step_flags g ON g.flag_id=f.id WHERE f.post_id=$1
), problems AS (
 SELECT f.reader_id,COUNT(*) AS reports FROM section_flags f JOIN guide_step_flags g ON g.flag_id=f.id WHERE f.post_id=$1 GROUP BY f.reader_id
)`

func guideCompletionQuery(postID string, steps []contentsHeading) (string, []any) {
	args := []any{postID}
	params := []string{}
	for _, step := range steps {
		args = append(args, step.id)
		params = append(params, "$"+strconv.Itoa(len(args)))
	}
	filter := "1=0"
	if len(params) > 0 {
		filter = "section IN (" + strings.Join(params, ",") + ")"
	}
	return guideParticipants + `, completions AS (SELECT reader_id,COUNT(*) AS completed FROM reader_guide_steps WHERE post_id=$1 AND ` + filter + ` GROUP BY reader_id) `, args
}

func (a *App) authorGuideAnalytics(w http.ResponseWriter, r *http.Request) {
	post := a.authorGuide(r)
	offset := moderationOffset(r.URL.Query().Get("offset"), "Invalid reader offset.")
	headings := guideSections(a.postContent(r.Context(), post).str("content"))
	steps := guideMainSteps(headings)
	query, args := guideCompletionQuery(post.str("id"), steps)
	summary := first(a.DB.Must(r.Context(), query+`SELECT COUNT(*) AS readers,
 COALESCE(SUM(CASE WHEN c.completed=`+strconv.Itoa(len(steps))+` AND c.completed>0 THEN 1 ELSE 0 END),0) AS finished,
 COALESCE(SUM(p.reports),0) AS reports
 FROM participants u LEFT JOIN completions c ON c.reader_id=u.reader_id LEFT JOIN problems p ON p.reader_id=u.reader_id`, args...))
	args = append(args, offset)
	rows := a.DB.Must(r.Context(), query+`SELECT r.id,r.name,COALESCE(c.completed,0) AS completed,COALESCE(p.reports,0) AS reports,g.section
 FROM participants u JOIN comment_readers r ON r.id=u.reader_id
 LEFT JOIN completions c ON c.reader_id=r.id LEFT JOIN problems p ON p.reader_id=r.id
 LEFT JOIN reader_guide_progress g ON g.reader_id=r.id AND g.post_id=$1
 ORDER BY r.name,r.id LIMIT 21 OFFSET $`+strconv.Itoa(len(args)), args...)
	hasMore := len(rows) > 20
	if hasMore {
		rows = rows[:20]
	}
	readers := a.guideAnalyticsReaders(r, post.str("id"), rows, headings, steps)
	send(w, 200, Row{"summary": summary, "steps": a.guideStepTotals(r, post.str("id"), steps), "readers": readers, "hasMore": hasMore})
}

func (a *App) guideAnalyticsReaders(r *http.Request, postID string, rows []Row, headings, steps []contentsHeading) []Row {
	readers := make([]Row, 0, len(rows))
	completedByReader := a.guidePageCompletions(r, postID, rows, steps)
	for _, row := range rows {
		completed := completedByReader[row.str("id")]
		if completed == nil {
			completed = []string{}
		}
		readers = append(readers, Row{"id": row["id"], "name": row["name"], "completed": completed, "reports": row["reports"], "section": guideSectionLabel(headings, steps, row.str("section"))})
	}
	return readers
}

func guideSectionLabel(headings, steps []contentsHeading, id string) string {
	parent := ""
	for _, heading := range headings {
		if guideHeadingTitle(steps, heading.id) != "" {
			parent = heading.title
		}
		if heading.id == id {
			if parent != "" && parent != heading.title {
				return parent + " / " + heading.title
			}
			return heading.title
		}
	}
	return ""
}

func (a *App) guidePageCompletions(r *http.Request, postID string, rows []Row, steps []contentsHeading) map[string][]string {
	result := map[string][]string{}
	if len(rows) == 0 {
		return result
	}
	args := []any{postID}
	params := []string{}
	for _, row := range rows {
		args = append(args, row["id"])
		params = append(params, "$"+strconv.Itoa(len(args)))
	}
	for _, saved := range a.DB.Must(r.Context(), "SELECT reader_id,section FROM reader_guide_steps WHERE post_id=$1 AND reader_id IN ("+strings.Join(params, ",")+") ORDER BY section", args...) {
		if guideHeadingTitle(steps, saved.str("section")) != "" {
			id := saved.str("reader_id")
			result[id] = append(result[id], saved.str("section"))
		}
	}
	return result
}

func guideHeadingTitle(headings []contentsHeading, id string) string {
	for _, heading := range headings {
		if heading.id == id {
			return heading.title
		}
	}
	return ""
}

func (a *App) guideStepTotals(r *http.Request, postID string, steps []contentsHeading) []Row {
	counts := map[string]any{}
	for _, row := range a.DB.Must(r.Context(), "SELECT section,COUNT(*) AS completed FROM reader_guide_steps WHERE post_id=$1 GROUP BY section", postID) {
		counts[row.str("section")] = row["completed"]
	}
	result := make([]Row, 0, len(steps))
	for _, step := range steps {
		count := counts[step.id]
		if count == nil {
			count = 0
		}
		result = append(result, Row{"id": step.id, "title": step.title, "completed": count})
	}
	return result
}

func (a *App) authorGuideReports(w http.ResponseWriter, r *http.Request) {
	post := a.authorGuide(r)
	offset := moderationOffset(r.URL.Query().Get("offset"), "Invalid report offset.")
	rows := a.DB.Must(r.Context(), `SELECT f.id,f.quote AS step,f.body,f.status,f.created_at AS "createdAt",g.section
 FROM section_flags f JOIN guide_step_flags g ON g.flag_id=f.id WHERE f.post_id=$1 AND f.reader_id=$2
 ORDER BY f.created_at DESC,f.id DESC LIMIT 21 OFFSET $3`, post["id"], r.PathValue("reader"), offset)
	hasMore := len(rows) > 20
	if hasMore {
		rows = rows[:20]
	}
	if rows == nil {
		rows = []Row{}
	}
	send(w, 200, Row{"reports": rows, "hasMore": hasMore})
}
