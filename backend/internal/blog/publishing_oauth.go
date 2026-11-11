package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

var publishingEndpoints = map[string]oauth2.Endpoint{
	"google":   {AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams},
	"linkedin": {AuthURL: "https://www.linkedin.com/oauth/v2/authorization", TokenURL: "https://www.linkedin.com/oauth/v2/accessToken", AuthStyle: oauth2.AuthStyleInParams},
}
var publishingScopes = map[string][]string{
	"google":   {"https://www.googleapis.com/auth/webmasters"},
	"linkedin": {"openid", "profile", "w_member_social"},
}

func (a *App) publishingRoutes() {
	a.mux.HandleFunc("GET /api/settings/publishing/{provider}", a.publishingStatus)
	a.mux.HandleFunc("POST /api/settings/publishing/{provider}/connect", a.startPublishingAuth)
	a.mux.HandleFunc("GET /publishing/callback/{provider}", a.finishPublishingAuth)
	a.mux.HandleFunc("POST /api/settings/publishing/{provider}/disconnect", a.disconnectPublishing)
	a.mux.HandleFunc("GET /api/settings/publishing/google/properties", a.listGoogleProperties)
	a.mux.HandleFunc("POST /api/settings/publishing/google/submit", a.submitGoogleSitemap)
	a.mux.HandleFunc("POST /api/settings/publishing/google/sitemap-status", a.googleSitemapStatus)
	a.mux.HandleFunc("POST /api/settings/publishing/google/performance", a.measureGoogleArticle)
	a.mux.HandleFunc("GET /api/settings/publishing/google/history", a.googleArticleHistory)
	a.mux.HandleFunc("POST /api/settings/publishing/google/inspect", a.inspectGoogleArticle)
	a.mux.HandleFunc("POST /api/settings/publishing/linkedin/preview", a.previewLinkedIn)
	a.mux.HandleFunc("POST /api/settings/publishing/linkedin/publish", a.publishLinkedIn)
}

