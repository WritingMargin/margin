package blog

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"testing"
)

// Isolated UI verification; it never calls a real Central or provider service.
func TestCloudOwnerBrowserPreview(t *testing.T) {
	if os.Getenv("MARGIN_CLOUD_LOGIN_PREVIEW") != "1" {
		t.Skip("explicit browser preview only")
	}
	a := cloudOwnerFixture(t)
	t.Setenv("MARGIN_ENV", "test")
	a.Web = os.DirFS("../../../dist/client")
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cloud/api/engine-login" {
			var input Row
			must(json.NewDecoder(r.Body).Decode(&input))
			if input.str("email") == "owner@example.com" && input.str("password") == "preview-only-password-2026" {
				return fixtureResponse(Row{"authenticated": true, "subject": "central-owner-id"}), nil
			}
			response := fixtureResponse(Row{"error": "Email or password is incorrect."})
			response.StatusCode = 401
			return response, nil
		}
		return fixtureResponse(Row{"entitlements": Row{"active": false}}), nil
	})}
	server := httptest.NewServer(a)
	defer server.Close()
	t.Setenv("PUBLIC_URL", server.URL)
	fmt.Println("MARGIN_OWNER_PREVIEW=" + server.URL + "/admin")
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	defer signal.Stop(stop)
	<-stop
}
