package blog

import (
	"bytes"
	_ "embed"
	"fmt"
	"html/template"
	"math"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

//go:embed newsletter_issue.html
var newsletterIssueSource string

var newsletterIssueTemplate = template.Must(template.New("newsletter-issue").Parse(newsletterIssueSource))
var newsletterAccent = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type newsletterStory struct {
	Title    string `json:"title"`
	Excerpt  string `json:"excerpt"`
	URL      string `json:"url"`
	Category string `json:"category"`
	CoverURL string `json:"coverUrl"`
}

type newsletterIssue struct {
	Publication    string            `json:"publication"`
	PublicationURL string            `json:"publicationUrl"`
	Subject        string            `json:"subject"`
	Intro          string            `json:"intro"`
	Accent         string            `json:"accent"`
	UnsubscribeURL string            `json:"unsubscribeUrl"`
	Stories        []newsletterStory `json:"stories"`
	Preview        bool              `json:"preview"`
}

// Content emails are separate from signup/verification messages. The first story
// leads the issue; optional additional stories form a compact reading list.
func newsletterIssueHTML(issue newsletterIssue) (string, error) {
	if err := validateNewsletterIssue(issue); err != nil {
		return "", err
	}
	if issue.Accent == "" {
		issue.Accent = "#202020"
	}
	view := struct {
		newsletterIssue
		Featured   newsletterStory
		More       []newsletterStory
		ButtonText string
		AccentText string
	}{issue, issue.Stories[0], issue.Stories[1:], newsletterButtonText(issue.Accent), newsletterAccentText(issue.Accent)}
	var out bytes.Buffer
	if err := newsletterIssueTemplate.Execute(&out, view); err != nil {
		return "", err
	}
	return out.String(), nil
}

func validateNewsletterIssue(issue newsletterIssue) error {
	if strings.TrimSpace(issue.Publication) == "" || newsletterTextLength(issue.Publication) > 120 {
		return fmt.Errorf("newsletter requires a publication name of at most 120 characters")
	}
	if len(issue.Stories) < 1 || len(issue.Stories) > 5 {
		return fmt.Errorf("newsletter requires between one and five stories")
	}
	if !newsletterWebURL(issue.PublicationURL) || !newsletterWebURL(issue.UnsubscribeURL) {
		return fmt.Errorf("newsletter requires valid publication and unsubscribe URLs")
	}
	if issue.Accent != "" && !newsletterAccent.MatchString(issue.Accent) {
		return fmt.Errorf("newsletter accent must be a six-digit hex color")
	}
	if err := validateNewsletterIssueText(issue); err != nil {
		return err
	}
	return validateNewsletterStories(issue.Stories)
}

func validateNewsletterIssueText(issue newsletterIssue) error {
	if newsletterTextLength(issue.Subject) > 998 || strings.ContainsAny(issue.Subject, "\r\n") || newsletterTextLength(issue.Intro) > 2000 {
		return fmt.Errorf("newsletter subject or introduction is invalid or too long")
	}
	return nil
}

func validateNewsletterStories(stories []newsletterStory) error {
	for _, story := range stories {
		if strings.TrimSpace(story.Title) == "" || newsletterTextLength(story.Title) > 240 {
			return fmt.Errorf("newsletter story requires a title of at most 240 characters")
		}
		if newsletterTextLength(story.Excerpt) > 2000 || newsletterTextLength(story.Category) > 120 {
			return fmt.Errorf("newsletter story preview is too long")
		}
		if !newsletterWebURL(story.URL) || story.CoverURL != "" && !newsletterWebURL(story.CoverURL) {
			return fmt.Errorf("newsletter story requires valid reading and cover URLs")
		}
	}
	return nil
}

func newsletterWebURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && len(raw) <= 2048 && u.Host != "" && u.User == nil && newsletterIssueScheme(u)
}

// Keep the exact template accent on the button and rule, while text remains readable.
func newsletterButtonText(accent string) string {
	value, _ := strconv.ParseUint(strings.TrimPrefix(accent, "#"), 16, 32)
	channel := func(n uint64) float64 {
		c := float64(n&255) / 255
		if c <= 0.04045 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	luminance := 0.2126*channel(value>>16) + 0.7152*channel(value>>8) + 0.0722*channel(value)
	if luminance > 0.179 {
		return "#172033"
	}
	return "#ffffff"
}
func newsletterAccentText(accent string) string {
	if newsletterButtonText(accent) == "#172033" {
		return "#172033"
	}
	return accent
}

func newsletterTextLength(s string) int { return len([]rune(s)) }
func newsletterIssueScheme(u *url.URL) bool {
	if u.Scheme == "https" {
		return true
	}
	return os.Getenv("MARGIN_ENV") == "development" && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")
}
