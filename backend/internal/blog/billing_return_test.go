package blog

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestBillingUsesServerPublicURL(t *testing.T) {
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog/")
	t.Setenv("MARGIN_BASE_PATH", "/blog")
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		var input Row
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if input.str("publicUrl") != "https://usefused.com/blog" {
			t.Fatal(input)
		}
		if r.URL.Path == "/v1/billing/portal" && calls == 3 && input.str("planId") != "starter" {
			t.Fatal("Plan selection was lost on the way to Central", input)
		}
		return fixtureResponse(Row{"url": "https://checkout.stripe.com/test"}), nil
	})
	for _, path := range []string{"checkout", "topups", "billing/portal"} {
		input := Row{"planId": "starter", "packId": "extra", "publicUrl": "https://untrusted.example"}
		expectStatus(t, request(t, a, "POST", "/blog/api/ai/"+path, input, true), 200)
	}
	expectStatus(t, request(t, a, "POST", "/blog/api/ai/billing/portal", Row{}, true), 200)
	if calls != 4 {
		t.Fatal(calls)
	}
}
