package blog

import (
	"html"
	"net/url"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func TestPublicHTMLSocialSharing(t *testing.T) {
	app, _, item := publicFixture(t)
	title := "Words & ideas? #1 — café"
	responseRow(t, request(t, app, "PUT", "/api/posts/"+item.str("id"), Row{"revision": item["revision"], "title": title}, true), 200)
	body := request(t, app, "GET", "/post/crawlable", nil, false).Body.String()
	if strings.Count(body, `href="https://substack.com/notes"`) != 2 || !strings.Contains(body, "Share a note · paste the article link") {
		t.Fatal("expected Substack Notes sharing with copy instructions at both ends of the article")
	}
	assertPublishingShares(t, body, title)
	start := strings.Index(body, `class="share-menu"`)
	if start < 0 {
		t.Fatal("missing share menu")
	}
	links := regexp.MustCompile(`href="([^"]+)"`).FindAllStringSubmatch(strings.SplitN(body[start:], "</nav>", 2)[0], -1)
	if len(links) != 5 {
		t.Fatalf("got %d social links", len(links))
	}
	expected := []url.Values{
		{"text": {title}, "url": {"http://blog.test/post/crawlable"}},
		{"url": {"http://blog.test/post/crawlable"}},
		{"u": {"http://blog.test/post/crawlable"}},
		{"text": {title + "\nhttp://blog.test/post/crawlable"}},
		{"subject": {title}, "body": {title + "\nhttp://blog.test/post/crawlable"}},
	}
	for i, match := range links {
		link, err := url.Parse(html.UnescapeString(match[1]))
		if err != nil {
			t.Fatal(err)
		}
		if link.Fragment != "" || !reflect.DeepEqual(link.Query(), expected[i]) {
			t.Fatalf("incorrect share URL: %s", link)
		}
	}
}

func assertPublishingShares(t *testing.T, body, title string) {
	t.Helper()
	if strings.Count(body, `class="article-share"`) != 2 {
		t.Fatal("expected sharing at both ends of the article")
	}
	if !strings.Contains(body, `class="article-topbar"`) || !strings.Contains(body, `https://medium.com/p/import`) {
		t.Fatal("missing top toolbar or Medium import")
	}
	devLinks := regexp.MustCompile(`href="(https://dev.to/new[^"]+)"`).FindAllStringSubmatch(body, -1)
	if len(devLinks) != 2 {
		t.Fatal("expected DEV sharing at both ends of the article")
	}
	devURL, err := url.Parse(html.UnescapeString(devLinks[0][1]))
	if err != nil {
		t.Fatal(err)
	}
	draft := devURL.Query().Get("prefill")
	if !strings.Contains(draft, "published: false\n") || !strings.Contains(draft, "http://blog.test/post/crawlable") || !strings.Contains(draft, title) {
		t.Fatalf("incorrect DEV draft: %s", draft)
	}

}
