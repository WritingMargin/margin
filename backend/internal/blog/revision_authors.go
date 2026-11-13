package blog

import (
	"context"
	"net/http"
	"strings"
)

func unknownRevisionAuthor() Row { return Row{"kind": "unknown", "name": "Not recorded"} }
func (a *App) revisionAuthor(r *http.Request) Row {
	if value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		if strings.HasPrefix(value, "moat_") {
			principal := a.oauthPrincipal(r, value)
			if principal == nil {
				fail(401, "This OAuth connection is no longer valid.")
			}
			return Row{"kind": "api_token", "name": principal["name"]}
		}
		token := first(a.DB.Must(r.Context(), "SELECT name FROM api_tokens WHERE token_hash=$1", hash(value)))
		if token == nil {
			fail(401, "This API token is no longer valid.")
		}
		return Row{"kind": "api_token", "name": token["name"]}
	}
	if principal := a.browserPrincipal(r); principal != nil && principal.str("subject") != "" && principal.str("subject") != a.teamOwnerSubject(r.Context()) {
		return Row{"kind": "member", "id": principal["subject"], "name": principal["email"]}
	}
	owner := first(a.DB.Must(r.Context(), "SELECT email FROM admins WHERE id=1"))
	if owner == nil {
		fail(401, "Sign in to continue.")
	}
	return Row{"kind": "owner", "name": owner["email"]}
}
func (a *App) savedRevisionAuthor(ctx context.Context, id, revision string) any {
	row := first(a.DB.Must(ctx, "SELECT author FROM post_revisions WHERE post_id=$1 AND revision=$2", id, revision))
	if row == nil {
		return unknownRevisionAuthor()
	}
	return row["author"]
}
