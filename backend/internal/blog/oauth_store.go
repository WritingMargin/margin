package blog

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/Usefused/fused-open-core/oauthserver"
	guuid "github.com/google/uuid"
)

// All OAuth mutations take the same database row lock before reading state.
// This serializes code consumption, rotation and revocation across processes
// on both SQLite and PostgreSQL, without caching authorization decisions.
type oauthStore struct {
	db  *Database
	app *App
}
type oauthTx struct {
	store oauthStore
	tx    *sql.Tx
	ctx   context.Context
}
type oauthResourceKey struct{}
type oauthConsentRecord struct {
	oauthserver.OAuthConsent[int]
	Member oauthMemberBinding
}
type oauthCode struct {
	oauthserver.OAuthAuthorizationCodeIssue[int]
	Resource string
	Member   oauthMemberBinding
}
type oauthGrant struct {
	oauthserver.OAuthTokenMetadata[int]
	Resource string
	Member   oauthMemberBinding
}

func (s oauthStore) mutate(ctx context.Context, fn func(oauthTx) error) (int64, error) {
	tx, err := s.db.SQL.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	t := oauthTx{s, tx, ctx}
	var revision int64
	if err = t.row("UPDATE oauth_lock SET revision=revision+1 WHERE id=1 RETURNING revision").Scan(&revision); err != nil {
		return 0, err
	}
	err = fn(t)
	// Replay detection must commit its family revocation even though exchange fails.
	if err != nil && !errors.Is(err, oauthserver.ErrOAuthGrantReuseDetected) {
		return 0, err
	}
	if commitErr := tx.Commit(); commitErr != nil {
		return 0, commitErr
	}
	return revision, err
}
func (t oauthTx) row(q string, args ...any) *sql.Row {
	q, args = t.store.db.adapt(q, args)
	return t.tx.QueryRowContext(t.ctx, q, args...)
}
func (t oauthTx) exec(q string, args ...any) error {
	q, args = t.store.db.adapt(q, args)
	_, err := t.tx.ExecContext(t.ctx, q, args...)
	return err
}
func oauthDecode(raw string, target any) error { return json.Unmarshal([]byte(raw), target) }
func oauthRead[T any](rows []Row, err error) ([]T, error) {
	if err != nil {
		return nil, err
	}
	result := make([]T, 0, len(rows))
	for _, row := range rows {
		var value T
		if err := oauthDecode(row.str("data"), &value); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	return result, nil
}
func (s oauthStore) CreateOAuthClient(ctx context.Context, in oauthserver.OAuthClientRegistration[int]) (oauthserver.OAuthClientMutationResult, error) {
	client := oauthserver.OAuthClient{ID: guuid.New(), ClientID: in.ClientID, Name: in.Name, ClientType: in.ClientType, RedirectURIs: in.RedirectURIs, AllowedScopes: in.AllowedScopes, HasSecret: in.ClientSecretHash != "", CreatedAt: time.Now().UTC()}
	revision, err := s.mutate(ctx, func(t oauthTx) error {
		// Bound anonymous dynamic registration across restarts and IP addresses.
		var count int
		if err := t.row("SELECT COUNT(*) FROM oauth_clients").Scan(&count); err != nil {
			return err
		}
		if count >= 1000 {
			return oauthserver.ErrAccessDenied
		}
		return t.exec("INSERT INTO oauth_clients(id,public_id,secret_hash,data) VALUES($1,$2,$3,$4)", client.ID.String(), client.ClientID, in.ClientSecretHash, encode(client))
	})
	return oauthserver.OAuthClientMutationResult{Client: client, AuthorizationRevision: revision}, err
}
func (s oauthStore) ListOAuthClients(ctx context.Context) ([]oauthserver.OAuthClient, error) {
	return oauthRead[oauthserver.OAuthClient](s.db.Query(ctx, "SELECT data FROM oauth_clients ORDER BY public_id"))
}
func (s oauthStore) GetOAuthClientByPublicID(ctx context.Context, id string) (oauthserver.OAuthClient, string, error) {
	rows, err := s.db.Query(ctx, "SELECT data,secret_hash FROM oauth_clients WHERE public_id=$1", id)
	if err != nil {
		return oauthserver.OAuthClient{}, "", err
	}
	row := first(rows)
	if row == nil {
		return oauthserver.OAuthClient{}, "", oauthserver.ErrOAuthClientNotFound
	}
	var client oauthserver.OAuthClient
	err = oauthDecode(row.str("data"), &client)
	client.AllowedScopes = normalizedOAuthScopes(client.AllowedScopes)
	return client, row.str("secret_hash"), err
}
func (s oauthStore) RevokeOAuthClient(ctx context.Context, id guuid.UUID, _ oauthserver.MutationActor[int]) (int64, error) {
	return s.mutate(ctx, func(t oauthTx) error { return t.exec("DELETE FROM oauth_clients WHERE id=$1", id.String()) })
}
func (s oauthStore) GetOAuthUserConsent(ctx context.Context, id guuid.UUID, subject int) (oauthserver.OAuthConsent[int], bool, error) {
	if ctx.Value(oauthConsentScreenKey{}) != nil {
		return oauthserver.OAuthConsent[int]{}, false, nil
	}
	values, err := oauthRead[oauthserver.OAuthConsent[int]](s.db.Query(ctx, "SELECT data FROM oauth_consents WHERE client_id=$1 AND subject_id=$2", id.String(), subject))
	if err != nil || len(values) == 0 {
		return oauthserver.OAuthConsent[int]{}, false, err
	}
	return values[0], true, nil
}
func (s oauthStore) RecordOAuthConsentAndIssueCode(ctx context.Context, grant oauthserver.OAuthConsentGrant[int], code oauthserver.OAuthAuthorizationCodeIssue[int]) error {
	_, err := s.mutate(ctx, func(t oauthTx) error {
		if err := t.replaceScope(grant); err != nil {
			return err
		}
		member, _ := ctx.Value(oauthMemberBindingKey{}).(oauthMemberBinding)
		consent := oauthConsentRecord{OAuthConsent: oauthserver.OAuthConsent[int]{ClientID: grant.ClientID, SubjectID: grant.SubjectID, GrantedScope: grant.GrantedScope, GrantedAt: time.Now().UTC()}, Member: member}
		if err := t.exec("INSERT INTO oauth_consents(client_id,subject_id,legacy_admin_id,data) VALUES($1,$2,CASE WHEN $2=1 THEN 1 ELSE NULL END,$3) ON CONFLICT(client_id,subject_id) DO UPDATE SET data=EXCLUDED.data", grant.ClientID.String(), grant.SubjectID, encode(consent)); err != nil {
			return err
		}
		resource, _ := ctx.Value(oauthResourceKey{}).(string)
		return t.exec("INSERT INTO oauth_codes(code_hash,client_id,subject_id,expires_at,data) VALUES($1,$2,$3,$4,$5)", code.CodeHash, code.ClientID.String(), code.SubjectID, code.ExpiresAt.Unix(), encode(oauthCode{code, resource, member}))
	})
	return err
}
func (t oauthTx) activeSubject(id guuid.UUID, subject int) error {
	var found int
	err := t.row("SELECT subject_id FROM oauth_consents WHERE client_id=$1 AND subject_id=$2 AND (subject_id<>1 OR EXISTS(SELECT 1 FROM admins WHERE id=1))", id.String(), subject).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return oauthserver.ErrOAuthGrantDenied
	}
	return err
}
func oauthResourceMatches(ctx context.Context, resource string) bool {
	requested, _ := ctx.Value(oauthResourceKey{}).(string)
	return requested == "" || requested == resource
}
func (t oauthTx) issue(grant oauthGrant, issue oauthserver.OAuthTokenIssue) error {
	grant.ID = guuid.New()
	grant.AccessExpiresAt, grant.RefreshExpiresAt = issue.AccessExpiresAt, issue.RefreshExpiresAt
	return t.exec("INSERT INTO oauth_tokens(access_hash,refresh_hash,client_id,subject_id,family_id,expires_at,data) VALUES($1,$2,$3,$4,$5,$6,$7)", issue.AccessTokenHash, issue.RefreshTokenHash, grant.ClientID.String(), grant.SubjectID, grant.TokenFamilyID.String(), issue.RefreshExpiresAt.Unix(), encode(grant))
}
func (s oauthStore) ExchangeOAuthAuthorizationCode(ctx context.Context, in oauthserver.OAuthCodeExchange, now time.Time) (oauthserver.OAuthTokenMetadata[int], error) {
	var grant oauthGrant
	principal, err := s.validateCodeMember(ctx, in.CodeHash)
	if err != nil {
		return grant.OAuthTokenMetadata, err
	}
	revision, err := s.mutate(ctx, func(t oauthTx) error {
		code, err := t.authorizationCode(in, now)
		if err != nil {
			return err
		}
		if code.RedirectURI != in.RedirectURI || !validOAuthVerifier(in.CodeVerifier, code.CodeChallenge) || !oauthResourceMatches(ctx, code.Resource) {
			return oauthserver.ErrOAuthGrantDenied
		}
		if err = t.activeSubject(code.ClientID, code.SubjectID); err != nil {
			return err
		}
		if err = t.exec("DELETE FROM oauth_codes WHERE code_hash=$1", in.CodeHash); err != nil {
			return err
		}
		grant = oauthGrant{OAuthTokenMetadata: oauthserver.OAuthTokenMetadata[int]{ClientID: code.ClientID, SubjectID: code.SubjectID, Scope: effectiveOAuthScopes(code.Scope, principal), TokenFamilyID: guuid.New()}, Resource: code.Resource, Member: code.Member}
		if len(grant.Scope) == 0 {
			return oauthserver.ErrOAuthGrantDenied
		}
		return t.issue(grant, in.Issue)
	})
	grant.AuthorizationRevision = revision
	return grant.OAuthTokenMetadata, err
}
func (s oauthStore) RotateOAuthRefreshToken(ctx context.Context, in oauthserver.OAuthRefreshExchange, now time.Time) (oauthserver.OAuthTokenMetadata[int], error) {
	var grant oauthGrant
	principal, err := s.validateRefreshMember(ctx, in.RefreshTokenHash)
	if err != nil {
		return grant.OAuthTokenMetadata, err
	}
	revision, err := s.mutate(ctx, func(t oauthTx) error {
		var err error
		grant, err = t.refreshGrant(in, now)
		if err != nil {
			return err
		}
		if err = t.activeSubject(grant.ClientID, grant.SubjectID); err != nil {
			return err
		}
		if err = t.exec("UPDATE oauth_tokens SET rotated=1 WHERE refresh_hash=$1", in.RefreshTokenHash); err != nil {
			return err
		}
		grant.Scope = effectiveOAuthScopes(grant.Scope, principal)
		if len(grant.Scope) == 0 {
			return oauthserver.ErrOAuthGrantDenied
		}
		return t.issue(grant, in.Issue)
	})
	grant.AuthorizationRevision = revision
	return grant.OAuthTokenMetadata, err
}
func (s oauthStore) RevokeOAuthTokenByHash(ctx context.Context, id guuid.UUID, digest string) (bool, error) {
	found := false
	_, err := s.mutate(ctx, func(t oauthTx) error {
		var family string
		err := t.row("SELECT family_id FROM oauth_tokens WHERE client_id=$1 AND (access_hash=$2 OR refresh_hash=$2)", id.String(), digest).Scan(&family)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		found = true
		return t.exec("UPDATE oauth_tokens SET revoked=1 WHERE family_id=$1", family)
	})
	return found, err
}
func (s oauthStore) ListOAuthConnectedApps(ctx context.Context, subject int) ([]oauthserver.OAuthConnectedApp, error) {
	rows, err := s.db.Query(ctx, "SELECT c.data AS client,g.data FROM oauth_consents g JOIN oauth_clients c ON c.id=g.client_id WHERE g.subject_id=$1", subject)
	if err != nil {
		return nil, err
	}
	apps := []oauthserver.OAuthConnectedApp{}
	for _, row := range rows {
		var client oauthserver.OAuthClient
		var consent oauthserver.OAuthConsent[int]
		if err = oauthDecode(row.str("client"), &client); err != nil {
			return nil, err
		}
		if err = oauthDecode(row.str("data"), &consent); err != nil {
			return nil, err
		}
		apps = append(apps, oauthserver.OAuthConnectedApp{ClientID: client.ID, ClientName: client.Name, GrantedScope: consent.GrantedScope, GrantedAt: consent.GrantedAt})
	}
	return apps, nil
}
func (s oauthStore) RevokeOAuthConnectedApp(ctx context.Context, id guuid.UUID, subject int, _ oauthserver.MutationActor[int]) (int64, error) {
	return s.mutate(ctx, func(t oauthTx) error {
		if err := t.exec("DELETE FROM oauth_consents WHERE client_id=$1 AND subject_id=$2", id.String(), subject); err != nil {
			return err
		}
		if err := t.exec("DELETE FROM oauth_codes WHERE client_id=$1 AND subject_id=$2", id.String(), subject); err != nil {
			return err
		}
		return t.exec("UPDATE oauth_tokens SET revoked=1 WHERE client_id=$1 AND subject_id=$2", id.String(), subject)
	})
}
func (s oauthStore) ExpireOAuthArtifacts(ctx context.Context, now time.Time, limit int) (int, error) {
	_, err := s.mutate(ctx, func(t oauthTx) error {
		if err := t.exec("DELETE FROM oauth_codes WHERE code_hash IN (SELECT code_hash FROM oauth_codes WHERE expires_at<=$1 LIMIT $2)", now.Unix(), limit); err != nil {
			return err
		}
		return t.exec("DELETE FROM oauth_tokens WHERE access_hash IN (SELECT access_hash FROM oauth_tokens WHERE expires_at<=$1 LIMIT $2)", now.Unix(), limit)
	})
	return 0, err
}

