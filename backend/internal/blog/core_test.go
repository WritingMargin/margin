package blog

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type testStorage struct {
	mu      sync.Mutex
	objects map[string][]byte
	onGet   func(string)
}

func (s *testStorage) Configured() bool             { return true }
func (s *testStorage) Info() Row                    { return Row{"configured": true} }
func (s *testStorage) Health(context.Context) error { return nil }
func (s *testStorage) Put(_ context.Context, key string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = bytes.Clone(data)
	return nil
}
func (s *testStorage) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	data := bytes.Clone(s.objects[key])
	s.mu.Unlock()
	if s.onGet != nil {
		s.onGet(key)
	}
	return data, nil
}
func (s *testStorage) Remove(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, key)
	return nil
}

type testTransport func(*http.Request) (*http.Response, error)

func (f testTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func fixtureResponse(value any) *http.Response {
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(encode(value)))}
}
func coreFixture(t *testing.T) (*App, *testStorage) {
	t.Helper()
	for _, key := range []string{"MARGIN_COOKIE_DOMAIN", "PUBLIC_URL", "SETUP_TOKEN", "MARGIN_BASE_PATH", "MARGIN_ALLOWED_ORIGINS"} {
		t.Setenv(key, "")
	}
	t.Setenv("MARGIN_ENV", "test")
	t.Setenv("AI_SERVICE_URL", "https://central.example")
	t.Setenv("AI_SERVICE_TOKEN", "test")
	db := fixtureDatabase(t)
	storage := &testStorage{objects: map[string][]byte{}}
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
	})}
	app := NewApp(db, storage, client, nil)
	db.Must(context.Background(), "INSERT INTO api_tokens(token_hash,name) VALUES($1,$2)", hash("owner"), "Test")
	return app, storage
}
func request(t *testing.T, a *App, method, path string, value any, owner bool) *httptest.ResponseRecorder {
	t.Helper()
	data := ""
	if value != nil {
		data = encode(value)
	}
	r := httptest.NewRequest(method, "http://blog.test"+path, strings.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	if owner {
		r.Header.Set("Authorization", "Bearer owner")
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func responseRow(t *testing.T, w *httptest.ResponseRecorder, status int) Row {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d, want %d: %s", w.Code, status, w.Body.String())
	}
	var row Row
	if err := json.Unmarshal(w.Body.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	return row
}
func expectStatus(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d, want %d: %s", w.Code, status, w.Body.String())
	}
}

func TestPostRevisionAndPublication(t *testing.T) {
	a, storage := coreFixture(t)
	expectStatus(t, request(t, a, "GET", "/api/posts", nil, false), 401)
	draft := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "First", "slug": "first", "content": "Private"}, true), 201)
	expectStatus(t, request(t, a, "GET", "/api/public/posts/first", nil, false), 404)
	path := "/api/posts/" + draft.str("id")
	expectStatus(t, request(t, a, "PUT", path, Row{"content": "lost"}, true), 428)
	current := responseRow(t, request(t, a, "PUT", path, Row{"revision": draft["revision"], "status": "published"}, true), 200)
	expectStatus(t, request(t, a, "PUT", path, Row{"revision": draft["revision"], "content": "lost"}, true), 409)
	public := responseRow(t, request(t, a, "GET", "/api/public/posts/first", nil, false), 200)
	if public.str("content") != "Private" {
		t.Fatal(public)
	}
	before := len(storage.objects)
	expectStatus(t, request(t, a, "POST", "/api/posts", Row{"title": "Duplicate", "slug": "first", "content": "Orphan"}, true), 409)
	if len(storage.objects) != before {
		t.Fatal("failed insert leaked storage")
	}
	var group sync.WaitGroup
	results := make(chan int, 2)
	for _, content := range []string{"A", "B"} {
		group.Add(1)
		go func(value string) {
			defer group.Done()
			results <- request(t, a, "PUT", path, Row{"revision": current["revision"], "content": value}, true).Code
		}(content)
	}
	group.Wait()
	close(results)
	sum := 0
	for code := range results {
		sum += code
	}
	if sum != 609 {
		t.Fatalf("CAS statuses total %d, want 200+409", sum)
	}
	if len(revisionEntries(t, a, path+"/revisions")) != 3 {
		t.Fatal("concurrent save created missing or extra history")
	}
}
func TestOwnerSessionAndCSRF(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("SETUP_TOKEN", "bootstrap")
	input := Row{"email": "OWNER@example.com", "password": "correct horse battery"}
	expectStatus(t, request(t, a, "POST", "/api/setup", input, false), 403)
	input["setupToken"] = "bootstrap"
	setup := request(t, a, "POST", "/api/setup", input, false)
	responseRow(t, setup, 201)
	cookies := setup.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal(cookies)
	}
	expectStatus(t, request(t, a, "POST", "/api/setup", input, false), 409)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "incorrect"}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/login", input, false), 200)
	r := httptest.NewRequest("POST", "http://blog.test/api/logout", strings.NewReader("{}"))
	r.AddCookie(cookies[0])
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 403)
	r.Header.Set("Origin", "http://blog.test")
	w = httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 200)
	if len(a.DB.Must(context.Background(), "SELECT * FROM sessions WHERE token_hash=$1", hash(cookies[0].Value))) != 0 {
		t.Fatal("session not revoked")
	}
}
func TestTokenRevocation(t *testing.T) {
	a, _ := coreFixture(t)
	created := responseRow(t, request(t, a, "POST", "/api/tokens", Row{}, true), 201)
	value := created.str("token")
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "http://blog.test/api/posts", nil)
		r.Header.Set("Authorization", "Bearer "+value)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	expectStatus(t, call(), 200)
	expectStatus(t, request(t, a, "DELETE", "/api/tokens/"+hash(value), nil, true), 200)
	expectStatus(t, call(), 401)
}

