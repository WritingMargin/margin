package blog

import (
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// Only suggest the comparison when the article teaches both workflows in
// separate sections. Use the rendered heading and its real fragment in the recommendation.
func sectionReviewSuggestions(content string) []auditFinding {
	lower := strings.ToLower(content)
	if !strings.Contains(lower, "oauth") || !strings.Contains(lower, "execution token") {
		return nil
	}
	sections := reviewSections(content)
	consent, unattended := workflowSections(sections)
	if consent.id == "" || unattended.id == "" || consent.id == unattended.id || hasWorkflowComparison(sections) {
		return nil
	}
	return []auditFinding{{
		Code: "editorial.compare_auth_flows", Severity: "suggestion", Field: "content",
		Passage: consent.title, Message: "The OAuth and execution-token walkthroughs appear in separate sections.",
		Why: "A reader choosing a credential for an agent can compare who approves access, which account it uses, and how to revoke it before starting either walkthrough.",
		Fix: "Consider adding a short comparison before this section. Link to [the OAuth walkthrough](#" + consent.id + ") and [the execution-token walkthrough](#" + unattended.id + "). For the consent flow, an illustration could show the person approving the actions and account before the agent’s first request.",
	}}
}

var tokenInstruction = regexp.MustCompile(`\b(issue|create|generate|mint|use) (an? |the |your )?(scoped |fixed |dynamic )?execution token\b`)

func workflowSections(sections []reviewSection) (consent, unattended reviewSection) {
	for _, section := range sections {
		if consent.id == "" && strings.Contains(strings.ToLower(section.title), "oauth") {
			consent = section
		}
		if unattended.id == "" && (strings.Contains(strings.ToLower(section.title), "execution token") || section.teachesToken) {
			unattended = section
		}
	}
	return consent, unattended
}

type reviewSection struct {
	title, id                                         string
	hasOAuth, hasToken, teachesToken, comparisonTable bool
}

func reviewSections(content string) []reviewSection {
	body := sectionedArticle(content, "https://article.invalid/", false, "off", nil, "")
	doc, err := html.Parse(strings.NewReader(body))
	sections := []reviewSection{{}}
	if err != nil {
		return sections
	}
	for node := range doc.Descendants() {
		if node.Type != html.ElementNode {
			continue
		}
		switch node.Data {
		case "h1", "h2", "h3", "h4", "h5", "h6":
			for _, attr := range node.Attr {
				if attr.Key == "id" {
					sections = append(sections, reviewSection{title: strings.Join(strings.Fields(contentsText(node)), " "), id: attr.Val})
				}
			}
		case "p", "table":
			sections[len(sections)-1].observe(node)
		}
	}
	return sections
}
func (s *reviewSection) observe(node *html.Node) {
	text := strings.ToLower(contentsText(node))
	oauth, token := strings.Contains(text, "oauth"), strings.Contains(text, "execution token")
	s.hasOAuth = s.hasOAuth || oauth
	s.hasToken = s.hasToken || token
	s.teachesToken = s.teachesToken || tokenInstruction.MatchString(text)
	if node.Data == "table" && oauth && token {
		s.comparisonTable = true
	}
}

func hasWorkflowComparison(sections []reviewSection) bool {
	for _, section := range sections {
		title := strings.ToLower(section.title)
		if section.comparisonTable || strings.Contains(title, "oauth") && strings.Contains(title, "execution token") {
			return true
		}
	}
	return sections[0].hasOAuth && sections[0].hasToken
}
