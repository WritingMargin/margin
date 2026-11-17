package blog

import (
	"fmt"
	"net/http"
	"testing"
)

func TestTeamPagesUseSQLCountsAndBoundedPages(t *testing.T) {
	a, cookie, _ := memberFixture(t, "owner")
	checkTeamPagesUseSQLCountsAndBoundedPages(t, a, cookie)
}
func TestPostgreSQLTeamPagesUseSQLCountsAndBoundedPages(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	a, _, member := memberFixture(t, "owner")
	a.DB = db
	a.createOwner(t.Context(), "owner@example.com", "unused", "research")
	saveMemberFixture(t, a, *member)
	login := request(t, a, "POST", "/api/login", Row{"email": (*member)["email"], "password": localMemberTestPassword}, false)
	expectStatus(t, login, 200)
	checkTeamPagesUseSQLCountsAndBoundedPages(t, a, cloudAuthenticatedCookie(t, login))
}
func checkTeamPagesUseSQLCountsAndBoundedPages(t *testing.T, a *App, cookie *http.Cookie) {
	t.Helper()
	for i := 0; i < 29; i++ {
		id := fmt.Sprintf("user-%02d", i)
		a.DB.Must(t.Context(), "INSERT INTO engine_users(id,email,name,password_hash,auth_version) VALUES($1,$2,$1,'unused','v1')", id, id+"@example.com")
		a.DB.Must(t.Context(), "INSERT INTO engine_memberships(user_id,role,version) VALUES($1,'writer','m1')", id)
	}
	for i := 0; i < 31; i++ {
		id := fmt.Sprintf("invite-%02d", i)
		a.DB.Must(t.Context(), "INSERT INTO engine_invitations(id,email,role,token_hash,expires_at) VALUES($1,$2,'writer',$1,'2099-01-01T00:00:00.000Z')", id, id+"@example.com")
	}
	// Expired, accepted and revoked rows never inflate the pending count.
	for _, status := range []string{"accepted", "revoked"} {
		a.DB.Must(t.Context(), "INSERT INTO engine_invitations(id,email,role,token_hash,expires_at,status) VALUES($1,$1,'writer',$1,'2099-01-01T00:00:00.000Z',$1)", status)
	}
	a.DB.Must(t.Context(), "INSERT INTO engine_invitations(id,email,role,token_hash,expires_at) VALUES('expired','expired@example.com','writer','expired','2000-01-01T00:00:00.000Z')")
	for _, kind := range []string{"members", "invitations"} {
		path := "/api/team/" + kind
		result := responseRow(t, memberRequest(a, cookie, "GET", path+"?page=9&pageSize=25&actorSubject=forged", nil), 200)
		assertLocalTeamPage(t, result, kind, 2, 25, 31, 6)
		result = responseRow(t, memberRequest(a, cookie, "GET", path, nil), 200)
		assertLocalTeamPage(t, result, kind, 1, 10, 31, 10)
	}
	members := responseRow(t, memberRequest(a, cookie, "GET", "/api/team/members", nil), 200)["members"].([]any)
	if !object(members[0]).yes("primaryOwner") {
		t.Fatal("Primary owner must be first", members[0])
	}
}
func assertLocalTeamPage(t *testing.T, result Row, kind string, page, size, total, length float64) {
	t.Helper()
	if result["page"] != page || result["pageSize"] != size || result["total"] != total || float64(len(result[kind].([]any))) != length {
		t.Fatal("Incorrect bounded SQL page", result)
	}
}

func TestTeamPagesRejectInvalidPagination(t *testing.T) {
	a, cookie, _ := memberFixture(t, "owner")
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
