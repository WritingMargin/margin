package oauthserver

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"time"
)

type OAuthClientType string

const (
	OAuthClientConfidential OAuthClientType = "confidential"
	OAuthClientPublic       OAuthClientType = "public"
)

var (
	ErrInvalidOAuthClient      = errors.New("invalid OAuth client")
	ErrOAuthClientNotFound     = errors.New("OAuth client not found")
	ErrOAuthGrantDenied        = errors.New("OAuth grant denied")
	ErrOAuthGrantReuseDetected = errors.New("OAuth refresh token reuse detected")
	ErrOAuthConsentNotFound    = errors.New("OAuth consent not found")
)

// OAuthClient is the sanitized, secret-free projection of a registered
// third-party client returned to admin UI/API callers.
type OAuthClient struct {
	ID            uuid.UUID
	ClientID      string
	Name          string
	ClientType    OAuthClientType
	RedirectURIs  []string
	AllowedScopes []string
	HasSecret     bool
	CreatedAt     time.Time
	RevokedAt     *time.Time
}

// OAuthClientRegistration carries store-ready crypto material: the caller
// (Service) generates the public client_id and, for confidential
// clients, hashes a freshly minted secret before this ever reaches the store
// -- the store never sees or returns a raw secret, matching every other
// credential in Engine.
type MutationActor[ID comparable] struct {
	SubjectID    ID
	CredentialID ID
	RequestID    string
	TraceID      string
}

type OAuthClientRegistration[ID comparable] struct {
	Name             string
	ClientType       OAuthClientType
	ClientID         string
	ClientSecretHash string
	RedirectURIs     []string
	AllowedScopes    []string
	Actor            MutationActor[ID]
}

type OAuthConsent[ID comparable] struct {
	ClientID     uuid.UUID
	SubjectID    ID
	GrantedScope []string
	GrantedAt    time.Time
}

type OAuthConsentGrant[ID comparable] struct {
	ClientID     uuid.UUID
	SubjectID    ID
	GrantedScope []string
}

type OAuthAuthorizationCodeIssue[ID comparable] struct {
	ID            uuid.UUID
	ClientID      uuid.UUID
	SubjectID     ID
	RedirectURI   string
	Scope         []string
	CodeHash      string
	CodeChallenge string
	ExpiresAt     time.Time
}

// OAuthCodeExchange is the inbound authorization_code grant request. CodeHash
// identifies the code; ClientID/RedirectURI/CodeVerifier are all re-checked
// against the values recorded at Consent time before any token is minted.
type OAuthCodeExchange struct {
	CodeHash     string
	ClientID     uuid.UUID
	RedirectURI  string
	CodeVerifier string
	Issue        OAuthTokenIssue
}

// OAuthTokenIssue carries only the freshly generated credential material for
// one token pair; the store assigns its row id and, for a brand-new grant, a
// new token_family_id -- rotation instead inherits the family id of the
// refresh token being consumed, which only the store has locked and can see.
type OAuthTokenIssue struct {
	AccessTokenHash  string
	RefreshTokenHash string
	AccessExpiresAt  time.Time
	RefreshExpiresAt time.Time
}

type OAuthTokenMetadata[ID comparable] struct {
	ID                    uuid.UUID
	ClientID              uuid.UUID
	SubjectID             ID
	TokenFamilyID         uuid.UUID
	Scope                 []string
	AccessExpiresAt       time.Time
	RefreshExpiresAt      time.Time
	AuthorizationRevision int64
}

type OAuthClientMutationResult struct {
	Client                OAuthClient
	AuthorizationRevision int64
}

// OAuthRefreshExchange is the inbound refresh_token grant request.
type OAuthRefreshExchange struct {
	RefreshTokenHash string
	ClientID         uuid.UUID
	Issue            OAuthTokenIssue
}

type OAuthConnectedApp struct {
	ClientID     uuid.UUID
	ClientName   string
	GrantedScope []string
	GrantedAt    time.Time
}

type Store[ID comparable] interface {
	CreateOAuthClient(context.Context, OAuthClientRegistration[ID]) (OAuthClientMutationResult, error)
	ListOAuthClients(context.Context) ([]OAuthClient, error)
	RevokeOAuthClient(context.Context, uuid.UUID, MutationActor[ID]) (int64, error)

	GetOAuthClientByPublicID(context.Context, string) (OAuthClient, string, error)
	GetOAuthUserConsent(context.Context, uuid.UUID, ID) (OAuthConsent[ID], bool, error)
	RecordOAuthConsentAndIssueCode(context.Context, OAuthConsentGrant[ID], OAuthAuthorizationCodeIssue[ID]) error

	ExchangeOAuthAuthorizationCode(context.Context, OAuthCodeExchange, time.Time) (OAuthTokenMetadata[ID], error)
	RotateOAuthRefreshToken(context.Context, OAuthRefreshExchange, time.Time) (OAuthTokenMetadata[ID], error)
	// RevokeOAuthTokenByHash implements RFC 7009 client-initiated revocation:
	// tokenHash may be either an access or refresh token hash. Per RFC 7009 the
	// endpoint returns success whether or not a matching token was found, but
	// the boolean return tells the caller whether anything was actually revoked
	// (for audit/logging), and it never revokes a token issued to a different
	// client than the one presenting it.
	RevokeOAuthTokenByHash(ctx context.Context, clientID uuid.UUID, tokenHash string) (bool, error)

	ListOAuthConnectedApps(context.Context, ID) ([]OAuthConnectedApp, error)
	RevokeOAuthConnectedApp(context.Context, uuid.UUID, ID, MutationActor[ID]) (int64, error)

	ExpireOAuthArtifacts(context.Context, time.Time, int) (int, error)
}
