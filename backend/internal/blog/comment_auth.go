package blog

import (
	"context"
	"net/http"
	"strings"
	"time"
)

func (a *App) commentAuthRoutes() {
	a.mux.HandleFunc("GET /api/public/comment-auth", a.commentAuthStatus)
	a.mux.HandleFunc("POST /api/public/comment-auth/start", a.startCommentSocialLogin)
	a.mux.HandleFunc("GET /reader/auth/callback", a.commentSocialCallback)
	a.mux.HandleFunc("POST /api/public/comment-auth/email", a.commentEmailLogin)
	a.mux.HandleFunc("POST /api/public/comment-auth/confirm", a.confirmCommentLogin)
	a.mux.HandleFunc("POST /api/public/comment-auth/logout", a.commentReaderLogout)
	a.mux.HandleFunc("GET /reader/sign-in", a.publicPageHandler(a.commentSignInPage))
}
func commentAuthExpiry(duration time.Duration) string {
	return time.Now().Add(duration).UTC().Format("2006-01-02T15:04:05.000Z")
}
func (a *App) commentReader(r *http.Request) Row {
	cookie, err := r.Cookie(sessionCookieName("margin_comment_reader"))
	if err == nil {
		row := first(a.DB.Must(r.Context(), "SELECT u.* FROM comment_reader_sessions s JOIN comment_readers u ON u.id=s.reader_id WHERE s.token_hash=$1 AND s.expires_at>NOW()", hash(cookie.Value)))
		if row != nil {
			return a.commentReaderProfile(r.Context(), row)
		}
	}
	// An existing confirmed subscriber session already proves control of this email.
	if email := a.readerEmail(r); email != "" {
		return a.commentReaderProfile(r.Context(), a.commentIdentity(r.Context(), "email:"+email, "email", email, ""))
	}
	return nil
}
func (a *App) requireCommentReader(r *http.Request) Row {
	identity := a.commentReader(r)
	if identity == nil {
		coded(401, "Sign in to continue.", "COMMENT_SIGN_IN_REQUIRED")
	}
	if !readMethod(r.Method) && r.Header.Get("Origin") == "" {
		fail(403, "An Origin header is required for reader changes.")
	}
	return identity
}
func (a *App) commentIdentity(ctx context.Context, identity, provider, email, name string) Row {
	return first(a.DB.Must(ctx, "INSERT INTO comment_readers(id,identity,provider,email,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(identity) DO UPDATE SET email=EXCLUDED.email RETURNING *", uuid(), identity, provider, email, name))
}
func (a *App) startCommentSession(w http.ResponseWriter, r *http.Request, reader Row) {
	token := newsletterToken()
	a.DB.Must(r.Context(), "DELETE FROM comment_reader_sessions WHERE expires_at<NOW()")
	a.DB.Must(r.Context(), "INSERT INTO comment_reader_sessions(token_hash,reader_id,expires_at) VALUES($1,$2,$3)", hash(token), reader["id"], commentAuthExpiry(30*24*time.Hour))
	setSessionCookie(w, "margin_comment_reader", token, 30*24*60*60, time.Now().Add(30*24*time.Hour))
}
func (a *App) commentReaderLogout(w http.ResponseWriter, r *http.Request) {
	a.requireCommentReader(r)
	if cookie, err := r.Cookie(sessionCookieName("margin_comment_reader")); err == nil {
		a.DB.Must(r.Context(), "DELETE FROM comment_reader_sessions WHERE token_hash=$1", hash(cookie.Value))
	}
	if cookie, err := r.Cookie(sessionCookieName("margin_reader")); err == nil {
		a.DB.Must(r.Context(), "DELETE FROM reader_sessions WHERE token_hash=$1", hash(cookie.Value))
	}
	for _, name := range []string{"margin_comment_reader", "margin_reader"} {
		setSessionCookie(w, name, "", -1, time.Unix(0, 0))
	}
	send(w, 200, Row{"ok": true})
}
func (a *App) commentAuthStatus(w http.ResponseWriter, r *http.Request) {
	reader := a.commentReader(r)
	if reader != nil {
		send(w, 200, Row{"reader": Row{"name": reader["name"], "provider": reader["provider"]}, "providers": []string{}})
		return
	}
	send(w, 200, Row{"reader": nil, "providers": a.commentSocialProviders(r.Context())})
}
func (a *App) commentSocialProviders(ctx context.Context) (providers []string) {
	providers = []string{}
	defer func() {
		if recover() != nil {
			providers = []string{}
		}
	}()
	if a.accountToken(ctx) == "" {
		return
	}
	result := a.serviceRequest(ctx, "/v1/reader-auth/providers", nil, "")
	for _, id := range []string{"google", "microsoft", "apple"} {
		values, _ := result["providers"].([]any)
		for _, value := range values {
			if value == id {
				providers = append(providers, id)
			}
		}
	}
	return
}
func commentReturnPath(input Row) string {
	path := stringField(input, "returnTo", 1, 2048, true)
	if !strings.HasPrefix(path, sitePath("/")) || strings.HasPrefix(path, "//") || strings.ContainsAny(path, "\\\r\n#") {
		fail(400, "Invalid return address.")
	}
	return path
}
func (a *App) commentSignInPage(w http.ResponseWriter, r *http.Request) {
	theme := a.publicTheme(r)
	page := publicPage{Theme: theme, Title: "Reader sign-in — " + theme.str("name"), Action: "reader", Status: 200}
	page.Data = publicJSON(Row{"theme": theme, "readerSignIn": true})
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Cache-Control", "no-store")
	a.renderPublic(w, r, page)
}