func (a *App) publishingConfig(ctx context.Context, provider string) oauth2.Config {
	endpoint, ok := publishingEndpoints[provider]
	if !ok {
		fail(404, "Unknown publishing provider.")
	}
	prefix := "MARGIN_" + strings.ToUpper(provider) + "_PUBLISHING_"
	return oauth2.Config{ClientID: os.Getenv(prefix + "CLIENT_ID"), ClientSecret: os.Getenv(prefix + "CLIENT_SECRET"), RedirectURL: a.searchOrigin(ctx) + "/publishing/callback/" + provider, Endpoint: endpoint, Scopes: publishingScopes[provider]}
}
func (a *App) publishingConnection(ctx context.Context, provider string) Row {
	return first(a.DB.Must(ctx, "SELECT * FROM publishing_connections WHERE provider=$1", provider))
}
func (a *App) publishingStatus(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	ctx := r.Context()
	cfg := a.publishingConfig(ctx, provider)
	row := a.publishingConnection(ctx, provider)
	res := Row{"available": cfg.ClientID != "" && cfg.ClientSecret != "" && strings.HasPrefix(cfg.RedirectURL, "https://"), "connected": row != nil, "name": row.str("display_name"), "properties": []string{}}

	send(w, 200, res)
}
func (a *App) startPublishingAuth(w http.ResponseWriter, r *http.Request) {
	a.requireOAuthOwner(r)
	provider := r.PathValue("provider")
	ctx := r.Context()
	cfg := a.publishingConfig(ctx, provider)
	if cfg.ClientID == "" || cfg.ClientSecret == "" || a.searchOrigin(ctx) == "" {
		fail(503, "Configure the provider OAuth app and the publication HTTPS URL first.")
	}
	accountEncryption()
	cookie, _ := r.Cookie(sessionCookieName("margin_session"))
	state := newsletterToken()
	a.DB.Must(ctx, "DELETE FROM publishing_auth_flows WHERE expires_at<NOW() OR (session_hash=$1 AND provider=$2)", hash(cookie.Value), provider)
	a.DB.Must(ctx, "INSERT INTO publishing_auth_flows(state_hash,provider,session_hash,expires_at) VALUES($1,$2,$3,$4)", hash(state), provider, hash(cookie.Value), commentAuthExpiry(10*time.Minute))
	commentFlowCookie(w, "margin_publish_"+provider, state, 600)
	var options []oauth2.AuthCodeOption
	if provider == "google" {
		options = []oauth2.AuthCodeOption{oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent")}
	}
	send(w, 200, Row{"url": cfg.AuthCodeURL(state, options...)})
}
func (a *App) finishPublishingAuth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	provider := r.PathValue("provider")
	ctx := r.Context()
	cfg := a.publishingConfig(ctx, provider)
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie(sessionCookieName("margin_publish_" + provider))
	if err != nil || cookie.Value != state || !newsletterTokenRE.MatchString(state) {
		fail(400, "Restart the connection in the browser where you signed in.")
	}
	// The owner cookie is SameSite=Strict. Check that its originating session is still active.
	row := first(a.DB.Must(ctx, "DELETE FROM publishing_auth_flows WHERE state_hash=$1 AND provider=$2 AND expires_at>NOW() AND session_hash IN (SELECT token_hash FROM sessions WHERE expires_at>NOW()) RETURNING provider", hash(state), provider))
	if row == nil {
		fail(400, "This connection expired or was already completed.")
	}
	commentFlowCookie(w, "margin_publish_"+provider, "", -1)
	target := sitePath("/admin/settings?tab=integrations")
	if provider == "google" {
		target = sitePath("/admin/settings?tab=seo&provider=google")
	}
	if r.URL.Query().Get("error") == "" {
		a.exchangePublishingCode(ctx, provider, cfg, r.URL.Query().Get("code"))
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}
func (a *App) publishingClient() *http.Client {
	client := *a.Client
	client.Timeout = 15 * time.Second
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &client
}
func (a *App) exchangePublishingCode(ctx context.Context, provider string, cfg oauth2.Config, code string) {
	if code == "" {
		fail(400, "Missing provider authorization code.")
	}
	grant, err := cfg.Exchange(context.WithValue(ctx, oauth2.HTTPClient, a.publishingClient()), code)
	if err != nil {
		fail(502, "The provider could not complete authorization. Reconnect and try again.")
	}
	identity := Row{}
	if provider == "linkedin" {
		a.publishingRequest(ctx, grant.AccessToken, "GET", "https://api.linkedin.com/v2/userinfo", nil, &identity)
		if identity.str("sub") == "" || identity.str("name") == "" {
			fail(502, "LinkedIn did not return the profile identity.")
		}
	}
	a.DB.Must(ctx, `INSERT INTO publishing_connections(provider,connection_id,encrypted_token,subject,display_name) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(provider) DO UPDATE SET connection_id=EXCLUDED.connection_id,encrypted_token=EXCLUDED.encrypted_token,subject=EXCLUDED.subject,display_name=EXCLUDED.display_name`, provider, uuid(), sealPublishingToken(provider, grant), identity.str("sub"), identity.str("name"))
}
func sealPublishingToken(provider string, grant *oauth2.Token) string {
	data, err := json.Marshal(grant)
	must(err)
	sealed, err := accountEncryption().Encrypt(data, "settings", "publishing:"+provider)
	must(err)
	return base64.StdEncoding.EncodeToString(sealed)
}
func (a *App) publishingToken(ctx context.Context, row Row) string {
	if row == nil {
		fail(409, "Connect the provider account in Settings first.")
	}
	provider := row.str("provider")
	data, err := base64.StdEncoding.DecodeString(row.str("encrypted_token"))
	must(err)
	plain, err := accountEncryption().Decrypt(data, "settings", "publishing:"+provider)
	must(err)
	var grant oauth2.Token
	must(json.Unmarshal(plain, &grant))
	if grant.Valid() {
		return grant.AccessToken
	}
	cfg := a.publishingConfig(ctx, provider)
	fresh, err := cfg.TokenSource(context.WithValue(ctx, oauth2.HTTPClient, a.publishingClient()), &grant).Token()
	if err != nil {
		fail(409, "The provider connection expired. Disconnect and reconnect the account.")
	}
	saved := a.DB.Must(ctx, "UPDATE publishing_connections SET encrypted_token=$1 WHERE connection_id=$2 AND encrypted_token=$3 RETURNING provider", sealPublishingToken(provider, fresh), row["connection_id"], row["encrypted_token"])
	if len(saved) == 0 {
		fail(409, "The account connection changed. Reload before continuing.")
	}
	return fresh.AccessToken
}
func (a *App) disconnectPublishing(w http.ResponseWriter, r *http.Request) {
	a.requireOAuthOwner(r)
	provider := r.PathValue("provider")
	a.publishingConfig(r.Context(), provider)
	a.DB.Must(r.Context(), "DELETE FROM publishing_auth_flows WHERE provider=$1", provider)
	a.DB.Must(r.Context(), "DELETE FROM publishing_connections WHERE provider=$1", provider)
	send(w, 200, Row{"connected": false})
}
