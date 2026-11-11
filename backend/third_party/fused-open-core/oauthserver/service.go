// Package oauthserver implements OAuth2 authorization-code and PKCE flows for
// products that supply their own identities, scopes, and durable grant store.
package oauthserver

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

const (
	defaultAccessTokenTTL  = time.Hour
	defaultRefreshTokenTTL = 30 * 24 * time.Hour
	authorizationCodeTTL   = 60 * time.Second
)

var (
	ErrInvalidRequest         = errors.New("invalid OAuth request")
	ErrUnauthorizedClient     = errors.New("unauthorized OAuth client")
	ErrAccessDenied           = errors.New("OAuth scope exceeds the authorizing user's own permissions")
	ErrUnsupportedGrantType   = errors.New("unsupported OAuth grant type")
	ErrInvalidGrant           = errors.New("invalid OAuth grant")
	ErrInvalidScope           = errors.New("invalid OAuth scope")
	ErrAuthenticationRequired = errors.New("authentication required")
)

// Actor is supplied by the host Engine after authenticating a browser session.
// CanGrant must evaluate current product permissions and fail closed on errors.
type Actor[ID comparable] struct {
	SubjectID        ID
	CredentialID     ID
	IsBrowserSession bool
	RequestID        string
	TraceID          string
	CanGrant         func(context.Context, string) (bool, error)
}

// ScopeCatalog lets each product define valid OAuth scopes.
type ScopeCatalog interface{ ValidateScope(string) error }

type RevisionSink interface {
	SetRevision(int64) bool
}

// Prefixes separate credentials issued by different products.
type Prefixes struct {
	ClientID     string
	ClientSecret string
	AccessToken  string
	RefreshToken string
}

func (p Prefixes) valid() bool {
	values := []string{p.ClientID, p.ClientSecret, p.AccessToken, p.RefreshToken}
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		if len(value) < 2 || len(value) > 24 || value[len(value)-1] != '_' || seen[value] {
			return false
		}
		for i, ch := range value {
			if i == 0 && (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') {
				return false
			}
			if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') && ch != '_' {
				return false
			}
		}
		seen[value] = true
	}
	return true
}

type Service[ID comparable] struct {
	store      Store[ID]
	scopes     ScopeCatalog
	prefixes   Prefixes
	revisions  RevisionSink
	now        func() time.Time
	accessTTL  time.Duration
	refreshTTL time.Duration
	codeTTL    time.Duration
}

func NewService[ID comparable](repository Store[ID], revisions RevisionSink, scopes ScopeCatalog, prefixes Prefixes) (*Service[ID], error) {
	if repository == nil || revisions == nil || scopes == nil || !prefixes.valid() {
		return nil, errors.New("invalid OAuth provider configuration")
	}
	return &Service[ID]{
		store: repository, revisions: revisions, scopes: scopes, prefixes: prefixes, now: time.Now,
		accessTTL: defaultAccessTokenTTL, refreshTTL: defaultRefreshTokenTTL, codeTTL: authorizationCodeTTL,
	}, nil
}

// -- Admin client management (Owner/Admin only; enforced by the caller) --

type CreateClientInput struct {
	Name          string
	ClientType    OAuthClientType
	RedirectURIs  []string
	AllowedScopes []string
}

type CreateClientResult struct {
	Client       OAuthClient
	ClientSecret string
}

func (s *Service[ID]) CreateClient(ctx context.Context, actor Actor[ID], input CreateClientInput) (CreateClientResult, error) {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.client.create")
	defer span.End()
	span.SetAttributes(attribute.String("oauth.client_type", string(input.ClientType)))
	for _, scope := range input.AllowedScopes {
		if err := s.scopes.ValidateScope(scope); err != nil {
			return CreateClientResult{}, fmt.Errorf("%w: %q", ErrInvalidScope, scope)
		}
	}
	clientID, err := randomIdentifier(s.prefixes.ClientID, 16)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return CreateClientResult{}, err
	}
	registration := OAuthClientRegistration[ID]{
		Name: input.Name, ClientType: input.ClientType, ClientID: clientID,
		RedirectURIs: input.RedirectURIs, AllowedScopes: input.AllowedScopes,
		Actor: mutationActor(ctx, actor),
	}
	var rawSecret string
	if input.ClientType == OAuthClientConfidential {
		rawSecret, err = randomIdentifier(s.prefixes.ClientSecret, 32)
		if err != nil {
			span.SetAttributes(attribute.String("outcome", "failed"))
			return CreateClientResult{}, err
		}
		registration.ClientSecretHash = hashSecret(rawSecret)
	}
	result, err := s.store.CreateOAuthClient(ctx, registration)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return CreateClientResult{}, err
	}
	s.revisions.SetRevision(result.AuthorizationRevision)
	span.SetAttributes(attribute.String("outcome", "created"), attribute.String("oauth.client_id", result.Client.ClientID))
	return CreateClientResult{Client: result.Client, ClientSecret: rawSecret}, nil
}

