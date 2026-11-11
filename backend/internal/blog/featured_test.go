package blog

import (
	"fmt"
	"testing"
)

func TestFeaturedSQLite(t *testing.T) { app, _ := coreFixture(t); testFeatured(t, app) }
func TestFeaturedPostgreSQL(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	app, _ := postgresApp(t, db)
	testFeatured(t, app)
}

func testFeatured(t *testing.T, app *App) {
	t.Helper()
	pinned := responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "Pinned", "slug": "pinned", "content": "moonstone", "status": "published", "featured": true, "tags": []string{"Design"}}, true), 201)
	for _, status := range []string{"draft", "archived"} {
		responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": "Private " + status, "slug": "private-" + status, "content": "moonstone", "status": status, "featured": true}, true), 201)
	}
	for i := 0; i < 4; i++ {
		responseRow(t, request(t, app, "POST", "/api/posts", Row{"title": fmt.Sprintf("Regular %d", i), "slug": fmt.Sprintf("regular-%d", i), "content": "moonstone", "status": "published"}, true), 201)
	}
	theme := defaultTheme()
	home := object(theme["homepage"])
	home["pageSize"] = float64(2)
	responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, page := range []string{"1", "2", "999"} {
		data := responseRow(t, request(t, app, "GET", "/api/public/homepage?page="+page, nil, false), 200)
		if data["total"] != float64(4) || len(data["featured"].([]any)) != 1 || len(data["posts"].([]any)) != 2 {
			t.Fatal(data)
		}
		excludesHTML(t, encode(data["posts"]), `"slug":"pinned"`)
		excludesHTML(t, encode(data), "Private draft", "Private archived")
		html := request(t, app, "GET", "/?page="+page, nil, false).Body.String()
		containsHTML(t, html, `aria-label="Featured articles"`, "Pinned")
	}
	testFeaturedFilters(t, app)
	testFeaturedFeed(t, app, theme)
	testFeaturedUpdates(t, app, pinned)
}

func testFeaturedFeed(t *testing.T, app *App, theme Row) {
	t.Helper()
	home := object(theme["homepage"])
	home["includeFeaturedInFeed"] = true
	responseRow(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	data := responseRow(t, request(t, app, "GET", "/api/public/homepage?tag=Design", nil, false), 200)
	if data["total"] != float64(1) || len(data["posts"].([]any)) != 1 || len(data["featured"].([]any)) != 1 {
		t.Fatal(data)
	}
}

func testFeaturedUpdates(t *testing.T, app *App, pinned Row) {
	t.Helper()
	path := "/api/posts/" + pinned.str("id")
	selected := responseRow(t, request(t, app, "GET", path+"?fields=featured", nil, true), 200)
	if !selected.yes("featured") {
		t.Fatal(selected)
	}
	pinned = responseRow(t, request(t, app, "PUT", path, Row{"revision": pinned["revision"], "excerpt": "Changed"}, true), 200)
	if !pinned.yes("featured") {
		t.Fatal("omitted flag was lost")
	}
	expectStatus(t, request(t, app, "PUT", path, Row{"revision": pinned["revision"], "featured": "yes"}, true), 400)
	pinned = responseRow(t, request(t, app, "PUT", path, Row{"revision": pinned["revision"], "featured": false}, true), 200)
	if pinned.yes("featured") {
		t.Fatal("unfeature failed")
	}
	data := responseRow(t, request(t, app, "GET", "/api/public/homepage", nil, false), 200)
	if len(data["featured"].([]any)) != 0 {
		t.Fatal(data)
	}
}

func testFeaturedFilters(t *testing.T, app *App) {
	t.Helper()
	for _, query := range []string{"tag=Design", "q=moonstone&tag=Design"} {
		data := responseRow(t, request(t, app, "GET", "/api/public/homepage?"+query, nil, false), 200)
		if data["total"] != float64(0) || len(data["featured"].([]any)) != 1 {
			t.Fatal(data)
		}
		html := request(t, app, "GET", "/?"+query, nil, false).Body.String()
		excludesHTML(t, html, "Something good is taking shape", "No matching")
	}
	data := responseRow(t, request(t, app, "GET", "/api/public/homepage?tag=Missing", nil, false), 200)
	if len(data["featured"].([]any)) != 0 {
		t.Fatal(data)
	}
}
