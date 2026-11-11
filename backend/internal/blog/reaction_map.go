package blog

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// The map shows reader-visible prose and interactive labels, never embedded
// block source. Anchor positions still come from the canonical passage text.
var reactionWords = regexp.MustCompile(`\S+`)

func reactionVisibleText(content string) string {
	source, pollLabels := reactionPollPlaceholders(content)
	markup := rssMarkdown(source, "https://reaction.invalid/")
	root := &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div}
	nodes, err := html.ParseFragment(strings.NewReader(markup), root)
	if err != nil {
		return ""
	}
	var output strings.Builder
	for _, node := range nodes {
		reactionReadNode(&output, node)
	}
	lines := []string{}
	for _, line := range strings.Split(output.String(), "\n") {
		if trimmed := strings.Join(strings.Fields(line), " "); trimmed != "" {
			lines = append(lines, trimmed)
		}
	}
	visible := strings.Join(lines, "\n\n")
	for token, label := range pollLabels {
		visible = strings.ReplaceAll(visible, token, label)
	}
	return visible
}

func reactionPollPlaceholders(content string) (string, map[string]string) {
	labels := map[string]string{}
	source := pollBlockRE.ReplaceAllStringFunc(content, func(block string) string {
		match := pollBlockRE.FindStringSubmatch(block)
		jsonSource := match[1]
		if jsonSource == "" {
			jsonSource = match[2]
		}
		label := "Poll"
		var poll pollDefinition
		if json.Unmarshal([]byte(jsonSource), &poll) == nil && validPoll(poll) {
			label = reactionPollLabel(poll)
		}
		token := "MARGINREACTIONPOLL" + strings.ReplaceAll(uuid(), "-", "") + "END"
		labels[token] = label
		return "\n\n" + token + "\n\n"
	})
	return source, labels
}

func reactionPollLabel(poll pollDefinition) string {
	labels := []string{poll.Title, poll.Description}
	if poll.Type == "agree-disagree" {
		labels = append(labels, "Agree", "Disagree")
	} else {
		for _, option := range poll.Options {
			labels = append(labels, option.Label)
		}
	}
	return "Poll: " + strings.Join(nonemptyReactionLabels(labels), " · ")
}

func reactionReadNode(output *strings.Builder, node *html.Node) {
	if node.Type == html.TextNode {
		output.WriteString(node.Data)
		return
	}
	if node.Type != html.ElementNode {
		return
	}
	switch node.DataAtom {
	case atom.Pre:
		output.WriteString(reactionBlockLabel(node))
		output.WriteString("\n")
		return
	case atom.Script, atom.Style, atom.Input:
		return
	case atom.Br:
		output.WriteString("\n")
		return
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		reactionReadNode(output, child)
	}
	switch node.DataAtom {
	case atom.P, atom.H1, atom.H2, atom.H3, atom.H4, atom.H5, atom.H6, atom.Li, atom.Blockquote, atom.Dt, atom.Dd, atom.Figcaption:
		output.WriteString("\n")
	}
}

func reactionBlockLabel(block *html.Node) string {
	code := reactionCodeNode(block)
	if code == nil {
		return "Code example"
	}
	return reactionSourceSummary(reactionLanguage(code), reactionCodeSource(code))
}

func reactionCodeNode(block *html.Node) *html.Node {
	for code := block.FirstChild; code != nil; code = code.NextSibling {
		if code.Type == html.ElementNode && code.DataAtom == atom.Code {
			return code
		}
	}
	return nil
}

func reactionLanguage(code *html.Node) string {
	language := ""
	for _, attr := range code.Attr {
		if attr.Key == "class" {
			language = strings.TrimPrefix(attr.Val, "language-")
		}
	}
	return language
}

func reactionCodeSource(code *html.Node) string {
	var source strings.Builder
	for child := code.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.TextNode {
			source.WriteString(child.Data)
		}
	}
	return source.String()
}

func reactionSourceSummary(language, source string) string {
	var poll pollDefinition
	if json.Unmarshal([]byte(source), &poll) == nil && validPoll(poll) {
		return reactionPollLabel(poll)
	}
	if language == "chart" || language == "scene" || language == "illustration" {
		var summary struct{ Title, Description string }
		if json.Unmarshal([]byte(source), &summary) == nil && summary.Title != "" {
			return strings.Join(nonemptyReactionLabels([]string{summary.Title, summary.Description}), ". ")
		}
	}
	if language == "mermaid" {
		return "Diagram"
	}
	return "Code example"
}

func nonemptyReactionLabels(labels []string) []string {
	result := []string{}
	for _, label := range labels {
		if label = strings.TrimSpace(label); label != "" {
			result = append(result, label)
		}
	}
	return result
}

type reactionSegment struct {
	Start      int    `json:"start"`
	End        int    `json:"end"`
	Text       string `json:"text"`
	Highlights int    `json:"highlights"`
	Questions  int    `json:"questions"`
	Votes      int    `json:"votes"`
	Reactions  int    `json:"reactions"`
	Scroll     int    `json:"scroll"`
	Score      int    `json:"score"`
}