func (s *Service[ID]) ListClients(ctx context.Context) ([]OAuthClient, error) {
	return s.store.ListOAuthClients(ctx)
}

func (s *Service[ID]) RevokeClient(ctx context.Context, actor Actor[ID], id uuid.UUID) error {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.client.revoke")
	defer span.End()
	revision, err := s.store.RevokeOAuthClient(ctx, id, mutationActor(ctx, actor))
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return err
	}
	s.revisions.SetRevision(revision)
	span.SetAttributes(attribute.String("outcome", "revoked"))
	return nil
}

// -- Authorization Code + PKCE flow (browser-session actor required) --

type AuthorizeRequest struct {
	ClientID            string
	RedirectURI         string
	ResponseType        string
	Scope               []string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
}

type AuthorizeResult struct {
	RequiresConsent bool
	RedirectURL     string
	Client          OAuthClient
	Scope           []string
}

func (s *Service[ID]) Authorize(ctx context.Context, actor Actor[ID], req AuthorizeRequest) (AuthorizeResult, error) {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.authorize")
	defer span.End()
	span.SetAttributes(attribute.String("actor.type", "user"))
	if !actor.IsBrowserSession {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return AuthorizeResult{}, ErrAuthenticationRequired
	}
	client, err := s.resolveAuthorizingClient(ctx, req)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return AuthorizeResult{}, err
	}
	scope, err := s.resolveGrantableScope(ctx, actor, client, req.Scope)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return AuthorizeResult{}, err
	}
	consent, found, err := s.store.GetOAuthUserConsent(ctx, client.ID, actor.SubjectID)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return AuthorizeResult{}, err
	}
	if !found || !scopeSubset(scope, consent.GrantedScope) {
		span.SetAttributes(attribute.String("outcome", "consent_required"))
		return AuthorizeResult{RequiresConsent: true, Client: client, Scope: scope}, nil
	}
	redirectURL, err := s.grantConsentAndIssueCode(ctx, actor, client, scope, req.RedirectURI, req.CodeChallenge, req.State)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return AuthorizeResult{}, err
	}
	span.SetAttributes(attribute.String("outcome", "consent_skipped"))
	return AuthorizeResult{RequiresConsent: false, RedirectURL: redirectURL, Client: client, Scope: scope}, nil
}

type ConsentRequest struct {
	ClientID            string
	RedirectURI         string
	Scope               []string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
}

// Consent is the CSRF-protected POST that runs after Authorize returns
// RequiresConsent: true. It re-validates the client/redirect_uri/PKCE shape
// from scratch rather than trusting anything about the prior Authorize call,
// since the consent screen round-trips through the end user's browser.
func (s *Service[ID]) Consent(ctx context.Context, actor Actor[ID], req ConsentRequest) (string, error) {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.consent")
	defer span.End()
	span.SetAttributes(attribute.String("actor.type", "user"))
	if !actor.IsBrowserSession {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return "", ErrAuthenticationRequired
	}
	client, err := s.resolveAuthorizingClient(ctx, AuthorizeRequest{
		ClientID: req.ClientID, RedirectURI: req.RedirectURI, ResponseType: "code",
		CodeChallenge: req.CodeChallenge, CodeChallengeMethod: req.CodeChallengeMethod,
	})
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return "", err
	}
	scope, err := s.resolveGrantableScope(ctx, actor, client, req.Scope)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return "", err
	}
	redirectURL, err := s.grantConsentAndIssueCode(ctx, actor, client, scope, req.RedirectURI, req.CodeChallenge, req.State)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return "", err
	}
	span.SetAttributes(attribute.String("outcome", "consented"))
	return redirectURL, nil
}

