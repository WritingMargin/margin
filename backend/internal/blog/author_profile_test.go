package blog

import (
	"context"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

func TestAuthorProfileRendersAcrossPostViews(t *testing.T) {
	a, _, _ := publicFixture(t)
	profile := Row{"name": "Alex Writer", "image": ""}
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", profile, true), 200)
	for _, path := range []string{"/post/crawlable", "/post/crawlable/print", "/read/crawlable"} {
		page := request(t, a, "GET", path, nil, false)
		expectStatus(t, page, 200)
		containsHTML(t, page.Body.String(), `<div class="post-byline"><span>By Alex Writer</span></div>`)
	}
	page := request(t, a, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, page, `"author":{"@type":"Person","name":"Alex Writer"}`)
	public := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if encode(public["authorProfile"]) != encode(validAuthorProfile(profile)) {
		t.Fatal(public)
	}
}

func TestAuthorProfileImageVisibilityAndClearing(t *testing.T) {
	a, storage, _ := publicFixture(t)
	image := uploadSharingImage(t, a)
	expectStatus(t, request(t, a, "GET", image, nil, false), 404)
	profile := Row{"name": "Alex Writer", "image": image}
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", profile, true), 200)
	expectStatus(t, request(t, a, "GET", image, nil, false), 200)
	containsHTML(t, request(t, a, "GET", "/post/crawlable", nil, false).Body.String(), `<img src="`+image+`" alt="" width="32" height="32"><span>By Alex Writer</span>`)
	profile["image"] = ""
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", profile, true), 200)
	expectStatus(t, request(t, a, "GET", image, nil, false), 404)
	containsHTML(t, request(t, a, "GET", "/post/crawlable", nil, false).Body.String(), `<span>By Alex Writer</span></div>`)
	// Removing a profile image while bytes are loading must revoke public access.
	profile["image"] = image
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", profile, true), 200)
	storage.onGet = func(string) { a.saveSiteSetting(context.Background(), "author_profile", emptyAuthorProfile()) }
	expectStatus(t, request(t, a, "GET", image, nil, false), 404)
}

func TestAuthorProfileHiddenByDefaultAndNameEscaped(t *testing.T) {
	a, _, _ := publicFixture(t)
	excludesHTML(t, request(t, a, "GET", "/post/crawlable", nil, false).Body.String(), `class="post-byline"`, `"@type":"Person"`)
	image := uploadSharingImage(t, a)
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", Row{"name": "", "image": image}, true), 200)
	expectStatus(t, request(t, a, "GET", image, nil, false), 404)
	excludesHTML(t, request(t, a, "GET", "/post/crawlable", nil, false).Body.String(), `class="post-byline"`, image)
	responseRow(t, request(t, a, "PUT", "/api/settings/profile", Row{"name": " <script>Writer</script> ", "image": ""}, true), 200)
	page := request(t, a, "GET", "/post/crawlable", nil, false).Body.String()
	containsHTML(t, page, `By &lt;script&gt;Writer&lt;/script&gt;`)
	excludesHTML(t, page, `<script>Writer</script>`)
}

func TestAuthorProfileDraftPreviewAndMountedImages(t *testing.T) {
	a, _, _ := publicFixture(t)
	image := uploadSharingImage(t, a)
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	responseRow(t, request(t, a, "PUT", "/journal/api/settings/profile", Row{"name": "Preview Author", "image": image}, true), 200)
	draft := responseRow(t, request(t, a, "POST", "/journal/api/posts", draftInput("profile-preview"), true), 201)
	link := responseRow(t, request(t, a, "GET", "/journal/api/posts/"+draft.str("id")+"/preview", nil, true), 200)
	address, err := url.Parse(link.str("previewUrl"))
	if err != nil {
		t.Fatal(err)
	}
	page := request(t, a, "GET", address.Path, nil, false)
	expectStatus(t, page, 200)
	containsHTML(t, page.Body.String(), `By Preview Author`, `src="/journal`+image+`"`)
	expectStatus(t, request(t, a, "GET", "/journal"+image, nil, false), 200)
}

func TestAuthorProfileValidationAndPermissions(t *testing.T) {
	a, _ := coreFixture(t)
	path := "/api/settings/profile"
	for _, invalid := range []Row{
		{"name": strings.Repeat("x", 121), "image": ""},
		{"name": "Writer", "image": "javascript:alert(1)"},
		{"name": "Writer", "image": "https://user:password@example.com/image.png"},
		{"name": "Writer", "image": "/private/image.png"},
		{"name": "Writer", "image": "", "email": "private@example.com"},
	} {
		expectStatus(t, request(t, a, "PUT", path, invalid, true), 400)
	}
	expectStatus(t, request(t, a, "PUT", path, emptyAuthorProfile(), false), 401)
	for _, role := range []string{"reader", "writer", "publisher"} {
		key := roleToken(t, a, role)
		expectStatus(t, tokenRequest(a, key, "PUT", path, emptyAuthorProfile()), 403)
	}
}

func TestAuthorProfilePersistsAcrossRestart(t *testing.T) {
	file := filepath.Join(t.TempDir(), "blog.db")
	db := databaseFixture(t, file)
	a := &App{DB: db}
	profile := Row{"name": "Stored Writer", "image": "https://example.com/author.png"}
	a.saveSiteSetting(context.Background(), "author_profile", profile)
	if err := db.SQL.Close(); err != nil {
		t.Fatal(err)
	}
	a.DB = databaseFixture(t, file)
	if encode(a.authorProfile(context.Background())) != encode(validAuthorProfile(profile)) {
		t.Fatal("profile was not persisted")
	}
}

func TestAuthorProfileDetailsAndLinks(t *testing.T) {
	a, _ := coreFixture(t)
	profile := Row{"name": "Writer", "image": "", "bio": "Writing about useful ideas.", "website": "https://example.test", "links": []Row{{"label": "GitHub", "url": "https://github.com/example"}}}
	saved := responseRow(t, request(t, a, "PUT", "/api/settings/profile", profile, true), 200)
	if encode(saved) != encode(profile) {
		t.Fatal(saved)
	}
	public := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if encode(public["authorProfile"]) != encode(profile) {
		t.Fatal(public["authorProfile"])
	}
	if strings.Contains(encode(public["authorProfile"]), "email") {
		t.Fatal("private account details leaked")
	}
	for _, changes := range []Row{
		{"bio": strings.Repeat("x", 601)},
		{"website": "javascript:alert(1)"},
		{"website": "https://user:secret@example.com"},
		{"links": []Row{{"label": "Website", "url": "javascript:alert(1)"}}},
		{"links": []Row{{"label": "", "url": "https://example.test"}}},
		{"links": []Row{{"label": "Link", "url": ""}}},
		{"links": []Row{{}, {}, {}, {}, {}}},
	} {
		input := Row{"name": "Writer", "image": ""}
		for key, value := range changes {
			input[key] = value
		}
		expectStatus(t, request(t, a, "PUT", "/api/settings/profile", input, true), 400)
	}
}
