package blog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func hostingAddressFixture(t *testing.T) *App {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://assigned.pages.example")
	a.saveSiteSetting(context.Background(), "cloud_owner", Row{"subject": "owner-id", "centralOrigin": "https://central.example"})
	return a
}
func hostedAddressState(status string) Row {
	return Row{"assignedUrl": "https://assigned.pages.example", "publicUrl": "https://assigned.pages.example", "requestedUrl": "https://blog.example.com", "mode": "dns", "status": status}
}
func TestHostedAddressUsesAssignedHostnameAndPreservesPendingState(t *testing.T) {
	a := hostingAddressFixture(t)
	a.saveSiteSetting(context.Background(), "domain", Row{"url": "https://old.example.com"})
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://central.example/v1/hosting/address" || r.Header.Get("Authorization") != "Bearer test" {
			t.Fatalf("unexpected hosting request: %s", r.URL)
		}
		return fixtureResponse(hostedAddressState("pending_dns")), nil
	})
	expectStatus(t, request(t, a, "PUT", "/api/settings/domain", Row{"url": "https://blog.example.com", "mode": "dns"}, false), 401)
	result := responseRow(t, request(t, a, "PUT", "/api/settings/domain", Row{"url": "https://blog.example.com", "mode": "dns"}, true), 200)
	if result.str("serverUrl") != "https://assigned.pages.example" || result.str("effectiveUrl") != "https://assigned.pages.example" || object(result["hosting"]).str("status") != "pending_dns" {
		t.Fatal(result)
	}
	if origin := a.publicationOrigin(httptest.NewRequest("GET", "https://assigned.pages.example/", nil)); origin != "https://assigned.pages.example" {
		t.Fatal(origin)
	}
}
func TestHostedAddressForwardsRequestedMountAndMode(t *testing.T) {
	a := hostingAddressFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" {
			t.Fatal(r.Method)
		}
		var input Row
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if input.str("publicUrl") != "https://example.com/blog" || input.str("mode") != "proxy" {
			t.Fatal(input)
		}
		return fixtureResponse(hostedAddressState("applying")), nil
	})
	responseRow(t, request(t, a, "PUT", "/api/settings/domain", Row{"url": "https://example.com/blog", "mode": "proxy"}, true), 200)
}
func TestHostedAddressUnavailableDoesNotBreakSettingsOrInventDNSTarget(t *testing.T) {
	a := hostingAddressFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) { return nil, errors.New("unavailable") })
	result := responseRow(t, request(t, a, "GET", "/api/settings/domain", nil, true), 200)
	if result.str("serverUrl") != "" || object(result["hosting"]).str("status") != "unavailable" {
		t.Fatal(result)
	}
	expectStatus(t, request(t, a, "PUT", "/api/settings/domain", Row{"url": "https://example.com", "mode": "dns"}, true), 503)
}
func TestHostedAddressDoesNotUsePersonalConnectionOrFollowRedirects(t *testing.T) {
	a := hostingAddressFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		t.Fatal("must not use personal account for hosted settings")
		return nil, nil
	})
	_, err := a.hostingAddress(context.Background(), nil)
	if err == nil {
		t.Fatal("missing engine credential accepted")
	}
	t.Setenv("AI_SERVICE_TOKEN", "test")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		response := fixtureResponse(Row{"error": "redirect"})
		response.StatusCode = 302
		response.Header.Set("Location", "https://untrusted.example")
		return response, nil
	})
	if _, err = a.hostingAddress(context.Background(), nil); err == nil {
		t.Fatal("redirect accepted")
	}
}
func TestHostedDeploymentUsesTrustedUpstream(t *testing.T) {
	a := hostingAddressFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureResponse(hostedAddressState("ready")), nil
	})
	input := Row{"server": "nginx", "publicUrl": "https://example.com/blog", "upstream": "https://untrusted.example", "hosted": true}
	result := responseRow(t, request(t, a, "POST", "/api/settings/deployment", input, true), 200)
	containsHTML(t, result.str("config"), "assigned.pages.example", "/blog")
	if contains := strings.Contains(result.str("config"), "untrusted.example"); contains {
		t.Fatal("used untrusted upstream")
	}
	input["server"] = "apache"
	expectStatus(t, request(t, a, "POST", "/api/settings/deployment", input, true), 400)
}