func (s *Service[ID]) grantConsentAndIssueCode(ctx context.Context, actor Actor[ID], client OAuthClient, scope []string, redirectURI, codeChallenge, state string) (string, error) {
	rawCode, err := randomToken(32)
	if err != nil {
		return "", err
	}
	now := s.now().UTC()
	err = s.store.RecordOAuthConsentAndIssueCode(ctx,
		OAuthConsentGrant[ID]{ClientID: client.ID, SubjectID: actor.SubjectID, GrantedScope: scope},
		OAuthAuthorizationCodeIssue[ID]{
			ID: uuid.New(), ClientID: client.ID, SubjectID: actor.SubjectID, RedirectURI: redirectURI,
			Scope: scope, CodeHash: hashSecret(rawCode), CodeChallenge: codeChallenge,
			ExpiresAt: now.Add(s.codeTTL),
		},
	)
	if err != nil {
		return "", err
	}
	return buildRedirectURL(redirectURI, rawCode, state)
}

func (s *Service[ID]) resolveAuthorizingClient(ctx context.Context, req AuthorizeRequest) (OAuthClient, error) {
	if req.ResponseType != "code" {
		return OAuthClient{}, fmt.Errorf("%w: response_type must be code", ErrInvalidRequest)
	}
	if req.CodeChallengeMethod != "S256" || len(req.CodeChallenge) < 43 || len(req.CodeChallenge) > 128 {
		return OAuthClient{}, fmt.Errorf("%w: PKCE S256 code_challenge is required", ErrInvalidRequest)
	}
	client, _, err := s.store.GetOAuthClientByPublicID(ctx, req.ClientID)
	if err != nil {
		return OAuthClient{}, ErrUnauthorizedClient
	}
	if !exactRedirectURIMatch(client.RedirectURIs, req.RedirectURI) {
		return OAuthClient{}, fmt.Errorf("%w: redirect_uri is not registered for this client", ErrInvalidRequest)
	}
	return client, nil
}

// resolveGrantableScope enforces the scope ceiling: every requested scope
// must be both registered for the client AND held by the authorizing user
// right now (checked against their live AuthorizationSnapshot, not a value
// cached at some earlier time). The same ceiling is re-verified on every
// subsequent API call via loadOAuthTokenPrincipal, so a permission the user
// later loses stops being usable through the token immediately -- this call
// only decides what a fresh consent may grant.
func (s *Service[ID]) resolveGrantableScope(ctx context.Context, actor Actor[ID], client OAuthClient, requested []string) ([]string, error) {
	scope := requested
	if len(scope) == 0 {
		scope = client.AllowedScopes
	}
	allowed := make(map[string]struct{}, len(client.AllowedScopes))
	for _, item := range client.AllowedScopes {
		allowed[item] = struct{}{}
	}
	granted := make([]string, 0, len(scope))
	for _, item := range scope {
		if err := s.scopes.ValidateScope(item); err != nil {
			return nil, fmt.Errorf("%w: %q", ErrInvalidScope, item)
		}
		if _, ok := allowed[item]; !ok {
			return nil, fmt.Errorf("%w: %q is not registered for this client", ErrInvalidScope, item)
		}
		if actor.CanGrant == nil {
			return nil, fmt.Errorf("%w: %q", ErrAccessDenied, item)
		}
		holds, err := actor.CanGrant(ctx, item)
		if err != nil || !holds {
			return nil, fmt.Errorf("%w: %q", ErrAccessDenied, item)
		}
		granted = append(granted, item)
	}
	if len(granted) == 0 {
		return nil, fmt.Errorf("%w: no grantable scope", ErrInvalidScope)
	}
	return granted, nil
}

func scopeSubset(requested, granted []string) bool {
	grantedSet := make(map[string]struct{}, len(granted))
	for _, item := range granted {
		grantedSet[item] = struct{}{}
	}
	for _, item := range requested {
		if _, ok := grantedSet[item]; !ok {
			return false
		}
	}
	return true
}

func exactRedirectURIMatch(registered []string, candidate string) bool {
	for _, uri := range registered {
		if uri == candidate {
			return true
		}
	}
	return false
}

