package blog

import (
	"strings"
	"testing"
)

func TestArticleContentsRendering(t *testing.T) {
	content := "Intro\n\n## A **bold** idea\n\nText.\n\n### 日本語 & more\n\n## A **bold** idea\n\n```md\n## Not a heading\n```"
	body := markdownMarkup(content, "https://example.test/post/story", true, true)
	for _, placement := range []string{"top", "left", "right"} {
		output := articleContents(body, placement, nil, "")
		containsHTML(t, output, `aria-label="Table of contents"`, "article-toc-"+placement, `href="#section-a-bold-idea"`, `id="article-section-3"`, "日本語 &amp; more", "toc-depth-1")
		if strings.Count(output, `class="section-permalink"`) != 3 {
			t.Fatal("unexpected heading links", output)
		}
	}
	off := articleContents(body, "off", nil, "")
	containsHTML(t, off, `id="section-a-bold-idea-2"`, `href="#section-日本語-more"`)
	if strings.Contains(off, "article-toc-layout") || articleContents("<p>No headings</p>", "top", nil, "") != "<p>No headings</p>" {
		t.Fatal("disabled or empty contents changed article")
	}
}

func TestPostTableOfContentsPersistsAndRenders(t *testing.T) {
	app, _, post := publicFixture(t)
	if post["tableOfContents"] != "off" {
		t.Fatal("old posts should default to off", post)
	}
	updated := responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "tableOfContents": "right", "content": "## First section\n\nSome words.\n\n## Second section\n\nMore words."}, true), 200)
	if updated["tableOfContents"] != "right" {
		t.Fatal("placement not saved")
	}
	again := responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": updated["revision"], "excerpt": "Metadata edit"}, true), 200)
	if again["tableOfContents"] != "right" {
		t.Fatal("partial update reset placement")
	}
	public := responseRow(t, request(t, app, "GET", "/api/public/posts/crawlable", nil, false), 200)
	if public["tableOfContents"] != "right" {
		t.Fatal("public response omitted placement")
	}
	page := request(t, app, "GET", "/post/crawlable", nil, false)
	containsHTML(t, page.Body.String(), "article-toc-right", `href="#section-second-section"`, `id="article-section-2"`)
	revision := responseRow(t, request(t, app, "GET", "/api/posts/"+post.str("id")+"/revisions/"+updated.str("revision"), nil, true), 200)
	if revision["tableOfContents"] != "right" {
		t.Fatal("revision lost placement")
	}
	expectStatus(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": again["revision"], "tableOfContents": "arbitrary"}, true), 400)
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), Row{"revision": again["revision"], "tableOfContents": "off"}, true), 200)
	excludesHTML(t, request(t, app, "GET", "/post/crawlable", nil, false).Body.String(), `aria-label="Table of contents"`)
}

func TestSectionURLsAcrossPublishedFormats(t *testing.T) {
	app, _, post := publicFixture(t)
	input := Row{"revision": post["revision"], "content": "## Added before\n\n## OAuth & tokens\n\n[Tabs]\n[Tab title=\"OAuth & tokens\"]\n## OAuth & tokens\n[/Tab]\n[/Tabs]\n\n## OAuth & tokens 2\n\n## OAuth & tokens"}
	responseRow(t, request(t, app, "PUT", "/api/posts/"+post.str("id"), input, true), 200)
	for _, path := range []string{"/post/crawlable", "/read/crawlable"} {
		body := request(t, app, "GET", path, nil, false).Body.String()
		for _, id := range []string{"section-oauth-tokens", "section-oauth-tokens-2", "section-oauth-tokens-2-2", "section-oauth-tokens-3"} {
			containsHTML(t, body, `id="`+id+`"`, `href="#`+id+`"`)
		}
		excludesHTML(t, body, "data-margin-heading")
	}
	feed := request(t, app, "GET", "/rss.xml", nil, false).Body.String()
	containsHTML(t, feed, `href=&quot;http://blog.test/post/crawlable#section-oauth-tokens-2&quot;`)
}

func TestSectionReviewMentionsOnlySeparateWorkflows(t *testing.T) {
	content := "## Connect with **OAuth** & consent\n\nThe owner approves the request.\n\n## Taking access back\n\nYou can revoke the execution token too.\n\n## When nobody is there to click approve\n\nIssue an execution token for a scheduled agent."
	found := sectionReviewSuggestions(content)
	if len(found) != 1 || found[0].Passage != "Connect with OAuth & consent" || !strings.Contains(found[0].Fix, "(#section-connect-with-oauth-consent)") || !strings.Contains(found[0].Fix, "(#section-when-nobody-is-there-to-click-approve)") {
		t.Fatal(found)
	}
	comparison := "| OAuth | Execution token |\n|---|---|\n| Consent screen | Scheduled agent |"
	if len(sectionReviewSuggestions(content+"\n\n"+comparison)) != 0 || len(sectionReviewSuggestions("OAuth and execution token support.")) != 0 {
		t.Fatal("suggested an unnecessary comparison")
	}
}
