package blog

import (
	"context"
	"encoding/xml"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestRSSSummaryFallbacks(t *testing.T) {
	for _, tc := range []struct {
		name string
		item Row
		want string
	}{
		{"excerpt", Row{"excerpt": "Writer's introduction", "seo": Row{"description": "Search description"}, "content": "Full body"}, "Writer's introduction"},
		{"seo", Row{"excerpt": " \n", "seo": Row{"description": "Search description"}, "content": "Full body"}, "Search description"},
		{"body", Row{"content": "## A story\n\nHello **world**, tea & coffee. [Read more](https://example.test)."}, "A story Hello world, tea & coffee. Read more."},
		{"empty", Row{"title": "An image story", "content": ""}, "An image story"},
		{"markup", Row{"content": "[Callout]\nKeep this insight.\n[/Callout]\n\n<script>bad()</script>"}, "Keep this insight."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := rssSummary(tc.item, rssMarkdown(tc.item.str("content"), "https://blog.example/post/story"))
			if got != tc.want {
				t.Fatalf("summary = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRSSSummaryUnicodeLimit(t *testing.T) {
	for _, source := range []string{strings.Repeat("日本語😀", 100), strings.Repeat("words and ideas ", 40)} {
		summary := rssShortSummary(source)
		if !utf8.ValidString(summary) || utf8.RuneCountInString(summary) > 320 || !strings.HasSuffix(summary, "…") {
			t.Fatal("invalid truncation", summary)
		}
	}
	short := strings.Repeat("語", 320)
	if rssShortSummary(short) != short {
		t.Fatal("short summary changed")
	}
}

func TestRSSDescriptionsAndGenerator(t *testing.T) {
	for _, tc := range []struct {
		theme Row
		want  string
	}{
		{Row{"description": "About this blog", "seo": Row{"description": "Search"}}, "Search"},
		{Row{"description": "About this blog"}, "About this blog"},
		{Row{"description": " ", "seo": Row{"description": "Search"}}, "Search"},
		{Row{"homepage": Row{"description": "Our ideas"}}, "Our ideas"},
		{Row{"name": "A & B"}, "Latest writing from A & B."},
		{Row{}, "Latest writing from Margin."},
	} {
		tc.theme["comments"] = defaultTheme()["comments"]
		feed, err := buildRSS(tc.theme, []Row{{"status": "published", "title": "Story", "content": "Tea & **ideas**", "slug": "story"}}, "https://example.test/blog")
		if err != nil {
			t.Fatal(err)
		}
		var parsed struct {
			Channel struct {
				Description string `xml:"description"`
				Generator   string `xml:"generator"`
				Item        []struct {
					Description string `xml:"description"`
					Link        string `xml:"link"`
					Content     string `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
				} `xml:"item"`
			} `xml:"channel"`
		}
		if err = xml.Unmarshal([]byte(feed), &parsed); err != nil {
			t.Fatal(err)
		}
		if parsed.Channel.Description != tc.want || parsed.Channel.Generator != "Margin" || len(parsed.Channel.Item) != 1 {
			t.Fatal("invalid channel metadata")
		}
		if parsed.Channel.Item[0].Description != "Tea & ideas" {
			t.Fatal("summary was not XML escaped correctly")
		}
		containsHTML(t, feed, "<description>"+rssXML(tc.want)+"</description>", "<generator>Margin</generator>", "<description>Tea &amp; ideas</description>", "https://example.test/blog/post/story", "&lt;strong&gt;ideas&lt;/strong&gt;")
	}
}

func TestRSSSummaryRechecksPublication(t *testing.T) {
	a, storage := coreFixture(t)
	row := readableFixturePost(t, a, "published", "withdrawn", "PRIVATE AFTER WITHDRAWAL")
	storage.onGet = func(string) {
		a.DB.Must(context.Background(), "UPDATE posts SET status='draft' WHERE id=$1", row["id"])
	}
	w := request(t, a, "GET", "/rss.xml", nil, false)
	expectStatus(t, w, 404)
	excludesHTML(t, w.Body.String(), "PRIVATE AFTER WITHDRAWAL", "<item>")
}

func TestPublicMarginAttribution(t *testing.T) {
	a, _, _ := publicFixture(t)
	for _, path := range []string{"/", "/post/crawlable"} {
		w := request(t, a, "GET", path, nil, false)
		expectStatus(t, w, 200)
		containsHTML(t, w.Body.String(), `<meta name="generator" content="Margin">`, `Powered by <a href="https://github.com/WritingMargin/margin">Margin</a>`)
	}
}
