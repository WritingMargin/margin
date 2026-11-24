package blog

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testPNG() []byte {
	return append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, 24)...)
}

func TestWorkspaceNotesCRUDAndValidation(t *testing.T) {
	a, _ := coreFixture(t)
	expectStatus(t, request(t, a, "GET", "/api/notes", nil, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/notes", Row{"title": "Unauth"}, false), 401)

	created := responseRow(t, request(t, a, "POST", "/api/notes", Row{
		"title":   "Interview notes",
		"content": "Key quote from the founder.",
		"links":   []Row{{"url": "https://example.com/interview", "title": "Transcript"}},
	}, true), 201)
	id := created.str("id")
	if id == "" || created.yes("isPublic") || !created.yes("canEdit") || !created.yes("canDelete") {
		t.Fatal("unexpected created note:", created)
	}

	updated := responseRow(t, request(t, a, "PUT", "/api/notes/"+id, Row{
		"title":    "Updated interview notes",
		"isPublic": true,
	}, true), 200)
	if updated.str("title") != "Updated interview notes" || !updated.yes("isPublic") {
		t.Fatal("unexpected updated note:", updated)
	}

	// Reject invalid links and unknown fields.
	expectStatus(t, request(t, a, "POST", "/api/notes", Row{
		"links": []Row{{"url": "javascript:alert(1)"}},
	}, true), 400)
	expectStatus(t, request(t, a, "POST", "/api/notes", Row{"unknown": true}, true), 400)

	expectStatus(t, request(t, a, "DELETE", "/api/notes/"+id, nil, true), 200)
	expectStatus(t, request(t, a, "GET", "/api/notes/"+id, nil, true), 404)
}

func TestWorkspaceNotesTeamVisibilityPermissionsAndDuplicate(t *testing.T) {
	a, writerCookie, _ := memberFixture(t, "writer")

	privateOwnerNote := responseRow(t, request(t, a, "POST", "/api/notes", Row{
		"title":   "Owner private",
		"content": "Secret outline",
	}, true), 201)
	publicOwnerNote := responseRow(t, request(t, a, "POST", "/api/notes", Row{
		"title":    "Team research",
		"content":  "Shared findings",
		"links":    []Row{{"url": "https://example.org/data", "title": "Dataset"}},
		"isPublic": true,
	}, true), 201)

	// Writer cannot see owner's private note, can see public team note.
	expectStatus(t, memberRequest(a, writerCookie, "GET", "/api/notes/"+privateOwnerNote.str("id"), nil), 404)
	listRes := memberRequest(a, writerCookie, "GET", "/api/notes", nil)
	expectStatus(t, listRes, 200)
	if strings.Contains(listRes.Body.String(), "Secret outline") || !strings.Contains(listRes.Body.String(), "Shared findings") {
		t.Fatal("unexpected team notes visibility:", listRes.Body.String())
	}

	// Writer cannot edit, share, or delete owner's public note.
	expectStatus(t, memberRequest(a, writerCookie, "PUT", "/api/notes/"+publicOwnerNote.str("id"), Row{"title": "Hijacked"}), 403)
	expectStatus(t, memberRequest(a, writerCookie, "POST", "/api/notes/"+publicOwnerNote.str("id")+"/share", Row{"enabled": true}), 403)
	expectStatus(t, memberRequest(a, writerCookie, "DELETE", "/api/notes/"+publicOwnerNote.str("id"), nil), 403)

	// Writer can duplicate owner's public note into their own editable private copy.
	copyNote := responseRow(t, memberRequest(a, writerCookie, "POST", "/api/notes/"+publicOwnerNote.str("id")+"/duplicate", Row{}), 201)
	if copyNote.yes("isPublic") || !copyNote.yes("canEdit") || copyNote.str("content") != "Shared findings" {
		t.Fatal("unexpected duplicated note:", copyNote)
	}
	// Owner cannot see writer's private copy.
	expectStatus(t, request(t, a, "GET", "/api/notes/"+copyNote.str("id"), nil, true), 404)

	// Writer makes their note public -> owner sees it and can moderate/delete it.
	expectStatus(t, memberRequest(a, writerCookie, "PUT", "/api/notes/"+copyNote.str("id"), Row{"isPublic": true}), 200)
	expectStatus(t, request(t, a, "GET", "/api/notes/"+copyNote.str("id"), nil, true), 200)
	expectStatus(t, request(t, a, "DELETE", "/api/notes/"+copyNote.str("id"), nil, true), 200)
}

func TestWorkspaceNotesSharingAndCoverImageAccess(t *testing.T) {
	a, _ := coreFixture(t)

	// Upload an image via /api/media/covers.
	req := httptest.NewRequest("POST", "/api/media/covers", bytes.NewReader(testPNG()))
	req.Header.Set("Authorization", "Bearer owner")
	req.Header.Set("Content-Type", "image/png")
	rec := httptest.NewRecorder()
	a.ServeHTTP(rec, req)
	uploaded := responseRow(t, rec, 201)
	imageURL := uploaded.str("url")
	imageID := strings.TrimPrefix(imageURL, "/api/public/covers/")

	note := responseRow(t, request(t, a, "POST", "/api/notes", Row{
		"title":   "Visual sketch",
		"content": "See diagram:\n\n[Image src=\"" + imageURL + "\"]",
		"links":   []Row{{"url": "https://example.com/spec", "title": "Spec"}},
	}, true), 201)

	// Image referenced by note cannot be deleted from media library.
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+imageID, nil, true), 409)
	// Unauthenticated request to cover image is blocked before sharing.
	expectStatus(t, request(t, a, "GET", imageURL, nil, false), 404)

	// Enable external share link.
	shared := responseRow(t, request(t, a, "POST", "/api/notes/"+note.str("id")+"/share", Row{"enabled": true}, true), 200)
	shareToken := shared.str("shareToken")
	if shareToken == "" || !shared.yes("shared") {
		t.Fatal("missing share token:", shared)
	}

	// Public endpoint returns note content without auth.
	publicNote := responseRow(t, request(t, a, "GET", "/api/public/notes/"+shareToken, nil, false), 200)
	if publicNote.str("title") != "Visual sketch" || !strings.Contains(publicNote.str("content"), imageURL) {
		t.Fatal("unexpected shared note payload:", publicNote)
	}

	// Cover image is accessible with valid note_share token, blocked with wrong token.
	expectStatus(t, request(t, a, "GET", imageURL+"?note_share="+shareToken, nil, false), 200)
	expectStatus(t, request(t, a, "GET", imageURL+"?note_share=wrong", nil, false), 404)

	// Revoking share link immediately disables both note and image access.
	revoked := responseRow(t, request(t, a, "POST", "/api/notes/"+note.str("id")+"/share", Row{"enabled": false}, true), 200)
	if revoked.yes("shared") {
		t.Fatal("expected share link to be revoked")
	}
	expectStatus(t, request(t, a, "GET", "/api/public/notes/"+shareToken, nil, false), 404)
	expectStatus(t, request(t, a, "GET", imageURL+"?note_share="+shareToken, nil, false), 404)
}

