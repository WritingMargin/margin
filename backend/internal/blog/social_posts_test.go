package blog

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestSocialPostURLs(t *testing.T) {
	data, err := os.ReadFile("../../../shared/social-post-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct{ Input, Provider, URL string }
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		post := parseSocialPost(fixture.Input)
		if fixture.Provider == "" {
			if post != nil {
				t.Fatal("accepted invalid URL", fixture.Input)
			}
			continue
		}
		if post == nil || post.provider != fixture.Provider || post.url != fixture.URL {
			t.Fatalf("%s: %#v", fixture.Input, post)
		}
	}
}
func TestSocialPostsInPublicAndExportMarkdown(t *testing.T) {
	source := "https://x.com/jack/status/20?s=20\n\n[Social url=\"https://www.instagram.com/p/ABC123/\" title=\"A useful illustration\"]\n\nhttps://www.linkedin.com/feed/update/urn:li:activity:123456789/"
	for _, styled := range []bool{true, false} {
		output := renderMarkdown(source, "https://blog.example.com/post/example", styled)
		if strings.Count(output, `class="social-post-card"`) != 3 {
			t.Fatal(output)
		}
		containsHTML(t, output, "A useful illustration", `href="https://x.com/i/web/status/20"`, "LinkedIn")
		excludesHTML(t, output, "<iframe", "<script", "Load embed", "MARGINRSS")
	}
	plain := "An inline https://x.com/jack/status/20 link.\n\n`https://x.com/jack/status/20`\n\n```text\nhttps://x.com/jack/status/20\n```"
	excludesHTML(t, renderMarkdown(plain, "https://blog.example.com", true), "social-post-card")
	output := renderMarkdown(`[Social url="javascript:alert(1)" title="Bad"]`, "https://blog.example.com", true)
	excludesHTML(t, output, "javascript:", "<iframe")
	containsHTML(t, socialPostHTML("https://x.com/jack/status/20", `<script>bad</script>`), "&lt;script&gt;")
}
func TestSocialEmbedCSP(t *testing.T) {
	a, _, _ := publicFixture(t)
	page := request(t, a, "GET", "/post/crawlable", nil, false)
	containsHTML(t, page.Header().Get("Content-Security-Policy"), "frame-src https://platform.twitter.com https://www.instagram.com https://www.linkedin.com")
}
