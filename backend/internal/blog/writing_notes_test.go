package blog

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func noteFixture() Row {
	return Row{"title": "Question to revisit", "body": "PRIVATE INSIGHT: explain the baseline", "reason": "Readers may not know the comparison", "brief": "What assumptions am I making?", "audience": "New readers", "passage": "Our approach is twice as effective.", "includedDraft": false, "sourceRevision": "original-revision"}
}
func TestWritingNotesArePrivateAndDoNotChangeArticle(t *testing.T) {
	a, storage, post := publicFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	path := "/api/posts/" + post.str("id") + "/writing-notes"
	expectStatus(t, request(t, a, "GET", path, nil, false), 401)
	expectStatus(t, request(t, a, "POST", path, noteFixture(), false), 401)
	before := encode(a.DB.Must(context.Background(), "SELECT * FROM posts"))
	objects := len(storage.objects)
	saved := responseRow(t, request(t, a, "POST", path, noteFixture(), true), 201)
	if saved.str("postId") != post.str("id") || object(saved["note"]).str("reason") != noteFixture().str("reason") {
		t.Fatal(saved)
	}
	got := request(t, a, "GET", path, nil, true)
	expectStatus(t, got, 200)
	containsHTML(t, got.Body.String(), "PRIVATE INSIGHT", "original-revision")
	followUp := noteFixture()
	followUp["feedback"] = "Make this angle more practical"
	saved = responseRow(t, request(t, a, "POST", path, followUp, true), 201)
	if object(saved["note"]).str("feedback") != followUp.str("feedback") {
		t.Fatal("saved insight lost its follow-up context")
	}
	if before != encode(a.DB.Must(context.Background(), "SELECT * FROM posts")) || objects != len(storage.objects) {
		t.Fatal("saving a private note changed article data")
	}
	for _, path := range []string{"/api/public/posts/crawlable", "/post/crawlable", "/posts/crawlable.md", "/llms.txt", "/rss.xml"} {
		response := request(t, a, "GET", path, nil, false)
		expectStatus(t, response, 200)
		excludesHTML(t, response.Body.String(), "PRIVATE INSIGHT", "Readers may not know the comparison")
	}
}
func TestWritingNotesValidateScopeAndCascade(t *testing.T) {
	a, _, post := publicFixture(t)
	path := "/api/posts/" + post.str("id") + "/writing-notes"
	for _, patch := range []Row{{"body": " "}, {"body": strings.Repeat("x", 4001)}, {"passage": strings.Repeat("x", 12001)}, {"includedDraft": "yes"}, {"unknown": true}} {
		input := noteFixture()
		for key, value := range patch {
			input[key] = value
		}
		expectStatus(t, request(t, a, "POST", path, input, true), 400)
	}
	missing := "/api/posts/" + uuid() + "/writing-notes"
	expectStatus(t, request(t, a, "GET", missing, nil, true), 404)
	expectStatus(t, request(t, a, "POST", missing, noteFixture(), true), 404)
	expectStatus(t, request(t, a, "POST", path, noteFixture(), true), 201)
	other := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Other", "slug": "other", "status": "draft", "content": "Private draft"}, true), 201)
	if request(t, a, "GET", "/api/posts/"+other.str("id")+"/writing-notes", nil, true).Body.String() != "[]\n" {
		t.Fatal("notes leaked between articles")
	}
	expectStatus(t, request(t, a, "DELETE", "/api/posts/"+post.str("id"), Row{"revision": post["revision"]}, true), 200)
	if len(a.DB.Must(context.Background(), "SELECT * FROM writing_notes")) != 0 {
		t.Fatal("orphaned private notes")
	}
}
func TestWritingNotesPersistAfterDatabaseReopen(t *testing.T) {
	fixture, storage := coreFixture(t)
	filename := filepath.Join(t.TempDir(), "notes.db")
	db, err := OpenDatabase("", filename)
	must(err)
	db.Must(context.Background(), "INSERT INTO api_tokens(token_hash,name) VALUES($1,$2)", hash("owner"), "Notes test")
	a := NewApp(db, storage, fixture.Client, nil)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Ideas", "slug": "ideas", "status": "draft", "content": "Draft"}, true), 201)
	path := "/api/posts/" + post.str("id") + "/writing-notes"
	expectStatus(t, request(t, a, "POST", path, noteFixture(), true), 201)
	must(db.SQL.Close())
	db, err = OpenDatabase("", filename)
	must(err)
	defer db.SQL.Close()
	a = NewApp(db, storage, fixture.Client, nil)
	response := request(t, a, "GET", path, nil, true)
	expectStatus(t, response, 200)
	containsHTML(t, response.Body.String(), "PRIVATE INSIGHT", "Readers may not know the comparison", "Our approach is twice as effective.")
}