func TestWritingAssistantAttachesAuthorizedNotesToContext(t *testing.T) {
	a, writerCookie, _ := memberFixture(t, "writer")

	ownerNote := responseRow(t, request(t, a, "POST", "/api/notes", Row{
		"title":   "Source notes",
		"content": "Benchmarks show 2x lower latency.",
		"links":   []Row{{"url": "https://example.com/bench", "title": "Benchmark"}},
	}, true), 201)
	writerPrivate := responseRow(t, memberRequest(a, writerCookie, "POST", "/api/notes", Row{
		"title":   "Writer private",
		"content": "Do not leak this",
	}), 201)

	var seenNotes []any
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		var payload Row
		_ = json.NewDecoder(r.Body).Decode(&payload)
		input := object(payload["input"])
		seenNotes, _ = input["attachedNotes"].([]any)
		return fixtureResponse(Row{"plan": Row{
			"reply":      "Great angle.",
			"sections":   []Row{},
			"questions":  []string{},
			"formatting": Row{"changes": []Row{}},
		}}), nil
	})

	// Owner attaches their own note -> forwarded to AI service.
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", Row{
		"conversationMode": true,
		"mode":             "ideas",
		"brief":            "Use my notes to sharpen the intro",
		"attachedNoteIds":  []string{ownerNote.str("id")},
	}, true), 200)
	if len(seenNotes) != 1 || object(seenNotes[0]).str("title") != "Source notes" {
		t.Fatalf("expected attached note in AI payload, got %#v", seenNotes)
	}
	if !strings.Contains(object(seenNotes[0]).str("content"), "2x lower latency") {
		t.Fatalf("expected note content in AI payload, got %#v", seenNotes[0])
	}

	// Owner cannot attach another teammate's private note (404).
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", Row{
		"conversationMode": true,
		"mode":             "ideas",
		"brief":            "Read private note",
		"attachedNoteIds":  []string{writerPrivate.str("id")},
	}, true), 404)

	// Invalid UUID rejected with 400.
	expectStatus(t, request(t, a, "POST", "/api/ai/writing", Row{
		"conversationMode": true,
		"mode":             "ideas",
		"brief":            "Bad note id",
		"attachedNoteIds":  []string{"not-a-uuid"},
	}, true), 400)
}
