package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRevisionAuthorsAreDerivedFromCredentials(t *testing.T) {
	a, _ := coreFixture(t)
	agent := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Agent draft", "slug": "agent", "content": "First", "author": Row{"kind": "owner", "name": "Spoofed"}}, true), 201)
	path := "/api/posts/" + agent.str("id")
	if object(agent["author"]).str("name") != "Test" || object(agent["author"]).str("kind") != "api_token" {
		t.Fatal(agent)
	}
	setup := request(t, a, "POST", "/api/setup", Row{"email": "writer@example.test", "password": "long-test-password"}, false)
	expectStatus(t, setup, 201)
	input := Row{"revision": agent["revision"], "content": "Human edit"}
	r := httptest.NewRequest("PUT", "http://blog.test"+path, strings.NewReader(encode(input)))
	r.AddCookie(setup.Result().Cookies()[0])
	r.Header.Set("Origin", "http://blog.test")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	human := responseRow(t, w, 200)
	if object(human["author"]).str("name") != "writer@example.test" || object(human["author"]).str("kind") != "owner" {
		t.Fatal(human)
	}
	a.DB.Must(context.Background(), "UPDATE api_tokens SET name='Renamed' WHERE token_hash=$1", hash("owner"))
	entries := revisionEntries(t, a, path+"/revisions")
	if object(entries[1]["author"]).str("name") != "Test" {
		t.Fatal("old author changed", entries)
	}
	saved := responseRow(t, request(t, a, "GET", path+"/revisions/"+human.str("revision"), nil, true), 200)
	if saved["previousRevision"] != agent["revision"] {
		t.Fatal(saved)
	}
	current := responseRow(t, request(t, a, "GET", path, nil, true), 200)
	if object(current["author"]).str("kind") != "owner" {
		t.Fatal(current)
	}
}
func TestDeleteRequiresReviewedRevision(t *testing.T) {
	a, _ := coreFixture(t)
	original := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Delete guard", "slug": "delete-guard", "content": "Original"}, true), 201)
	path := "/api/posts/" + original.str("id")
	current := responseRow(t, request(t, a, "PUT", path, Row{"revision": original["revision"], "content": "New edit"}, true), 200)
	expectStatus(t, request(t, a, "DELETE", path, Row{}, true), 428)
	expectStatus(t, request(t, a, "DELETE", path, Row{"revision": original["revision"]}, true), 409)
	expectStatus(t, request(t, a, "GET", path, nil, true), 200)
	expectStatus(t, request(t, a, "DELETE", path, Row{"revision": current["revision"]}, true), 200)
}
