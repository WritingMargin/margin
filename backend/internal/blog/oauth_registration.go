package blog

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Usefused/fused-open-core/oauthserver"
)

func oauthRedirects(input Row) ([]string, error) {
	values, ok := input["redirect_uris"].([]any)
	if !ok || len(values) == 0 || len(values) > 10 {
		return nil, oauthserver.ErrInvalidRequest
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		raw, ok := value.(string)
		if !ok || len(raw) > 2048 {
			return nil, oauthserver.ErrInvalidRequest
		}
		u, err := url.Parse(raw)
		if err != nil || !validOAuthRedirect(u, raw) {
			return nil, oauthserver.ErrInvalidRequest
		}
		result = append(result, raw)
	}
	return result, nil
}
func oauthRegistrationMethods(input Row) (string, oauthserver.OAuthClientType, error) {
	method := input.str("token_endpoint_auth_method")
	if _, exists := input["token_endpoint_auth_method"]; !exists {
		method = "none"
	}
	switch method {
	case "none":
		return method, oauthserver.OAuthClientPublic, nil
	case "client_secret_post", "client_secret_basic":
		return method, oauthserver.OAuthClientConfidential, nil
	default:
		return "", "", oauthserver.ErrInvalidRequest
	}
}
func oauthRegistrationGrantTypes(input Row) bool {
	for field, allowed := range map[string]map[string]bool{"grant_types": {"authorization_code": true, "refresh_token": true}, "response_types": {"code": true}} {
		value, exists := input[field]
		if !exists {
			continue
		}
		values, ok := value.([]any)
		if !ok || len(values) == 0 {
			return false
		}
		for _, item := range values {
			text, ok := item.(string)
			if !ok || !allowed[text] {
				return false
			}
		}
	}
	return true
}
func (a *App) oauthRegister(w http.ResponseWriter, r *http.Request) {
	oauthHeaders(w)
	requireOAuthIssuer()
	a.limit(r, "oauth-register", 10, time.Hour, false)
	input := body(w, r)
	name := strings.TrimSpace(input.str("client_name"))
	if name == "" || len(name) > 120 || !oauthRegistrationGrantTypes(input) {
		oauthError(w, oauthserver.ErrInvalidRequest)
		return
	}
	redirects, err := oauthRedirects(input)
	if err != nil {
		oauthError(w, err)
		return
	}
	scopes, err := oauthScope(input.str("scope"))
	if err != nil {
		oauthError(w, err)
		return
	}
	method, clientType, err := oauthRegistrationMethods(input)
	if err != nil {
		oauthError(w, err)
		return
	}
	_, err = (oauthStore{a.DB}).ExpireOAuthArtifacts(r.Context(), time.Now(), 500)
	must(err)
	result, err := a.oauthService().CreateClient(r.Context(), oauthserver.Actor[int]{}, oauthserver.CreateClientInput{Name: name, ClientType: clientType, RedirectURIs: redirects, AllowedScopes: scopes})
	if err != nil {
		oauthError(w, err)
		return
	}
	response := Row{"client_id": result.Client.ClientID, "client_name": result.Client.Name, "redirect_uris": redirects, "scope": strings.Join(scopes, " "), "token_endpoint_auth_method": method, "grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"}, "client_id_issued_at": result.Client.CreatedAt.Unix()}
	if result.ClientSecret != "" {
		response["client_secret"] = result.ClientSecret
		response["client_secret_expires_at"] = 0
	}
	send(w, 201, response)
}

func validOAuthRedirect(u *url.URL, raw string) bool {
	return validOAuthURL(u) && u.Fragment == "" && !strings.Contains(raw, "*")
}
