package blog

import (
	"context"
	"fmt"
	"strings"
)

const localTeamMembersSQL = `SELECT 'local-owner' AS id,email,email AS name,'owner' AS role,0 AS owner_order FROM admins WHERE id=1 UNION ALL SELECT u.id,u.email,u.name,m.role,1 AS owner_order FROM engine_memberships m JOIN engine_users u ON u.id=m.user_id WHERE u.enabled=TRUE`

func localTeamPageBounds(input Row, total int64) (int64, int64, int64) {
	page, size := int64(1), int64(10)
	if v, ok := input["page"].(int); ok {
		page = int64(v)
	}
	if v, ok := input["pageSize"].(int); ok {
		size = int64(v)
	}
	pages := max(int64(1), (total+size-1)/size)
	return min(page, pages), size, pages
}
func (a *App) localTeamMembersPage(ctx context.Context, input Row) Row {
	total := first(a.DB.Must(ctx, "SELECT COUNT(*) AS total FROM ("+localTeamMembersSQL+") members"))["total"].(int64)
	page, size, pages := localTeamPageBounds(input, total)
	rows := a.DB.Must(ctx, "SELECT * FROM ("+localTeamMembersSQL+") members ORDER BY owner_order,email,id LIMIT $1 OFFSET $2", size, (page-1)*size)
	grants := a.localPageArticleGrants(ctx, rows)
	for _, row := range rows {
		row["primaryOwner"] = row.str("id") == "local-owner"
		row["articleIds"] = grants[row.str("id")]
		delete(row, "owner_order")
	}
	return Row{"members": rows, "total": total, "page": page, "pageSize": size, "pages": pages}
}
func (a *App) localPageArticleGrants(ctx context.Context, rows []Row) map[string][]string {
	result := map[string][]string{}
	args := []any{}
	placeholders := []string{}
	for _, row := range rows {
		result[row.str("id")] = []string{}
		args = append(args, row["id"])
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)))
	}
	if len(rows) == 0 {
		return result
	}
	for _, grant := range a.DB.Must(ctx, "SELECT user_id,post_id FROM engine_article_grants WHERE user_id IN ("+strings.Join(placeholders, ",")+") ORDER BY user_id,post_id", args...) {
		result[grant.str("user_id")] = append(result[grant.str("user_id")], grant.str("post_id"))
	}
	return result
}
func (a *App) localTeamInvitationsPage(ctx context.Context, input Row) Row {
	where := " FROM engine_invitations WHERE status='pending' AND expires_at>NOW()"
	total := first(a.DB.Must(ctx, "SELECT COUNT(*) AS total"+where))["total"].(int64)
	page, size, pages := localTeamPageBounds(input, total)
	rows := a.DB.Must(ctx, "SELECT id,email,role,article_id,expires_at"+where+" ORDER BY created_at,id LIMIT $1 OFFSET $2", size, (page-1)*size)
	invites := []Row{}
	for _, row := range rows {
		invites = append(invites, localInvitationPublic(row))
	}
	return Row{"invitations": invites, "total": total, "page": page, "pageSize": size, "pages": pages}
}
func localInvitationPublic(row Row) Row {
	return Row{"id": row["id"], "email": row["email"], "role": row["role"], "articleId": row["article_id"], "expiresAt": row["expires_at"]}
}
func (a *App) localTeamList(ctx context.Context) Row {
	members := a.localTeamMembersPage(ctx, Row{})
	invites := a.localTeamInvitationsPage(ctx, Row{})
	result := Row{"members": members["members"], "invitations": invites["invitations"]}
	delete(members, "members")
	delete(invites, "invitations")
	result["membersPagination"], result["invitationsPagination"] = members, invites
	return result
}
