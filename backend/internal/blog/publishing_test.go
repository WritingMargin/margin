package blog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func publishingFixture(t *testing.T) (*App, *http.Cookie, Row) {
	t.Helper()
	a, _, post := publicFixture(t)
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	t.Setenv("PUBLIC_URL", "https://publisher.example.com/journal")
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	t.Setenv("MARGIN_COOKIE_DOMAIN", "host-only")
	t.Setenv("MARGIN_ALLOWED_ORIGINS", "http://blog.test")
	res := request(t, a, "POST", "/journal/api/setup", Row{"email": "writer@example.com", "password": token()}, false)
	expectStatus(t, res, 201)
	return a, res.Result().Cookies()[0], post
}
func connectPublishingFixture(t *testing.T, a *App, owner *http.Cookie, provider string) {
	t.Helper()
	prefix := "MARGIN_" + strings.ToUpper(provider) + "_PUBLISHING_"
	t.Setenv(prefix+"CLIENT_ID", "client")
	t.Setenv(prefix+"CLIENT_SECRET", "secret")
	path := "/journal/api/settings/publishing/" + provider + "/connect"
	expectStatus(t, request(t, a, "POST", path, Row{}, true), 401)
	start := ownerSessionRequest(a, owner, "POST", path, Row{})
	result := responseRow(t, start, 200)
	auth, err := url.Parse(result.str("url"))
	if err != nil {
		t.Fatal(err)
	}
	callback := "/journal/publishing/callback/" + provider
	if auth.Query().Get("redirect_uri") != "https://publisher.example.com"+callback {
		t.Fatal(auth)
	}
	path = callback + "?code=one&state=" + url.QueryEscape(auth.Query().Get("state"))
	expectStatus(t, request(t, a, "GET", path, nil, false), 400)
	cookie := start.Result().Cookies()[0]
	perform := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		r.AddCookie(cookie)
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	expectStatus(t, perform(), 303)
	expectStatus(t, perform(), 400)
	stored := a.publishingConnection(context.Background(), provider)
	if stored == nil || strings.Contains(encode(stored), "provider-access") {
		t.Fatal("grant was not encrypted")
	}
}
func TestPublishingGoogleMountedPropertyAndCanonical(t *testing.T) {
	a, owner, _ := publishingFixture(t)
	const origin = "https://publisher.example.com/journal"
	var submitted, inspected string
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Host + r.URL.Path {
		case "oauth2.googleapis.com/token":
			return fixtureResponse(Row{"access_token": "provider-access", "token_type": "Bearer", "expires_in": 3600}), nil
		case "www.googleapis.com/webmasters/v3/sites":
			return fixtureResponse(Row{"siteEntry": []Row{{"siteUrl": "sc-domain:example.com", "permissionLevel": "siteOwner"}, {"siteUrl": "https://publisher.example.com/jour", "permissionLevel": "siteOwner"}}}), nil
		case "searchconsole.googleapis.com/v1/urlInspection/index:inspect":
			var in Row
			must(json.NewDecoder(r.Body).Decode(&in))
			inspected = in.str("inspectionUrl")
			return fixtureResponse(Row{"inspectionResult": Row{"indexStatusResult": Row{"coverageState": "Indexed"}}}), nil
		default:
			if r.Method != "PUT" || r.Header.Get("Authorization") != "Bearer provider-access" {
				t.Fatal(r.Method, r.URL)
			}
			submitted = r.URL.EscapedPath()
			return fixtureResponse(Row{}), nil
		}
	})
	connectPublishingFixture(t, a, owner, "google")
	path := "/journal/api/settings/publishing/google"
	result := responseRow(t, request(t, a, "GET", path+"/properties", nil, true), 200)
	if encode(result["properties"]) != `["sc-domain:example.com"]` {
		t.Fatal(result)
	}
	input := Row{"property": "sc-domain:example.com"}
	responseRow(t, request(t, a, "POST", path+"/submit", input, true), 200)
	if !strings.HasSuffix(submitted, "/sitemaps/"+url.PathEscape(origin+"/sitemap.xml")) {
		t.Fatal(submitted)
	}
	input["slug"] = "crawlable"
	result = responseRow(t, request(t, a, "POST", path+"/inspect", input, true), 200)
	if result.str("coverageState") != "Indexed" || inspected != origin+"/post/crawlable" {
		t.Fatal(result, inspected)
	}
	input["property"] = "sc-domain:elsewhere.com"
	expectStatus(t, request(t, a, "POST", path+"/inspect", input, true), 400)
}
func TestPublishingLinkedInReviewAndRetry(t *testing.T) {
	a, owner, post := publishingFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/oauth/v2/accessToken":
			return fixtureResponse(Row{"access_token": "provider-access", "token_type": "Bearer", "expires_in": 3600}), nil
		case "/v2/userinfo":
			return fixtureResponse(Row{"name": "Test Member", "sub": "member-123"}), nil
		case "/v2/ugcPosts":
			calls++
			var in Row
			must(json.NewDecoder(r.Body).Decode(&in))
			if in.str("author") != "urn:li:person:member-123" || !strings.Contains(encode(in), "https://publisher.example.com/journal/post/crawlable") {
				t.Fatal(in)
			}
			res := fixtureResponse(Row{})
			res.StatusCode = 201
			res.Header.Set("X-Restli-Id", "share-1")
			return res, nil
		}
		t.Fatal(r.URL)
		return nil, nil
	})
	connectPublishingFixture(t, a, owner, "linkedin")
	path := "/journal/api/settings/publishing/linkedin"
	in := Row{"id": post["id"], "text": "Reviewed text"}
	review := responseRow(t, ownerSessionRequest(a, owner, "POST", path+"/preview", in), 200)
	in["review"] = review["review"]
	in["text"] = "Changed text"
	expectStatus(t, ownerSessionRequest(a, owner, "POST", path+"/publish", in), 409)
	in["text"] = "Reviewed text"
	for range 2 {
		responseRow(t, ownerSessionRequest(a, owner, "POST", path+"/publish", in), 200)
	}
	if calls != 1 {
		t.Fatal("duplicate external post", calls)
	}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("response lost")
	})
	in = Row{"id": post["id"], "text": "Another reviewed share"}
	review = responseRow(t, ownerSessionRequest(a, owner, "POST", path+"/preview", in), 200)
	in["review"] = review["review"]
	expectStatus(t, ownerSessionRequest(a, owner, "POST", path+"/publish", in), 502)
	expectStatus(t, ownerSessionRequest(a, owner, "POST", path+"/publish", in), 409)
	if calls != 2 {
		t.Fatal("retried a share with unknown delivery status", calls)
	}
	responseRow(t, ownerSessionRequest(a, owner, "POST", path+"/disconnect", Row{}), 200)
	expectStatus(t, ownerSessionRequest(a, owner, "POST", path+"/publish", in), 409)
}
