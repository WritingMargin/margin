package blog

import (
	"context"
	"net/http"
	"strings"

	"github.com/Usefused/fused-open-core/oauthserver"
)

type oauthMemberBindingKey struct{}
type oauthMemberBinding struct {
	Subject              string            `json:"subject,omitempty"`
	AuthVersion          string            `json:"authVersion,omitempty"`
	MembershipVersion    string            `json:"membershipVersion,omitempty"`
	ArticleGrantVersions map[string]string `json:"articleGrantVersions,omitempty"`
}

func oauthArticleVersions(principal Row) map[string]string {
	switch values := principal["articleGrantVersions"].(type) {
	case map[string]string:
		return nonemptyOAuthArticleVersions(values)
	case map[string]any:
		return decodedOAuthArticleVersions(values)
	case Row:
		return decodedOAuthArticleVersions(values)
	}
	return map[string]string{}
}
func nonemptyOAuthArticleVersions(values map[string]string) map[string]string {
	versions := map[string]string{}
	for id, version := range values {
		if version != "" {
			versions[id] = version
		}
	}
	return versions
}
func decodedOAuthArticleVersions(values map[string]any) map[string]string {
	versions := map[string]string{}
	for id, value := range values {
		if version, ok := value.(string); ok && version != "" {
			versions[id] = version
		}
	}
	return versions
}
func oauthBinding(principal Row) oauthMemberBinding {
	return oauthMemberBinding{Subject: principal.str("subject"), AuthVersion: principal.str("authVersion"), MembershipVersion: principal.str("membershipVersion"), ArticleGrantVersions: oauthArticleVersions(principal)}
}
func oauthMemberScopeAllowed(principal Row, scope string) bool {
	if scope == "review:assigned" {
		return len(oauthArticleVersions(principal)) > 0
	}
	switch principal.str("role") {
	case "owner":
		return validOAuthPermission(scope)
	case "publisher":
		return hasOAuthScope(legacyOAuthScopes("publisher"), scope)
	case "writer":
		return hasOAuthScope(legacyOAuthScopes("writer"), scope)
	}
	return false
}