func TestTurnstileEncryptedConfiguration(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", hex.EncodeToString(bytes.Repeat([]byte{7}, 32)))
	saved := responseRow(t, request(t, a, "PUT", "/api/settings/turnstile", Row{"siteKey": "public_key", "secretKey": "private_key"}, true), 200)
	if !saved.yes("secretConfigured") || saved["secretKey"] != nil {
		t.Fatal(saved)
	}
	row := first(a.DB.Must(context.Background(), "SELECT encrypted_configuration FROM turnstile_settings"))
	if strings.Contains(row.str("encrypted_configuration"), "private_key") {
		t.Fatal("plaintext secret")
	}
	expectStatus(t, request(t, a, "PUT", "/api/settings/turnstile", Row{"siteKey": "public_key"}, true), 200)
	expectStatus(t, request(t, a, "PUT", "/api/settings/turnstile", Row{"siteKey": "changed_key"}, true), 400)
	t.Setenv("CONTENT_ENCRYPTION_KEY", hex.EncodeToString(bytes.Repeat([]byte{8}, 32)))
	broken := responseRow(t, request(t, a, "GET", "/api/settings/turnstile", nil, true), 200)
	if broken.yes("secretConfigured") || broken.str("issue") == "" {
		t.Fatal(broken)
	}
	public := responseRow(t, request(t, a, "GET", "/api/public/settings", nil, false), 200)
	if public.str("captchaSiteKey") != "" {
		t.Fatal(public)
	}
}
func TestCoverVisibilityRecheckedAfterStorage(t *testing.T) {
	a, storage := coreFixture(t)
	id := uuid()
	url := "/api/public/covers/" + id
	ctx := context.Background()
	a.DB.Must(ctx, "INSERT INTO uploaded_covers(id,object_key,content_type) VALUES($1,$2,$3)", id, "assets/covers/"+id, "image/png")
	_ = storage.Put(ctx, "assets/covers/"+id, []byte("image"))
	expectStatus(t, request(t, a, "GET", url, nil, false), 404)
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Cover", "slug": "cover", "content": "body", "cover": url, "status": "published"}, true), 201)
	response := request(t, a, "GET", url, nil, false)
	expectStatus(t, response, 200)
	if response.Header().Get("Cross-Origin-Resource-Policy") != "cross-origin" {
		t.Fatal(response.Header())
	}
	storage.onGet = func(string) { a.DB.Must(ctx, "UPDATE posts SET status='draft' WHERE id=$1", post["id"]) }
	expectStatus(t, request(t, a, "GET", url, nil, false), 404)
	expectStatus(t, request(t, a, "GET", url, nil, true), 200)
}