func reactionSegments(text string) []reactionSegment {
	words := reactionWords.FindAllStringIndex(text, -1)
	if len(words) == 0 {
		return []reactionSegment{}
	}
	count := min(20, len(words))
	result := make([]reactionSegment, 0, count)
	for i := range count {
		first := i * len(words) / count
		last := (i + 1) * len(words) / count
		start, end := words[first][0], len(text)
		if last < len(words) {
			end = words[last][0]
		}
		result = append(result, reactionSegment{Start: start, End: end, Text: text[start:end]})
	}
	return result
}

func reactionSegmentAt(segments []reactionSegment, text, quote string, position int, active bool) int {
	if active && quote != "" && (position < 0 || position >= len(text) || !strings.HasPrefix(text[position:], quote)) {
		if index := nearestQuotePosition(text, quote, position); index >= 0 {
			position = index
		}
	}
	for index, segment := range segments {
		if position < segment.End {
			return index
		}
	}
	return max(0, len(segments)-1)
}

func reactionPosition(value any) int {
	switch number := value.(type) {
	case int64:
		return int(number)
	case int:
		return number
	case float64:
		return int(number)
	}
	return 0
}

func (a *App) reactionMap(w http.ResponseWriter, r *http.Request) {
	period := analyticsDates(r)
	id := r.URL.Query().Get("postId")
	if !uuidRE.MatchString(id) {
		fail(400, "Choose an article for the reaction map.")
	}
	post := a.getPost(r.Context(), id)
	content, err := a.Storage.Get(r.Context(), post.str("content_key"))
	must(err)
	canonical := passageText(string(content))
	text := reactionVisibleText(string(content))
	segments := reactionSegments(text)
	a.addAnchorHeat(r, period, id, canonical, text, segments)
	a.addHighlightHeat(r, period, id, text, segments)
	viewCount := a.addScrollHeat(r, period, id, segments)
	send(w, 200, Row{"postId": id, "title": post["title"], "revision": post["revision"], "from": period.From, "to": period.To, "views": viewCount, "segments": segments})
}

func (a *App) addAnchorHeat(r *http.Request, period analyticsRange, id, canonical, text string, segments []reactionSegment) {
	anchors := a.DB.Must(r.Context(), `SELECT a.kind,a.quote,a.position,a.anchor_status,COUNT(*) AS count FROM section_anchors a
	 LEFT JOIN comments c ON c.id=a.id
	 WHERE a.post_id=$1 AND a.created_at>=$2 AND a.created_at<$3
	 AND a.kind<>'note' AND (a.kind<>'question' OR (c.approved=TRUE AND NOT EXISTS
	 (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL)))
	 GROUP BY a.kind,a.quote,a.position,a.anchor_status`, id, period.From, analyticsNextDay(period.To))
	for _, anchor := range anchors {
		if len(segments) == 0 {
			return
		}
		position := reactionProjectPosition(reactionPosition(anchor["position"]), len(canonical), len(text))
		segment := &segments[reactionSegmentAt(segments, text, anchor.str("quote"), position, anchor.str("anchor_status") == "active")]
		count := reactionPosition(anchor["count"])
		switch anchor.str("kind") {
		case "question":
			segment.Questions += count
		case "vote":
			segment.Votes += count
		case "reaction":
			segment.Reactions += count
		}
	}
}

func reactionProjectPosition(position, sourceLength, displayLength int) int {
	if sourceLength == 0 {
		return 0
	}
	return max(0, min(displayLength, position*displayLength/sourceLength))
}

func (a *App) addHighlightHeat(r *http.Request, period analyticsRange, id, text string, segments []reactionSegment) {
	highlights := a.DB.Must(r.Context(), `SELECT e.target,COUNT(*) AS count FROM analytics_events e
	 JOIN analytics_visits v ON v.id=e.visit_id
	 WHERE v.post_id=$1 AND v.day>=$2 AND v.day<=$3 AND e.kind='highlight'
	 GROUP BY e.target`, id, period.From, period.To)
	for _, highlight := range highlights {
		if len(segments) == 0 {
			return
		}
		quote := highlight.str("target")
		if strings.Contains(text, quote) {
			segments[reactionSegmentAt(segments, text, quote, 0, true)].Highlights += reactionPosition(highlight["count"])
		}
	}
}

func (a *App) addScrollHeat(r *http.Request, period analyticsRange, id string, segments []reactionSegment) int {
	columns := []string{"COUNT(*) AS views"}
	args := []any{id, period.From, period.To}
	for index := range segments {
		threshold := 100 * (index + 1) / len(segments)
		args = append(args, threshold)
		columns = append(columns, fmt.Sprintf("COUNT(CASE WHEN scroll_depth >= $%d THEN 1 END) AS reached_%d", len(args), index))
	}
	row := first(a.DB.Must(r.Context(), `SELECT `+strings.Join(columns, ",")+` FROM analytics_visits WHERE post_id=$1 AND day>=$2 AND day<=$3`, args...))
	for index := range segments {
		segments[index].Scroll = reactionPosition(row[fmt.Sprintf("reached_%d", index)])
		segment := &segments[index]
		segment.Score = segment.Highlights + 3*segment.Questions + 2*segment.Reactions + segment.Votes + segment.Scroll
	}
	return reactionPosition(row["views"])
}
