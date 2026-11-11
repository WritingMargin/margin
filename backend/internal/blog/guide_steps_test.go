package blog

import (
	"context"
	"strings"
	"testing"
)

func TestGuideStepsAreExplicitPrivateAndIndependentOfReadingPosition(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("steps")
	input["contentType"], input["status"], input["content"] = "guide", "published", "## Start\n\nInstructions.\n\n### Detail\n\nMore.\n\n## Finish\n\nDone."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	base := "/api/public/posts/" + post.str("id")
	reader := commentCookie(t, a, "reader-one", "email", "one@example.test")
	other := commentCookie(t, a, "reader-two", "email", "two@example.test")
	save := Row{"section": "section-finish", "revision": post["revision"]}
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-progress", save, reader, "http://blog.test"), 200)
	get := func() Row {
		return responseRow(t, commentAuthRequest(a, "GET", base+"/guide-progress", nil, reader, ""), 200)
	}
	if len(get()["completed"].([]any)) != 0 {
		t.Fatal("scrolling must not complete a step")
	}
	save["section"], save["completed"] = "section-start", true
	expectStatus(t, request(t, a, "PUT", base+"/guide-steps", save, false), 401)
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, ""), 403)
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, "http://blog.test"), 200)
	fresh := commentCookie(t, a, "reader-one", "email", "one@example.test")
	result := responseRow(t, commentAuthRequest(a, "GET", base+"/guide-progress", nil, fresh, ""), 200)
	if encode(result["completed"]) != `["section-start"]` || result.str("section") != "section-finish" {
		t.Fatal(result)
	}
	private := responseRow(t, commentAuthRequest(a, "GET", base+"/guide-progress", nil, other, ""), 200)
	if len(private["completed"].([]any)) != 0 {
		t.Fatal("completion leaked to another reader")
	}
	save["completed"] = false
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, "http://blog.test"), 200)
	if len(get()["completed"].([]any)) != 0 {
		t.Fatal("could not undo completion")
	}
	save["section"] = "section-missing"
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, "http://blog.test"), 400)
	save["section"], save["revision"] = "section-start", "old"
	expectStatus(t, commentAuthRequest(a, "PUT", base+"/guide-steps", save, reader, "http://blog.test"), 409)
}

func TestGuideProblemReachesPrivateWriterInboxWithCorrectStep(t *testing.T) {
	a, _ := coreFixture(t)
	input := draftInput("problem-guide")
	input["contentType"], input["status"], input["content"] = "guide", "published", "Start here.\n\n## Start\n\nFirst instructions.\n\n## Start\n\nSecond instructions."
	post := responseRow(t, request(t, a, "POST", "/api/posts", input, true), 201)
	base := "/api/public/posts/" + post.str("id")
	reader := commentCookie(t, a, "reporter", "email", "reader@example.test")
	report := Row{"section": "section-start-2", "revision": post["revision"], "body": "The command fails with permission denied."}
	expectStatus(t, request(t, a, "POST", base+"/guide-reports", report, false), 401)
	expectStatus(t, commentAuthRequest(a, "POST", base+"/guide-reports", report, reader, "https://evil.test"), 403)
	responseRow(t, commentAuthRequest(a, "POST", base+"/guide-reports", report, reader, "http://blog.test"), 201)
	expectStatus(t, request(t, a, "GET", "/api/readers/flags", nil, false), 401)
	page := responseRow(t, request(t, a, "GET", "/api/readers/flags", nil, true), 200)
	flag := object(page["flags"].([]any)[0])
	if flag.str("kind") != "step_problem" || flag.str("section") != "section-start-2" || flag.str("body") != report.str("body") {
		t.Fatal(flag)
	}
	stored := first(a.DB.Must(context.Background(), "SELECT quote,occurrence,position FROM section_flags"))
	if stored["occurrence"] != int64(2) || stored["position"].(int64) < 0 {
		t.Fatal("wrong repeated heading anchor", stored)
	}
	progress := responseRow(t, commentAuthRequest(a, "GET", base+"/guide-progress", nil, reader, ""), 200)
	if strings.Contains(encode(progress["completed"]), "section-start-2") {
		t.Fatal("report completed the step")
	}
	report["section"] = "section-missing"
	expectStatus(t, commentAuthRequest(a, "POST", base+"/guide-reports", report, reader, "http://blog.test"), 400)
}