func TestCommentCaptchaAndModeration(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	expectStatus(t, request(t, a, "PUT", "/api/settings/turnstile", Row{"siteKey": "site", "secretKey": "secret"}, true), 200)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "challenges.cloudflare.com" {
			data, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(data), "secret=secret") {
				t.Error("missing CAPTCHA secret")
			}
			return fixtureResponse(Row{"success": true, "hostname": "blog.test"}), nil
		}
		return fixtureResponse(Row{"entitlements": Row{"active": false, "planId": nil, "expiresAt": nil}}), nil
	})
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Comments", "slug": "comments", "content": "body", "status": "published"}, true), 201)
	path := "/api/public/posts/" + post.str("id") + "/comments"
	input := Row{"name": " Reader ", "email": "READER@example.com", "body": " Useful ", "captchaToken": "valid"}
	expectStatus(t, conversationRequest(t, a, "POST", path, input, false), 201)
	private := first(a.DB.Must(context.Background(), "SELECT * FROM comments"))
	if private.str("name") != "Reader" || private.str("email") != "reader@example.com" || private.yes("approved") {
		t.Fatal(private)
	}
	public := request(t, a, "GET", path, nil, false)
	if strings.TrimSpace(public.Body.String()) != "[]" {
		t.Fatal(public.Body.String())
	}
	expectStatus(t, request(t, a, "PATCH", "/api/comments/"+private.str("id"), Row{"approved": true}, true), 200)
	public = request(t, a, "GET", path, nil, false)
	if strings.Contains(public.Body.String(), "reader@example.com") || !strings.Contains(public.Body.String(), "Useful") {
		t.Fatal(public.Body.String())
	}
}
func uploadRequest(t *testing.T, a *App, path, kind string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "http://blog.test"+path, bytes.NewReader(data))
	r.Header.Set("Content-Type", kind)
	r.Header.Set("Authorization", "Bearer owner")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestUploadMagicBytesAndLogoPrivacy(t *testing.T) {
	a, _ := coreFixture(t)
	png := append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, 24)...)
	expectStatus(t, uploadRequest(t, a, "/api/settings/logo", "image/jpeg", png), 400)
	expectStatus(t, uploadRequest(t, a, "/api/settings/logo", "image/svg+xml", []byte("<svg></svg>")), 400)
	created := responseRow(t, uploadRequest(t, a, "/api/settings/logo", "image/png", png), 201)
	url := created.str("url")
	expectStatus(t, request(t, a, "GET", url, nil, false), 404)
	expectStatus(t, request(t, a, "GET", url, nil, true), 200)
	theme := defaultTheme()
	theme["logo"] = url
	expectStatus(t, request(t, a, "PUT", "/api/settings", theme, true), 200)
	public := request(t, a, "GET", url, nil, false)
	expectStatus(t, public, 200)
	if !bytes.Equal(public.Body.Bytes(), png) {
		t.Fatal("logo bytes changed")
	}
	expectStatus(t, uploadRequest(t, a, "/api/settings/logo", "image/png", make([]byte, (2<<20)+1)), 413)
}
func TestCloudinarySigningAndFieldFiltering(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("CLOUDINARY_CLOUD_NAME", "test-cloud")
	t.Setenv("CLOUDINARY_API_KEY", "key")
	t.Setenv("CLOUDINARY_API_SECRET", "secret")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "api.cloudinary.com" {
			if r.Header.Get("Authorization") != "Basic a2V5OnNlY3JldA==" {
				t.Error("missing Cloudinary credentials")
			}
			return fixtureResponse(Row{"resources": []Row{{"public_id": "asset", "secure_url": "https://cdn.example/asset", "secret": "hidden"}}}), nil
		}
		return fixtureResponse(Row{"entitlements": Row{"active": true, "planId": "studio", "expiresAt": "2099-01-01T00:00:00.000Z"}}), nil
	})
	signed := responseRow(t, request(t, a, "POST", "/api/media/sign", Row{"folder": "margin"}, true), 200)
	expected := sha256.Sum256([]byte(fmt.Sprintf("folder=margin&timestamp=%.0fsecret", signed["timestamp"])))
	if signed.str("signature") != hex.EncodeToString(expected[:]) || signed.str("cloudName") != "test-cloud" {
		t.Fatal(signed)
	}
	listed := responseRow(t, request(t, a, "GET", "/api/media", nil, true), 200)
	resources := listed["resources"].([]any)
	if len(resources) != 2 || resources[0].(map[string]any)["secret"] != nil {
		t.Fatal(listed)
	}
	expectStatus(t, request(t, a, "POST", "/api/media/sign", Row{"folder": "../bad?"}, true), 400)
}

func TestOptionalTokenBodyAndGlobalJSONValidation(t *testing.T) {
	a, _ := coreFixture(t)
	r := httptest.NewRequest("POST", "http://blog.test/api/tokens", nil)
	r.Header.Set("Authorization", "Bearer owner")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	responseRow(t, w, 201)
	r = httptest.NewRequest("POST", "http://blog.test/api/logout", strings.NewReader("{"))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 400)
}
