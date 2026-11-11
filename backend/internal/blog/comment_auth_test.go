package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func commentCookie(t *testing.T, a *App, identity, provider, email string) *http.Cookie {
	t.Helper()
	reader := a.commentIdentity(context.Background(), identity, provider, email, "Reader")
	w := httptest.NewRecorder()
	a.startCommentSession(w, httptest.NewRequest("GET", "http://blog.test", nil), reader)
	cookies := w.Result().Cookies()
	return cookies[len(cookies)-1]
}
func commentAuthRequest(a *App, method, path string, input any, cookie *http.Cookie, origin string) *httptest.ResponseRecorder {
	data := ""
	if input != nil {
		data = encode(input)
	}
	r := httptest.NewRequest(method, "http://blog.test"+path, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	if origin == "http://blog.test" {
		origin = a.origin(r)
	}
	r.Header.Set("Origin", origin)
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}

// Explicit authentication for existing conversation tests; ordinary request stays anonymous.
func conversationRequest(t *testing.T, a *App, method, path string, input any, owner bool) *httptest.ResponseRecorder {
	t.Helper()
	if method != "POST" || !strings.HasPrefix(path, "/api/public/posts/") || !(strings.HasSuffix(path, "/comments") || strings.HasSuffix(path, "/questions")) {
		return request(t, a, method, path, input, owner)
	}
	cookie := commentCookie(t, a, "test-reader", "email", "reader@example.com")
	return commentAuthRequest(a, method, path, input, cookie, "http://blog.test")
}
func TestCommentReaderRequiredAndIdentityCannotBeSpoofed(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	input := commentDraft(post, false)
	path := "/api/public/posts/" + post.str("id") + "/comments"
	expectStatus(t, request(t, a, "POST", path, input, false), 401)
	cookie := commentCookie(t, a, "google:stable", "google", "actual@example.test")
	expectStatus(t, commentAuthRequest(a, "POST", path, input, cookie, ""), 403)
	expectStatus(t, commentAuthRequest(a, "POST", path, input, cookie, "https://evil.test"), 403)
	expectStatus(t, commentAuthRequest(a, "POST", path, input, cookie, "http://blog.test"), 201)
	saved := first(a.DB.Must(context.Background(), "SELECT * FROM comments"))
	if saved.str("email") != "actual@example.test" || len(mail.messages) != 0 {
		t.Fatal(saved, mail.messages)
	}
	status := commentAuthRequest(a, "GET", "/api/public/comment-auth", nil, cookie, "")
	containsHTML(t, status.Body.String(), `"provider":"google"`)
	excludesHTML(t, status.Body.String(), "actual@example.test", "google:stable")
	expectStatus(t, commentAuthRequest(a, "POST", "/api/public/comment-auth/logout", Row{}, cookie, "http://blog.test"), 200)
	if a.commentReader(withReaderCookie(cookie)) != nil {
		t.Fatal("logout retained session")
	}
}
func requestCommentEmail(t *testing.T, a *App, mail *commentMailbox) (*http.Cookie, string) {
	t.Helper()
	w := request(t, a, "POST", "/api/public/comment-auth/email", Row{"email": "READER@example.test", "returnTo": "/post/room"}, false)
	expectStatus(t, w, 202)
	if len(mail.messages) == 0 || len(w.Result().Cookies()) != 1 {
		t.Fatal(w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	if cookie.MaxAge != 900 || !cookie.HttpOnly {
		t.Fatal(cookie)
	}
	return cookie, mail.messages[len(mail.messages)-1].str("verificationToken")
}
func TestCommentEmailSignInBrowserExpiryReplayAndPrivacy(t *testing.T) {
	a, _, mail := commentMailFixture(t)
	cookie, token := requestCommentEmail(t, a, mail)
	path := "/api/public/comment-auth/confirm"
	input := Row{"token": token}
	expectStatus(t, request(t, a, "POST", path, input, false), 400)
	wrong := *cookie
	wrong.Value = "wrong-browser"
	expectStatus(t, commentAuthRequest(a, "POST", path, input, &wrong, "http://blog.test"), 400)
	row := first(a.DB.Must(context.Background(), "SELECT * FROM comment_login_links"))
	if row.str("token_hash") != hash(token) || row.str("browser_hash") != hash(cookie.Value) {
		t.Fatal("unhashed credentials")
	}
	expectStatus(t, request(t, a, "GET", "/reader/sign-in", nil, false), 200)
	if len(a.DB.Must(context.Background(), "SELECT * FROM comment_login_links")) != 1 {
		t.Fatal("GET consumed login")
	}
	w := commentAuthRequest(a, "POST", path, input, cookie, "http://blog.test")
	result := responseRow(t, w, 200)
	if result.str("returnTo") != "/post/room" || len(w.Result().Cookies()) == 0 {
		t.Fatal(result)
	}
	expectStatus(t, commentAuthRequest(a, "POST", path, input, cookie, "http://blog.test"), 400)
	if len(a.DB.Must(context.Background(), "SELECT * FROM newsletter_subscribers")) != 0 {
		t.Fatal("sign-in subscribed reader")
	}
	a.DB.Must(context.Background(), "UPDATE comment_login_throttle SET last_sent_at='2000-01-01T00:00:00.000Z'")
	cookie, token = requestCommentEmail(t, a, mail)
	a.DB.Must(context.Background(), "UPDATE comment_login_links SET expires_at='2000-01-01T00:00:00.000Z'")
	expectStatus(t, commentAuthRequest(a, "POST", path, Row{"token": token}, cookie, "http://blog.test"), 400)
	a.DB.Must(context.Background(), "UPDATE comment_reader_sessions SET expires_at='2000-01-01T00:00:00.000Z'")
	if a.commentReader(withReaderCookie(w.Result().Cookies()[len(w.Result().Cookies())-1])) != nil {
		t.Fatal("expired session accepted")
	}
}
func TestCommentEmailDeliveryFailureAndThrottle(t *testing.T) {
	a, _, mail := commentMailFixture(t)
	input := Row{"email": "reader@example.test", "returnTo": "/post/room"}
	mail.fail = true
	expectStatus(t, request(t, a, "POST", "/api/public/comment-auth/email", input, false), 502)
	for _, table := range []string{"comment_login_links", "comment_login_throttle"} {
		if len(a.DB.Must(context.Background(), "SELECT * FROM "+table)) != 0 {
			t.Fatal(table)
		}
	}
	mail.fail = false
	requestCommentEmail(t, a, mail)
	expectStatus(t, request(t, a, "POST", "/api/public/comment-auth/email", input, false), 202)
	if len(mail.messages) != 2 {
		t.Fatal("throttle failed", len(mail.messages))
	}
}
func TestCommentSocialAndEmailIdentitiesStaySeparate(t *testing.T) {
	a, _ := coreFixture(t)
	ctx := context.Background()
	for _, identity := range []string{"google:one", "microsoft:two", "apple:three", "email:shared@example.test"} {
		a.commentIdentity(ctx, identity, strings.Split(identity, ":")[0], "shared@example.test", "")
	}
	if len(a.DB.Must(ctx, "SELECT * FROM comment_readers")) != 4 {
		t.Fatal("identities merged by email")
	}
}

func TestCommentSocialRoundTripBindsBrowserAndSkipsEmail(t *testing.T) {
	a, post, mail := commentMailFixture(t)
	transport := a.Client.Transport
	var started Row
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/reader-auth/start":
			must(json.NewDecoder(r.Body).Decode(&started))
			return fixtureResponse(Row{"url": "https://accounts.google.com/o/oauth2/v2/auth?state=central"}), nil
		case "/v1/reader-auth/exchange":
			var input Row
			must(json.NewDecoder(r.Body).Decode(&input))
			if input.str("code") != "central-ticket" || commentChallenge(input.str("verifier")) != started.str("challenge") {
				t.Fatal("incorrect exchange binding")
			}
			return fixtureResponse(Row{"identity": strings.Repeat("a", 64), "provider": "google", "name": "Social Reader", "email": "reader@example.test"}), nil
		default:
			return transport.RoundTrip(r)
		}
	})
	w := request(t, a, "POST", "/api/public/comment-auth/start", Row{"provider": "google", "returnTo": "/post/room"}, false)
	expectStatus(t, w, 200)
	cookie := w.Result().Cookies()[0]
	callback := "/reader/auth/callback?code=central-ticket&state=" + started.str("state")
	expectStatus(t, request(t, a, "GET", callback, nil, false), 400)
	wrong := *cookie
	wrong.Value = "wrong"
	expectStatus(t, commentAuthRequest(a, "GET", callback, nil, &wrong, ""), 400)
	w = commentAuthRequest(a, "GET", callback, nil, cookie, "")
	expectStatus(t, w, 303)
	if w.Header().Get("Location") != "/post/room" {
		t.Fatal(w.Header())
	}
	expectStatus(t, commentAuthRequest(a, "GET", callback, nil, cookie, ""), 400)
	cookies := w.Result().Cookies()
	signedIn := cookies[len(cookies)-1]
	setCommentPolicy(t, a, true, false)
	input := commentDraft(post, false)
	expectStatus(t, commentAuthRequest(a, "POST", "/api/public/posts/"+post.str("id")+"/comments", input, signedIn, "http://blog.test"), 201)
	assertCommentPublic(t, a, post, false, true)
	if len(mail.messages) != 0 {
		t.Fatal("social sign-in sent email")
	}
}
func TestCommentEmailConfirmationIsAtomic(t *testing.T) {
	a, _, mail := commentMailFixture(t)
	cookie, token := requestCommentEmail(t, a, mail)
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- commentAuthRequest(a, "POST", "/api/public/comment-auth/confirm", Row{"token": token}, cookie, "http://blog.test").Code
		}()
	}
	wg.Wait()
	close(codes)
	success := 0
	for code := range codes {
		if code == 200 {
			success++
		} else if code != 400 {
			t.Fatal(code)
		}
	}
	if success != 1 {
		t.Fatal("link was not consumed exactly once")
	}
}
