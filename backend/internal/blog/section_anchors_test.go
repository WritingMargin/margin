package blog

import (
	"context"
	"strings"
	"testing"
)

func TestHistoricalPublicNotesStayStoredButAreHidden(t *testing.T) {
	a, post := interactionFixture(t)
	ctx := context.Background()
	id := uuid()
	a.DB.Must(ctx, "INSERT INTO comments(id,post_id,name,email,body,approved) VALUES($1,$2,'Reader','reader@example.test','Historical public thought',TRUE)", id, post["id"])
	a.DB.Must(ctx, "INSERT INTO public_notes(comment_id) VALUES($1)", id)
	a.DB.Must(ctx, "INSERT INTO section_anchors(id,post_id,kind,quote,revision,position) VALUES($1,$2,'note','A little room for ideas.',$3,0)", id, post["id"], post["revision"])
	a.DB.Must(ctx, "INSERT INTO site_settings(name,configuration) VALUES('interactions',$1) ON CONFLICT(name) DO UPDATE SET configuration=EXCLUDED.configuration", encode(Row{"enabled": true, "questions": "open", "notes": true, "publicNotes": "open", "editPolicy": "keep"}))
	settings := responseRow(t, request(t, a, "GET", "/api/settings/interactions", nil, true), 200)
	if _, exposed := settings["publicNotes"]; exposed {
		t.Fatal("retired setting was still exposed", settings)
	}
	path := "/api/public/posts/" + post.str("id")
	for _, endpoint := range []string{path + "/interactions", path + "/comments", path + "/sections?quote=A%20little%20room%20for%20ideas.", "/api/comments", "/api/comments?status=all&kind=all"} {
		response := request(t, a, "GET", endpoint, nil, strings.HasPrefix(endpoint, "/api/comments"))
		expectStatus(t, response, 200)
		if strings.Contains(response.Body.String(), "Historical public thought") {
			t.Fatalf("historical public note leaked from %s: %s", endpoint, response.Body.String())
		}
	}
	for _, endpoint := range []string{path + "/public-notes", path + "/public-notes/" + id + "/replies"} {
		expectStatus(t, request(t, a, "POST", endpoint, Row{}, true), 404)
	}
	for _, endpoint := range []string{"/api/comments/" + id + "/pin", "/api/comments/" + id + "/highlight"} {
		expectStatus(t, request(t, a, "PATCH", endpoint, Row{}, true), 404)
	}
	if first(a.DB.Must(ctx, "SELECT comment_id FROM public_notes WHERE comment_id=$1", id)) == nil {
		t.Fatal("historical note data was deleted")
	}
}

func TestSelectedEmojiRemainsAvailable(t *testing.T) {
	a, post := interactionFixture(t)
	cookie := commentCookie(t, a, "emoji-reader", "email", "emoji@example.test")
	path := "/api/public/posts/" + post.str("id")
	reaction := Row{"quote": "A little room for ideas.", "revision": post["revision"], "emoji": "👏"}
	expectStatus(t, commentAuthRequest(a, "POST", path+"/reactions", reaction, cookie, "http://blog.test"), 200)
	expectStatus(t, commentAuthRequest(a, "POST", path+"/reactions", reaction, cookie, "http://blog.test"), 200)
	result := request(t, a, "GET", path+"/interactions", nil, false).Body.String()
	if !strings.Contains(result, `"emoji":"👏"`) || !strings.Contains(result, `"count":1`) {
		t.Fatal(result)
	}
}

func TestRepeatedPassageUsesSelectedOccurrence(t *testing.T) {
	text := "Echo here.\n\nEcho here."
	if nthPassagePosition(text, "Echo here.", 1) != 12 || nthPassagePosition(text, "Echo here.", 2) != -1 {
		t.Fatal("selected passage occurrence was not respected")
	}
}
