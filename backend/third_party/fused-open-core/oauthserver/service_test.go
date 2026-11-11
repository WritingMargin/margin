package oauthserver

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

type testScopes map[string]bool

func (s testScopes) ValidateScope(scope string) error {
	if !s[scope] {
		return errors.New("unknown scope")
	}
	return nil
}

type testRevisions struct{}

func (testRevisions) SetRevision(int64) bool { return true }

type stringStore struct {
	Store[string]
	client   OAuthClient
	consent  OAuthConsent[string]
	found    bool
	recorded OAuthConsentGrant[string]
	code     OAuthAuthorizationCodeIssue[string]
	created  OAuthClientRegistration[string]
}

func (s *stringStore) CreateOAuthClient(_ context.Context, input OAuthClientRegistration[string]) (OAuthClientMutationResult, error) {
	s.created = input
	return OAuthClientMutationResult{Client: OAuthClient{ID: uuid.New(), ClientID: input.ClientID}, AuthorizationRevision: 2}, nil
}
func (s *stringStore) GetOAuthClientByPublicID(_ context.Context, _ string) (OAuthClient, string, error) {
	return s.client, "", nil
}
func (s *stringStore) GetOAuthUserConsent(_ context.Context, _ uuid.UUID, _ string) (OAuthConsent[string], bool, error) {
	return s.consent, s.found, nil
}
func (s *stringStore) RecordOAuthConsentAndIssueCode(_ context.Context, consent OAuthConsentGrant[string], code OAuthAuthorizationCodeIssue[string]) error {
	s.recorded, s.code = consent, code
	return nil
}

func TestStringIdentityUsesProductScopePolicy(t *testing.T) {
	repository := &stringStore{client: OAuthClient{ID: uuid.New(), ClientID: "client", RedirectURIs: []string{"https://example.test/callback"}, AllowedScopes: []string{"thread.read"}}}
	service, err := NewService[string](repository, testRevisions{}, testScopes{"thread.read": true}, Prefixes{ClientID: "toc_", ClientSecret: "tos_", AccessToken: "toat_", RefreshToken: "tort_"})
	if err != nil {
		t.Fatal(err)
	}
	request := AuthorizeRequest{ClientID: "client", RedirectURI: "https://example.test/callback", ResponseType: "code", Scope: []string{"thread.read"}, CodeChallenge: strings.Repeat("a", 43), CodeChallengeMethod: "S256"}
	actor := Actor[string]{SubjectID: "threadify-user-1", CredentialID: "session-1", IsBrowserSession: true, CanGrant: func(context.Context, string) (bool, error) { return false, nil }}
	if _, err := service.Authorize(t.Context(), actor, request); !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("denied permission: %v", err)
	}
	actor.CanGrant = func(_ context.Context, scope string) (bool, error) { return scope == "thread.read", nil }
	result, err := service.Authorize(t.Context(), actor, request)
	if err != nil || !result.RequiresConsent {
		t.Fatalf("authorize = %+v, %v", result, err)
	}
	redirect, err := service.Consent(t.Context(), actor, ConsentRequest{ClientID: "client", RedirectURI: request.RedirectURI, Scope: request.Scope, CodeChallenge: request.CodeChallenge, CodeChallengeMethod: "S256"})
	if err != nil || !strings.HasPrefix(redirect, request.RedirectURI+"?code=") {
		t.Fatalf("consent redirect = %q, %v", redirect, err)
	}
	if repository.recorded.SubjectID != "threadify-user-1" || repository.code.SubjectID != "threadify-user-1" {
		t.Fatalf("string subject was not preserved: %+v %+v", repository.recorded, repository.code)
	}
	if repository.code.ExpiresAt.Before(time.Now()) {
		t.Fatal("code already expired")
	}
}

func TestScopePolicyFailsClosed(t *testing.T) {
	repository := &stringStore{client: OAuthClient{ID: uuid.New(), ClientID: "client", RedirectURIs: []string{"https://example.test/callback"}, AllowedScopes: []string{"thread.read"}}}
	service, _ := NewService[string](repository, testRevisions{}, testScopes{"thread.read": true}, Prefixes{ClientID: "toc_", ClientSecret: "tos_", AccessToken: "toat_", RefreshToken: "tort_"})
	req := AuthorizeRequest{ClientID: "client", RedirectURI: "https://example.test/callback", ResponseType: "code", Scope: []string{"thread.read"}, CodeChallenge: strings.Repeat("a", 43), CodeChallengeMethod: "S256"}
	actor := Actor[string]{SubjectID: "user", IsBrowserSession: true}
	if _, err := service.Authorize(t.Context(), actor, req); !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("nil permission adapter: %v", err)
	}
	actor.CanGrant = func(context.Context, string) (bool, error) { return true, errors.New("role store unavailable") }
	if _, err := service.Authorize(t.Context(), actor, req); !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("role lookup failure: %v", err)
	}
	req.Scope = []string{"unknown.scope"}
	if _, err := service.Authorize(t.Context(), actor, req); !errors.Is(err, ErrInvalidScope) {
		t.Fatalf("unknown scope: %v", err)
	}
}

func TestCredentialPrefixesAreConfiguredPerProduct(t *testing.T) {
	repository := &stringStore{}
	if _, err := NewService[string](repository, testRevisions{}, testScopes{}, Prefixes{}); err == nil {
		t.Fatal("empty prefixes accepted")
	}
	if _, err := NewService[string](repository, testRevisions{}, testScopes{}, Prefixes{ClientID: "same_", ClientSecret: "same_", AccessToken: "access_", RefreshToken: "refresh_"}); err == nil {
		t.Fatal("duplicate prefixes accepted")
	}
	prefixes := Prefixes{ClientID: "toc_", ClientSecret: "tos_", AccessToken: "toat_", RefreshToken: "tort_"}
	service, err := NewService[string](repository, testRevisions{}, testScopes{"thread.read": true}, prefixes)
	if err != nil {
		t.Fatal(err)
	}
	result, err := service.CreateClient(t.Context(), Actor[string]{SubjectID: "user", CredentialID: "session"}, CreateClientInput{Name: "Test app", ClientType: OAuthClientConfidential, RedirectURIs: []string{"https://example.test/callback"}, AllowedScopes: []string{"thread.read"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(result.Client.ClientID, "toc_") || !strings.HasPrefix(result.ClientSecret, "tos_") || repository.created.Actor.SubjectID != "user" {
		t.Fatalf("product prefixes or identity lost: %+v", result.Client)
	}
}
