package blog

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"html"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
)

// Rendering fixtures specify expected HTML; normalize serialization, not content.
func TestRSSRendering(t *testing.T) {
	data, err := os.ReadFile("rss_testdata/rendering.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct{ Name, Content, HTML string }
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			actual := rssMarkdown(fixture.Content, "https://blog.example/post/sample")
			if normalizeRSSHTML(actual) != normalizeRSSHTML(fixture.HTML) {
				t.Fatalf("Go:\n%s\nExpected:\n%s", actual, fixture.HTML)
			}
		})
	}
}

var rssIntertagSpace = regexp.MustCompile(`>\s+<`)
var rssVoidTags = regexp.MustCompile(`<(img|hr|br|input)([^>]*)/>`)
var rssPreloads = regexp.MustCompile(`<link rel="preload"[^>]*>`)

func normalizeRSSHTML(value string) string {
	value = rssPreloads.ReplaceAllString(value, "")
	value = rssVoidTags.ReplaceAllString(value, "<$1$2>")
	return strings.TrimSpace(rssIntertagSpace.ReplaceAllString(html.UnescapeString(value), "><"))
}
func TestRSSMetadataAndXML(t *testing.T) {
	posts := []Row{
		{"id": "stable-id", "title": `Tea & <ideas>`, "slug": "tea", "excerpt": "A <summary>", "content": "**Full content**", "status": "published", "tags": []string{"Art & design"}, "createdAt": "2026-10-01T12:00:00Z", "updatedAt": "2026-10-03T16:00:00Z"},
		{"id": "draft", "title": "SECRET", "status": "draft", "updatedAt": "2030-01-01T00:00:00Z"},
	}
	theme := defaultTheme()
	theme["name"] = "A & B"
	theme["description"] = "Description"
	feed, err := buildRSS(theme, posts, "https://blog.example/path")
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{`urn:uuid:stable-id`, `<title>A &amp; B</title>`, `Tea &amp; &lt;ideas&gt;`, `<lastBuildDate>Sat, 03 Oct 2026 16:00:00 GMT</lastBuildDate>`, `<comments>https://blog.example/path/post/tea#comments</comments>`} {
		if !strings.Contains(feed, required) {
			t.Errorf("missing %s", required)
		}
	}
	if strings.Contains(feed, "SECRET") {
		t.Fatal("draft leaked")
	}
	var parsed any
	if err := xml.Unmarshal([]byte(feed), &parsed); err != nil {
		t.Fatal(err)
	}
}
func TestRSSRejectsUnsafeOrigins(t *testing.T) {
	for _, origin := range []string{"javascript:alert(1)", "file:///tmp/", "https://user:password@example.com"} {
		if _, err := buildRSS(Row{}, nil, origin); err == nil {
			t.Errorf("accepted %s", origin)
		}
	}
	if got := rssXML("a\x00\x01😀\n<&\"'"); got != "a😀\n&lt;&amp;&quot;&apos;" {
		t.Fatal(got)
	}
}

type rssFailedStorage struct{ Storage }

func (rssFailedStorage) Get(context.Context, string) ([]byte, error) {
	return nil, errors.New("missing article")
}
func TestRSSHandlerFailsAtomicallyAndOrdersPosts(t *testing.T) {
	app, storage := coreFixture(t)
	ctx := context.Background()
	for _, id := range []string{"second", "first"} {
		app.DB.Must(ctx, "INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision,created_at) VALUES($1,$1,$1,'','published',$1,'1','2026-10-01T12:00:00Z')", id)
		if err := storage.Put(ctx, id, []byte("Body "+id)); err != nil {
			t.Fatal(err)
		}
	}
	result := request(t, app, "GET", "/rss.xml", nil, false)
	expectStatus(t, result, 200)
	if result.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("feed caching must be disabled")
	}
	if result.Header().Get("Content-Type") != "application/rss+xml; charset=utf-8" {
		t.Fatal("feed MIME type")
	}
	feed := result.Body.String()
	if strings.Index(feed, "urn:uuid:first") > strings.Index(feed, "urn:uuid:second") {
		t.Fatal("unstable equal-date ordering")
	}
	app.Storage = rssFailedStorage{storage}
	failed := request(t, app, "GET", "/rss.xml", nil, false)
	expectStatus(t, failed, 503)
	if strings.Contains(failed.Body.String(), "<item>") {
		t.Fatal("partial feed returned")
	}
}

var rssHTMLTag = regexp.MustCompile(`<[^>]*>`)

func TestRSSMalformedMarkupPreservesText(t *testing.T) {
	data, err := os.ReadFile("rss_testdata/literal-text.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct{ Name, Content, HTML string }
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			got := rssMarkdown(fixture.Content, "https://blog.example/post/sample")
			actual := html.UnescapeString(rssHTMLTag.ReplaceAllString(got, ""))
			expected := html.UnescapeString(rssHTMLTag.ReplaceAllString(fixture.HTML, ""))
			if actual != expected {
				t.Fatalf("Go text %q, expected text %q", actual, expected)
			}
			assertRSSSafeHTML(t, got)
		})
	}
}

var rssExecutableTag = regexp.MustCompile(`(?i)<(?:script|iframe|object|embed|svg|math|style|form)\b`)
var rssEventAttribute = regexp.MustCompile(`(?i)\son[a-z]+\s*=`)

func assertRSSSafeHTML(t *testing.T, content string) {
	t.Helper()
	if rssExecutableTag.MatchString(content) {
		t.Fatal("executable HTML in feed")
	}
	for _, tag := range rssHTMLTag.FindAllString(content, -1) {
		if rssEventAttribute.MatchString(tag) {
			t.Fatal("event attribute in feed")
		}
	}
	for _, attr := range rssURLAttribute.FindAllStringSubmatch(content, -1) {
		target, err := url.Parse(html.UnescapeString(attr[2]))
		if err != nil {
			t.Fatal(err)
		}
		if !rssSafeScheme(target) {
			t.Fatalf("unsafe feed URL: %s", attr[2])
		}
	}
}
func rssSafeScheme(target *url.URL) bool {
	return target.User == nil && (target.Scheme == "http" || target.Scheme == "https" || target.Scheme == "mailto")
}
func FuzzRSSMarkdownSafety(f *testing.F) {
	for _, seed := range []string{
		"<script>alert(1)</script>",
		`:image[]{src="javascript:alert(1)" onerror="alert(1)"}`,
		"[Callout]\n<script>evil</script>\n[/Callout]",
		`:mark[` + "`a]b`" + `]`,
		`[Font="Caveat; color:red"]Safe[/Font]`,
		`![image](data:text/html;base64,PHNjcmlwdD4=)`,
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, source string) {
		if len(source) > 10000 {
			t.Skip()
		}
		assertRSSSafeHTML(t, rssMarkdown(source, "https://blog.example/post/sample"))
	})
}
