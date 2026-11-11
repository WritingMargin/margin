package blog

import (
	"context"
	"strings"
	"testing"
)

func TestGeneratedImageLibraryTitles(t *testing.T) {
	app, _, post := publicFixture(t)
	id := uuid()
	brief := "A quiet mountain village at sunrise"
	// Existing generated images need no migration or regeneration to receive titles.
	app.DB.Must(context.Background(), "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7)", id, post["id"], "assets/"+id+".png", brief, "editorial", "1024x1024", "test")
	expectStatus(t, request(t, app, "GET", "/api/media/images?source=uploads", nil, false), 401)
	library := responseRow(t, request(t, app, "GET", "/api/media/images?source=uploads", nil, true), 200)
	if !strings.Contains(encode(library), `"title":"`+brief+`"`) || !strings.Contains(encode(library), "/api/assets/"+id+".png") {
		t.Fatal(library)
	}
	row := imageRow(Row{"id": id, "prompt": brief})
	if row.str("title") != brief || row.str("url") != "/api/assets/"+id+".png" {
		t.Fatal(row)
	}
}

func TestGeneratedImageTitleBounds(t *testing.T) {
	if generatedImageTitle(" \n ") != "Generated illustration" {
		t.Fatal("empty briefs need a readable fallback")
	}
	title := generatedImageTitle(strings.Repeat("山", 120))
	if len([]rune(title)) != 90 {
		t.Fatal("title must be bounded without corrupting Unicode")
	}
	if title := generatedImageTitle("A quiet\n  mountain village."); title != "A quiet mountain village" {
		t.Fatal(title)
	}
}