// A newly approved role replaces the previous role and invalidates old grants.
func (t oauthTx) replaceScope(grant oauthserver.OAuthConsentGrant[int]) error {
	var raw string
	err := t.row("SELECT data FROM oauth_consents WHERE client_id=$1 AND subject_id=$2", grant.ClientID.String(), grant.SubjectID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var previous oauthserver.OAuthConsent[int]
	if err = oauthDecode(raw, &previous); err != nil {
		return err
	}
	if encode(previous.GrantedScope) == encode(grant.GrantedScope) {
		return nil
	}
	return t.exec("DELETE FROM oauth_consents WHERE client_id=$1 AND subject_id=$2", grant.ClientID.String(), grant.SubjectID)
}

func (t oauthTx) authorizationCode(in oauthserver.OAuthCodeExchange, now time.Time) (oauthCode, error) {
	var code oauthCode
	var raw string
	err := t.row("SELECT data FROM oauth_codes WHERE code_hash=$1 AND client_id=$2 AND expires_at>$3", in.CodeHash, in.ClientID.String(), now.Unix()).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return code, oauthserver.ErrOAuthGrantDenied
	}
	if err != nil {
		return code, err
	}
	err = oauthDecode(raw, &code)
	return code, err
}
func (t oauthTx) refreshGrant(in oauthserver.OAuthRefreshExchange, now time.Time) (oauthGrant, error) {
	var grant oauthGrant
	var raw string
	var rotated, revoked int
	err := t.row("SELECT data,rotated,revoked FROM oauth_tokens WHERE refresh_hash=$1 AND client_id=$2 AND expires_at>$3", in.RefreshTokenHash, in.ClientID.String(), now.Unix()).Scan(&raw, &rotated, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return grant, oauthserver.ErrOAuthGrantDenied
	}
	if err != nil {
		return grant, err
	}
	if err = oauthDecode(raw, &grant); err != nil {
		return grant, err
	}
	if rotated != 0 {
		if err = t.exec("UPDATE oauth_tokens SET revoked=1 WHERE family_id=$1", grant.TokenFamilyID.String()); err != nil {
			return grant, err
		}
		return grant, oauthserver.ErrOAuthGrantReuseDetected
	}
	if revoked != 0 || !oauthResourceMatches(t.ctx, grant.Resource) {
		return grant, oauthserver.ErrOAuthGrantDenied
	}
	return grant, nil
}