func buildRedirectURL(redirectURI, code, state string) (string, error) {
	parsed, err := url.Parse(redirectURI)
	if err != nil {
		return "", fmt.Errorf("%w: invalid redirect_uri", ErrInvalidRequest)
	}
	query := parsed.Query()
	query.Set("code", code)
	if state != "" {
		query.Set("state", state)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

// -- Token endpoint: authorization_code and refresh_token grants --

type TokenRequest struct {
	GrantType    string
	Code         string
	RedirectURI  string
	CodeVerifier string
	RefreshToken string
	ClientID     string
	ClientSecret string
}

type TokenResponse struct {
	AccessToken  string
	RefreshToken string
	TokenType    string
	ExpiresIn    int64
	Scope        []string
}

func (s *Service[ID]) Token(ctx context.Context, req TokenRequest) (TokenResponse, error) {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.token")
	defer span.End()
	span.SetAttributes(attribute.String("oauth.grant_type", req.GrantType))
	client, err := s.authenticateClient(ctx, req.ClientID, req.ClientSecret)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return TokenResponse{}, err
	}
	var response TokenResponse
	switch req.GrantType {
	case "authorization_code":
		response, err = s.exchangeAuthorizationCode(ctx, client, req)
	case "refresh_token":
		response, err = s.exchangeRefreshToken(ctx, client, req)
	default:
		err = ErrUnsupportedGrantType
	}
	if err != nil {
		span.SetAttributes(attribute.String("outcome", tokenOutcome(err)))
		return TokenResponse{}, err
	}
	span.SetAttributes(attribute.String("outcome", "issued"))
	return response, nil
}

func (s *Service[ID]) exchangeAuthorizationCode(ctx context.Context, client OAuthClient, req TokenRequest) (TokenResponse, error) {
	if req.Code == "" || req.RedirectURI == "" || req.CodeVerifier == "" {
		return TokenResponse{}, ErrInvalidRequest
	}
	issue, rawAccess, rawRefresh, err := s.newTokenIssue()
	if err != nil {
		return TokenResponse{}, err
	}
	metadata, err := s.store.ExchangeOAuthAuthorizationCode(ctx, OAuthCodeExchange{
		CodeHash: hashSecret(req.Code), ClientID: client.ID, RedirectURI: req.RedirectURI,
		CodeVerifier: req.CodeVerifier, Issue: issue,
	}, s.now().UTC())
	if err != nil {
		return TokenResponse{}, translateGrantError(err)
	}
	s.revisions.SetRevision(metadata.AuthorizationRevision)
	return tokenResponse(metadata, rawAccess, rawRefresh, s.accessTTL), nil
}

func (s *Service[ID]) exchangeRefreshToken(ctx context.Context, client OAuthClient, req TokenRequest) (TokenResponse, error) {
	if req.RefreshToken == "" {
		return TokenResponse{}, ErrInvalidRequest
	}
	issue, rawAccess, rawRefresh, err := s.newTokenIssue()
	if err != nil {
		return TokenResponse{}, err
	}
	metadata, err := s.store.RotateOAuthRefreshToken(ctx, OAuthRefreshExchange{
		RefreshTokenHash: hashSecret(req.RefreshToken), ClientID: client.ID, Issue: issue,
	}, s.now().UTC())
	if err != nil {
		// A reuse-detected cascade revoke already bumped the DB revision inside
		// the store transaction; this process picks it up on its next poll tick
		// (see accesscontrol.PollAuthorizationRevisions) rather than synchronously
		// here, since the failed exchange has no fresh revision value to report.
		return TokenResponse{}, translateGrantError(err)
	}
	s.revisions.SetRevision(metadata.AuthorizationRevision)
	return tokenResponse(metadata, rawAccess, rawRefresh, s.accessTTL), nil
}

func tokenResponse[ID comparable](metadata OAuthTokenMetadata[ID], rawAccess, rawRefresh string, accessTTL time.Duration) TokenResponse {
	return TokenResponse{
		AccessToken: rawAccess, RefreshToken: rawRefresh, TokenType: "Bearer",
		ExpiresIn: int64(accessTTL.Seconds()), Scope: metadata.Scope,
	}
}

func (s *Service[ID]) newTokenIssue() (OAuthTokenIssue, string, string, error) {
	rawAccess, err := randomIdentifier(s.prefixes.AccessToken, 32)
	if err != nil {
		return OAuthTokenIssue{}, "", "", err
	}
	rawRefresh, err := randomIdentifier(s.prefixes.RefreshToken, 32)
	if err != nil {
		return OAuthTokenIssue{}, "", "", err
	}
	now := s.now().UTC()
	issue := OAuthTokenIssue{
		AccessTokenHash: hashSecret(rawAccess), RefreshTokenHash: hashSecret(rawRefresh),
		AccessExpiresAt: now.Add(s.accessTTL), RefreshExpiresAt: now.Add(s.refreshTTL),
	}
	return issue, rawAccess, rawRefresh, nil
}

func (s *Service[ID]) authenticateClient(ctx context.Context, clientID, clientSecret string) (OAuthClient, error) {
	client, secretHash, err := s.store.GetOAuthClientByPublicID(ctx, clientID)
	if err != nil {
		return OAuthClient{}, ErrUnauthorizedClient
	}
	if client.ClientType == OAuthClientConfidential {
		if clientSecret == "" || secretHash == "" ||
			subtle.ConstantTimeCompare([]byte(hashSecret(clientSecret)), []byte(secretHash)) != 1 {
			return OAuthClient{}, ErrUnauthorizedClient
		}
	}
	return client, nil
}

func translateGrantError(err error) error {
	if errors.Is(err, ErrOAuthGrantDenied) || errors.Is(err, ErrOAuthGrantReuseDetected) {
		return ErrInvalidGrant
	}
	return err
}

func tokenOutcome(err error) string {
	if errors.Is(err, ErrInvalidGrant) || errors.Is(err, ErrInvalidRequest) || errors.Is(err, ErrUnsupportedGrantType) {
		return "denied"
	}
	return "failed"
}

// -- RFC 7009 client-initiated revocation --

type RevokeRequest struct {
	Token        string
	ClientID     string
	ClientSecret string
}

func (s *Service[ID]) Revoke(ctx context.Context, req RevokeRequest) error {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.revoke")
	defer span.End()
	if req.Token == "" {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return ErrInvalidRequest
	}
	client, err := s.authenticateClient(ctx, req.ClientID, req.ClientSecret)
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return err
	}
	revoked, err := s.store.RevokeOAuthTokenByHash(ctx, client.ID, hashSecret(req.Token))
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return err
	}
	span.SetAttributes(attribute.Bool("oauth.token_found", revoked), attribute.String("outcome", "processed"))
	return nil
}

