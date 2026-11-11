package blog

import (
	"context"
	"strings"
	"testing"
)

func TestPublicationTypeLabelsAndValidation(t *testing.T) {
	app, _, _ := publicFixture(t)
	for _, kind := range []string{"blog", "article", "research"} {
		words := publicationLabels[kind]
		expectStatus(t, request(t, app, "PUT", "/api/settings/publication", Row{"type": kind}, true), 200)
		settings := responseRow(t, request(t, app, "GET", "/api/public/settings", nil, false), 200)
		if settings.str("publicationType") != kind {
			t.Fatal(settings)
		}
		home := request(t, app, "GET", "/", nil, false)
		expectStatus(t, home, 200)
		containsHTML(t, home.Body.String(), words.Heading, "1 "+strings.ToUpper(words.Singular), "Read "+words.Singular, words.Eyebrow)
		article := request(t, app, "GET", "/post/crawlable", nil, false)
		expectStatus(t, article, 200)
		containsHTML(t, article.Body.String(), "All "+words.Plural, "Save this "+words.Singular, `"@type":"`+words.SchemaType+`"`)
		excludesHTML(t, article.Body.String(), "Read story", "All stories", "Save this story")
	}
	for _, input := range []Row{{"type": "invalid"}, {"type": 7}, {}, {"type": "blog", "surprise": true}} {
		expectStatus(t, request(t, app, "PUT", "/api/settings/publication", input, true), 400)
	}
	expectStatus(t, request(t, app, "PUT", "/api/settings/publication", Row{"type": "blog"}, false), 401)
	if app.settings(context.Background()).str("publicationType") != "research" {
		t.Fatal("rejected changes must not alter publication type")
	}
}

func TestPublicationTypeUpdatePreservesDesign(t *testing.T) {
	app, _ := coreFixture(t)
	theme := defaultTheme()
	theme["name"] = "My research library"
	theme["description"] = "A custom introduction"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	expectStatus(t, request(t, app, "PUT", "/api/settings/publication", Row{"type": "research"}, true), 200)
	current := app.settings(context.Background())
	if current.str("name") != theme.str("name") || current.str("description") != theme.str("description") {
		t.Fatal("changing publication type replaced the design")
	}
}

func TestSetupPublicationType(t *testing.T) {
	app, _ := coreFixture(t)
	credentials := Row{"email": "owner@example.test", "password": "a-long-test-password", "publicationType": "invalid"}
	expectStatus(t, request(t, app, "POST", "/api/setup", credentials, false), 400)
	if len(app.DB.Must(context.Background(), "SELECT id FROM admins")) != 0 {
		t.Fatal("invalid publication type created an owner")
	}
	credentials["publicationType"] = "research"
	expectStatus(t, request(t, app, "POST", "/api/setup", credentials, false), 201)
	if app.settings(context.Background()).str("publicationType") != "research" {
		t.Fatal("setup did not persist publication type")
	}
	credentials["publicationType"] = "blog"
	expectStatus(t, request(t, app, "POST", "/api/setup", credentials, false), 409)
	if app.settings(context.Background()).str("publicationType") != "research" {
		t.Fatal("repeated setup changed the publication")
	}
}
