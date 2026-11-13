package blog

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestTeamPagesForwardBoundedQueriesToCentral(t *testing.T) {
	a, cookie, member := memberFixture(t, "owner")
	var sent Row
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cloud/api/engine-member" {
			return fixtureResponse(*member), nil
		}
		if r.URL.Path != "/cloud/api/engine-team" {
			t.Fatalf("unexpected Central route %s", r.URL.Path)
		}
		must(json.NewDecoder(r.Body).Decode(&sent))
		return fixtureResponse(Row{"members": []Row{}, "invitations": []Row{}, "page": 2, "pageSize": 25, "total": 31, "pages": 2}), nil
	})
	for _, test := range []struct{ path, action string }{
		{"/api/team/members", "list_members"},
		{"/api/team/invitations", "list_invitations"},
	} {
		result := responseRow(t, memberRequest(a, cookie, "GET", test.path+"?page=9&pageSize=25&actorSubject=forged&subject=forged", nil), 200)
		assertTeamPageRequest(t, sent, test.action, 9, 25)
		if result["page"] != float64(2) || result["total"] != float64(31) {
			t.Fatal("Central page clamp and count not preserved", result)
		}
		expectStatus(t, memberRequest(a, cookie, "GET", test.path, nil), 200)
		assertTeamPageRequest(t, sent, test.action, 1, 10)
	}
}

func assertTeamPageRequest(t *testing.T, sent Row, action string, page, size float64) {
	t.Helper()
	if sent.str("action") != action || sent["page"] != page || sent["pageSize"] != size {
		t.Fatal("page selection not forwarded", sent)
	}
	if sent.str("subject") != "central-owner-id" || sent.str("actorSubject") != "teammate-subject" {
		t.Fatal("publication identity overridden", sent)
	}
}

func TestTeamPagesRejectInvalidPagination(t *testing.T) {
	a, cookie, member := memberFixture(t, "owner")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/cloud/api/engine-member" {
			t.Fatal("invalid query reached Central listing", r.URL.Path)
		}
		return fixtureResponse(*member), nil
	})
	for _, path := range []string{"/api/team/members", "/api/team/invitations"} {
		for _, query := range []string{"page=", "page=0", "page=-1", "page=1.5", "page=no", "page=2147483648", "page=1&page=2", "pageSize=", "pageSize=0", "pageSize=-1", "pageSize=101", "pageSize=1.5", "pageSize=no", "pageSize=10&pageSize=25"} {
			expectStatus(t, memberRequest(a, cookie, "GET", path+"?"+query, nil), 400)
		}
	}
}

func TestTeamPagesRemainOwnerOnly(t *testing.T) {
	for _, role := range []string{"writer", "publisher", "peer_reviewer"} {
		t.Run(role, func(t *testing.T) {
			a, cookie, _ := memberFixture(t, role)
			for _, path := range []string{"/api/team/members", "/api/team/invitations"} {
				expectStatus(t, memberRequest(a, cookie, "GET", path, nil), 403)
				expectStatus(t, request(t, a, "GET", path, nil, false), 401)
			}
		})
	}
}
