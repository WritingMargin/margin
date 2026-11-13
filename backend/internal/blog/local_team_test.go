package blog

import (
	"testing"
)

func TestLocalTeamProtectsPrimaryOwnerAndMembershipVersions(t *testing.T) {
	a, cookie, member := memberFixture(t, "owner")
	path := "/api/team/members/" + member.str("subject")
	expectStatus(t, memberRequest(a, cookie, "PATCH", "/api/team/members/local-owner", Row{"role": "writer"}), 403)
	expectStatus(t, memberRequest(a, cookie, "DELETE", "/api/team/members/local-owner", nil), 403)
	expectStatus(t, memberRequest(a, cookie, "POST", "/api/team/invitations", Row{"email": "OWNER@EXAMPLE.COM", "role": "writer"}), 400)
	expectStatus(t, memberRequest(a, cookie, "PATCH", path, Row{"role": "peer_reviewer"}), 400)
	expectStatus(t, memberRequest(a, cookie, "PATCH", path, Row{"role": "writer"}), 200)
	current := a.localMemberPrincipal(t.Context(), member.str("subject"))
	if current.str("role") != "writer" || current.str("membershipVersion") != member.str("membershipVersion") {
		t.Fatal("Role changes must retain membership identity", current)
	}
	// The session immediately loses team administration after demotion.
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/team", nil), 403)
}
func TestLocalTeamLastReviewGrantRemovalRevokesMembership(t *testing.T) {
	a, cookie, member := memberFixture(t, "peer_reviewer")
	subject := member.str("subject")
	for _, id := range []string{"article-one", "article-two"} {
		a.DB.Must(t.Context(), `INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES($1,$1,$1,'','draft',$1,'fixture')`, id)
		a.DB.Must(t.Context(), "INSERT INTO engine_article_grants(user_id,post_id,version) VALUES($1,$2,$2)", subject, id)
	}
	for _, article := range []string{"article-one", "article-two"} {
		expectStatus(t, request(t, a, "DELETE", "/api/team/members/"+subject+"/articles/"+article, nil, true), 200)
	}
	if a.localMemberPrincipal(t.Context(), subject) != nil {
		t.Fatal("Reviewer with no article grants retained membership")
	}
	if first(a.DB.Must(t.Context(), "SELECT id FROM engine_users WHERE id=$1", subject)) == nil {
		t.Fatal("Removing access must preserve account credentials")
	}
	expectStatus(t, memberRequest(a, cookie, "GET", "/api/public/team/reviews", nil), 401)
}
func TestLocalTeamRemovingReviewGrantPreservesWriterMembership(t *testing.T) {
	a, _, member := memberFixture(t, "writer")
	subject := member.str("subject")
	a.DB.Must(t.Context(), `INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES('article','Article','article','','draft','article','fixture')`)
	a.DB.Must(t.Context(), "INSERT INTO engine_article_grants(user_id,post_id,version) VALUES($1,'article','grant')", subject)
	expectStatus(t, request(t, a, "DELETE", "/api/team/members/"+subject+"/articles/article", nil, true), 200)
	principal := a.localMemberPrincipal(t.Context(), subject)
	if principal.str("role") != "writer" || len(principal["articleIds"].([]string)) != 0 {
		t.Fatal("Removing reviewer delegation changed writer membership", principal)
	}
	expectStatus(t, request(t, a, "DELETE", "/api/team/members/"+subject, nil, true), 200)
	if a.localMemberPrincipal(t.Context(), subject) != nil {
		t.Fatal("Removed writer retained membership")
	}
}