// A nil principal denotes a pre-existing local-owner grant, whose scope model
// remains unchanged. Member grants always have an authoritative current identity.
func effectiveOAuthScopes(scopes []string, principal Row) []string {
	scopes = normalizedOAuthScopes(scopes)
	if principal == nil {
		return scopes
	}
	result := []string{}
	for _, scope := range scopes {
		if oauthMemberScopeAllowed(principal, scope) {
			result = append(result, scope)
		}
	}
	return result
}
func (a *App) oauthBrowserPrincipal(r *http.Request) Row {
	principal := a.browserPrincipal(r)
	if principal == nil {
		return nil
	}
	if principal.str("subject") == "" {
		return principal
	}
	// A legacy owner cookie still creates a member-bound grant on a connected
	// engine. OAuth does not inherit the old cookie's membership bypass.
	if principal.str("authVersion") == "" {
		current, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-member", Row{"memberSubject": principal["subject"]})
		requireCentralSuccess(current, status)
		if current.str("subject") != principal.str("subject") {
			fail(503, "Your publication membership could not be verified.")
		}
		principal = current
	}
	if principal.str("authVersion") == "" || principal.str("membershipVersion") == "" || !validMemberRole(principal.str("role")) {
		fail(503, "Your publication membership could not be verified for this connection.")
	}
	return principal
}
func (a *App) oauthSubject(ctx context.Context, principal Row) int {
	if principal.str("subject") == "" {
		return 1
	}
	var id int
	_, err := (oauthStore{db: a.DB, app: a}).mutate(ctx, func(t oauthTx) error {
		if err := t.exec("INSERT INTO oauth_subjects(id,subject) SELECT COALESCE(MAX(id),1)+1,$1 FROM oauth_subjects WHERE TRUE ON CONFLICT(subject) DO NOTHING", principal["subject"]); err != nil {
			return err
		}
		return t.row("SELECT id FROM oauth_subjects WHERE subject=$1", principal["subject"]).Scan(&id)
	})
	must(err)
	return id
}
func (a *App) validateOAuthMember(ctx context.Context, subjectID int, binding oauthMemberBinding) (Row, error) {
	if subjectID == 1 && binding.Subject == "" {
		if first(a.DB.Must(ctx, "SELECT id FROM admins WHERE id=1")) == nil {
			return nil, oauthserver.ErrOAuthGrantDenied
		}
		return nil, nil
	}
	mapped := first(a.DB.Must(ctx, "SELECT subject FROM oauth_subjects WHERE id=$1", subjectID))
	if !binding.matchesSubject(mapped.str("subject")) {
		return nil, oauthserver.ErrOAuthGrantDenied
	}
	current, removed := a.currentOAuthMember(ctx, binding)
	if removed || !sameOAuthBinding(oauthBinding(current), binding) {
		// Only this incarnation is revoked; rejoining and consenting again is safe.
		a.revokeOAuthMemberBinding(ctx, subjectID, binding)
		return nil, oauthserver.ErrOAuthGrantDenied
	}
	return pinOAuthArticles(current, binding), nil
}
func (binding oauthMemberBinding) matchesSubject(subject string) bool {
	return binding.Subject != "" && subject == binding.Subject && binding.AuthVersion != "" && binding.MembershipVersion != ""
}
func validCurrentOAuthMember(current Row, subject string) bool {
	return current.str("subject") == subject && validMemberRole(current.str("role")) && current.str("authVersion") != "" && current.str("membershipVersion") != ""
}
func (a *App) currentOAuthMember(ctx context.Context, binding oauthMemberBinding) (Row, bool) {
	current, status := a.centralIdentityRequest(ctx, "/cloud/api/engine-member", Row{"memberSubject": binding.Subject})
	removed := map[int]bool{401: true, 403: true, 404: true}[status]
	if removed {
		return current, true
	}
	requireCentralSuccess(current, status)
	// Malformed successful replies fail closed without permanently erasing grants.
	if !validCurrentOAuthMember(current, binding.Subject) {
		fail(503, "Your publication membership could not be verified.")
	}
	return current, false
}
func pinOAuthArticles(current Row, binding oauthMemberBinding) Row {
	allowed := map[string]string{}
	ids := []string{}
	for id, version := range oauthArticleVersions(current) {
		if binding.ArticleGrantVersions[id] == version {
			allowed[id] = version
			ids = append(ids, id)
		}
	}
	current["articleGrantVersions"], current["articleIds"] = allowed, ids
	return current
}
func (a *App) revokeOAuthMemberBinding(ctx context.Context, subject int, binding oauthMemberBinding) {
	// The same binding envelope is present in codes, tokens and consents. Match it
	// before deleting anything so an old token cannot revoke a new incarnation.
	_, err := (oauthStore{db: a.DB, app: a}).mutate(ctx, func(t oauthTx) error { return t.revokeMemberArtifacts(subject, binding) })
	must(err)
}
func (t oauthTx) revokeMemberArtifacts(subject int, binding oauthMemberBinding) error {
	artifacts := []struct{ selectSQL, revokeSQL string }{
		{"SELECT code_hash,data FROM oauth_codes WHERE subject_id=$1", "DELETE FROM oauth_codes WHERE code_hash=$1 AND subject_id=$2"},
		{"SELECT access_hash,data FROM oauth_tokens WHERE subject_id=$1", "UPDATE oauth_tokens SET revoked=1 WHERE access_hash=$1 AND subject_id=$2"},
		{"SELECT client_id,data FROM oauth_consents WHERE subject_id=$1", "DELETE FROM oauth_consents WHERE client_id=$1 AND subject_id=$2"},
	}
	for _, artifact := range artifacts {
		ids, err := t.memberArtifactIDs(artifact.selectSQL, subject, binding)
		if err != nil {
			return err
		}
		for _, id := range ids {
			if err = t.exec(artifact.revokeSQL, id, subject); err != nil {
				return err
			}
		}
	}
	return nil
}
func (t oauthTx) memberArtifactIDs(query string, subject int, binding oauthMemberBinding) ([]string, error) {
	rows, err := t.tx.QueryContext(t.ctx, query, subject)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id, raw string
		if err = rows.Scan(&id, &raw); err != nil {
			return nil, err
		}
		var artifact struct{ Member oauthMemberBinding }
		if err = oauthDecode(raw, &artifact); err != nil {
			return nil, err
		}
		if sameOAuthBinding(artifact.Member, binding) {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}
func sameOAuthBinding(a, b oauthMemberBinding) bool {
	return a.Subject == b.Subject && a.AuthVersion == b.AuthVersion && a.MembershipVersion == b.MembershipVersion
}
func (s oauthStore) validateCodeMember(ctx context.Context, digest string) (Row, error) {
	row := first(s.db.Must(ctx, "SELECT data FROM oauth_codes WHERE code_hash=$1", digest))
	if row == nil {
		return nil, oauthserver.ErrOAuthGrantDenied
	}
	var code oauthCode
	if err := oauthDecode(row.str("data"), &code); err != nil {
		return nil, err
	}
	return s.app.validateOAuthMember(ctx, code.SubjectID, code.Member)
}
func (s oauthStore) validateRefreshMember(ctx context.Context, digest string) (Row, error) {
	row := first(s.db.Must(ctx, "SELECT data FROM oauth_tokens WHERE refresh_hash=$1 AND revoked=0", digest))
	if row == nil {
		return nil, oauthserver.ErrOAuthGrantDenied
	}
	var grant oauthGrant
	if err := oauthDecode(row.str("data"), &grant); err != nil {
		return nil, err
	}
	return s.app.validateOAuthMember(ctx, grant.SubjectID, grant.Member)
}
func (a *App) requestMemberPrincipal(r *http.Request) Row {
	if value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer moat_"); ok {
		return a.oauthPrincipal(r, "moat_"+value)
	}
	return a.browserPrincipal(r)
}