// -- End-user self-service: "Connected apps" --

func (s *Service[ID]) ListConnectedApps(ctx context.Context, actor Actor[ID]) ([]OAuthConnectedApp, error) {
	if !actor.IsBrowserSession {
		return nil, ErrAuthenticationRequired
	}
	return s.store.ListOAuthConnectedApps(ctx, actor.SubjectID)
}

func (s *Service[ID]) RevokeConnectedApp(ctx context.Context, actor Actor[ID], clientID uuid.UUID) error {
	ctx, span := otel.Tracer("engine").Start(ctx, "engine.identity.oauth.connected_app.revoke")
	defer span.End()
	if !actor.IsBrowserSession {
		span.SetAttributes(attribute.String("outcome", "denied"))
		return ErrAuthenticationRequired
	}
	revision, err := s.store.RevokeOAuthConnectedApp(ctx, clientID, actor.SubjectID, mutationActor(ctx, actor))
	if err != nil {
		span.SetAttributes(attribute.String("outcome", "failed"))
		return err
	}
	s.revisions.SetRevision(revision)
	span.SetAttributes(attribute.String("outcome", "revoked"))
	return nil
}

// -- Background cleanup --

func (s *Service[ID]) StartCleanupWorker(ctx context.Context, interval time.Duration) {
	if interval < 10*time.Second || interval > time.Hour {
		interval = time.Minute
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, _ = s.store.ExpireOAuthArtifacts(ctx, s.now().UTC(), 500)
			}
		}
	}()
}

// -- shared crypto/actor helpers --

func mutationActor[ID comparable](_ context.Context, actor Actor[ID]) MutationActor[ID] {
	return MutationActor[ID]{SubjectID: actor.SubjectID, CredentialID: actor.CredentialID, RequestID: actor.RequestID, TraceID: actor.TraceID}
}

func randomToken(byteLength int) (string, error) {
	buf := make([]byte, byteLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func randomIdentifier(prefix string, byteLength int) (string, error) {
	token, err := randomToken(byteLength)
	if err != nil {
		return "", err
	}
	return prefix + token, nil
}

func hashSecret(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}
