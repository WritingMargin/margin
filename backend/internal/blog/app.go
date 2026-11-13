package blog

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/lib/pq"
	"io"
	"io/fs"
	"log"
	"modernc.org/sqlite"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

type HTTPError struct {
	Status        int
	Message, Code string
}

func (e *HTTPError) Error() string           { return e.Message }
func fail(status int, message string)        { panic(&HTTPError{status, message, ""}) }
func coded(status int, message, code string) { panic(&HTTPError{status, message, code}) }
func must(err error) {
	if err != nil {
		panic(err)
	}
}
func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
func hash(value string) string { s := sha256.Sum256([]byte(value)); return hex.EncodeToString(s[:]) }
func token() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	must(err)
	return base64.RawURLEncoding.EncodeToString(b)
}
func uuid() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	must(err)
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func encode(v any) string {
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	must(e.Encode(v))
	return strings.TrimSuffix(b.String(), "\n")
}
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type responseWriterKey struct{}
type parsedBodyKey struct{}
type parsedBody struct{ value any }

func parseRequestBody(w http.ResponseWriter, r *http.Request) *http.Request {
	if isJSONMediaUpload(r) || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		return r
	}
	return parseJSONRequestBody(w, r, 3<<20)
}

func parseJSONRequestBody(w http.ResponseWriter, r *http.Request, limitBytes int64) *http.Request {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limitBytes))
	if err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			fail(413, "request entity too large")
		}
		fail(400, "Invalid JSON request.")
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return r
	}
	var value any
	if err = json.Unmarshal(data, &value); err != nil {
		fail(400, "Invalid JSON request.")
	}
	switch value.(type) {
	case map[string]any, []any:
	default:
		fail(400, "Invalid JSON request.")
	}
	return r.WithContext(context.WithValue(r.Context(), parsedBodyKey{}, parsedBody{value}))
}
func body(_ http.ResponseWriter, r *http.Request) Row {
	parsed, _ := r.Context().Value(parsedBodyKey{}).(parsedBody)
	value, ok := parsed.value.(map[string]any)
	if !ok {
		fail(400, "Expected a JSON object.")
	}
	return Row(value)
}
func optionalBody(w http.ResponseWriter, r *http.Request) Row {
	if _, ok := r.Context().Value(parsedBodyKey{}).(parsedBody); !ok {
		return Row{}
	}
	return body(w, r)
}
func nullableString(v any) bool {
	if v == nil {
		return true
	}
	_, ok := v.(string)
	return ok
}

type window struct {
	Start time.Time
	Count int
}
type App struct {
	Version           string
	passwordMailTasks sync.WaitGroup
	passwordMailSlots chan struct{}
	captchaCache      managedCaptchaCache
	DB                *Database
	Storage           Storage
	Client            *http.Client
	Web               fs.FS
	mu                sync.Mutex
	countryMu         sync.RWMutex
	countryDownloadMu sync.Mutex
	countryLoaded     bool
	countryDB         *countryDatabase
	countryError      string
	pwaIcons          pwaIconCache
	templates         templateCatalogCache
	limits            map[string]window
	mux               *http.ServeMux
}

func NewApp(db *Database, storage Storage, client *http.Client, web fs.FS) *App {
	validateWebBase(web)
	if s3storage, ok := storage.(*S3Storage); ok {
		s3storage.AttachDatabase(db)
	}
	if client == nil {
		client = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	a := &App{passwordMailSlots: make(chan struct{}, 4), DB: db, Storage: storage, Client: client, Web: web, limits: map[string]window{}, mux: http.NewServeMux()}
	a.coreRoutes()
	a.docsRoutes()
	a.interactionRoutes()
	a.pollRoutes()
	a.analyticsRoutes()
	a.countryDatabaseRoutes()
	a.cliLoginRoutes()
	a.oauthRoutes()
	a.siteSettingsRoutes()
	a.pwaRoutes()
	a.assetRoutes()
	a.newsletterRoutes()
	a.aiRoutes()
	a.simplifiedRoutes()
	a.accountRoutes()
	a.mediaRoutes()
	a.documentRoutes()
	a.mux.HandleFunc("GET /rss.xml", a.rss)
	a.publicRoutes()
	a.readableRoutes()
	a.mcpRoutes()
	a.mux.HandleFunc("/", a.static)
	go a.resumeSimplifiedJobs()
	return a
}
func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer recoverRequest(w)
	securityHeaders(w)
	if a.oauthDiscovery(w, r) {
		return
	}
	r = mountedRequest(w, r)
	if r == nil {
		return
	}
	r = r.WithContext(context.WithValue(r.Context(), responseWriterKey{}, w))
	r = r.WithContext(context.WithValue(r.Context(), browserPrincipalKey{}, &browserPrincipalCache{}))
	if r.URL.Path == "/api/public/analytics" {
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	}
	if r.URL.Path != "/mcp" {
		r = parseRequestBody(w, r)
	}
	if isAPI(r.URL.Path) {
		a.protectAPI(w, r)
	}
	a.mux.ServeHTTP(w, r)
}
func recoverRequest(w http.ResponseWriter) {
	if recovered := recover(); recovered != nil {
		e := responseError(recovered)
		if e.Status >= 500 {
			log.Printf("[margin] %v", recovered)
		}
		result := Row{"error": e.Message}
		if e.Code != "" {
			result["code"] = e.Code
		}
		send(w, e.Status, result)
	}
}
func responseError(recovered any) *HTTPError {
	switch e := recovered.(type) {
	case *HTTPError:
		return e
	case *pq.Error:
		if e.Code == "23505" {
			return &HTTPError{409, "A post with that slug already exists.", ""}
		}
	case *sqlite.Error:
		if e.Code() == 2067 || e.Code() == 1555 {
			return &HTTPError{409, "A post with that slug already exists.", ""}
		}
	}
	return &HTTPError{500, "The server could not complete this request.", ""}
}

// Model downloads use fetch. Add only the HTTPS origins configured by the publisher.
func modelOriginPolicy(origins string) string {
	var policy strings.Builder
	for _, origin := range strings.Fields(origins) {
		if strings.ContainsAny(origin, "*;,") {
			continue
		}
		u, err := url.Parse(origin)
		if err == nil && u.Scheme == "https" && u.Host != "" && origin == "https://"+u.Host {
			policy.WriteString(" " + origin)
		}
	}
	return policy.String()
}

func securityHeaders(w http.ResponseWriter) {
	production := env("MARGIN_ENV", "production") == "production"
	csp := "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.vimeo.com https://w.soundcloud.com https://open.spotify.com https://challenges.cloudflare.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' https: http: data: blob:; media-src 'self' https: http: blob:; connect-src 'self' data: blob: https://res.cloudinary.com https://api.cloudinary.com https://challenges.cloudflare.com https://www.google.com/recaptcha/"
	csp += modelOriginPolicy(os.Getenv("MARGIN_MODEL_ORIGINS"))
	if !production {
		csp += " ws: http:"
	}
	csp += "; frame-src https://platform.twitter.com https://www.instagram.com https://www.linkedin.com https://challenges.cloudflare.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://player.mux.com https://player.cloudinary.com https://open.spotify.com https://w.soundcloud.com https://share.descript.com https://www.veed.io https://api.riverside.fm https://embed.figma.com 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
	if production {
		csp += "; upgrade-insecure-requests"
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
	w.Header().Set("Content-Security-Policy", csp)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
}
func isAPI(p string) bool { return p == "/api" || strings.HasPrefix(p, "/api/") }
func readMethod(method string) bool {
	return method == "GET" || method == "HEAD" || method == "OPTIONS"
}
func (a *App) protectAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !readMethod(r.Method) {
		a.checkOrigin(r)
	}
	if protectedPath(r.URL.Path) {
		if !a.authenticated(r) {
			oauthChallenge(w, "/api")
			fail(401, "Sign in to continue.")
		}
		a.authorizeToken(r)
	}
	a.validateResponseFields(r)
}
func (a *App) checkOrigin(r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" && !a.allowedOrigin(r, origin) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		fail(403, "Request origin is not allowed.")
	}
	cookie, _ := r.Cookie(sessionCookieName("margin_session"))
	if cookie != nil && origin == "" && !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		fail(403, "An Origin header is required for session mutations.")
	}
}
func protectedPath(p string) bool {
	for _, prefix := range []string{"team", "posts", "settings", "comments", "readers", "tokens", "storage", "media", "ai", "newsletter", "account", "recommendations", "analytics", "oauth"} {
		if p == "/api/"+prefix || strings.HasPrefix(p, "/api/"+prefix+"/") {
			return true
		}
	}
	return false
}
func (a *App) origin(r *http.Request) string {
	if raw := os.Getenv("PUBLIC_URL"); raw != "" {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			fail(503, "PUBLIC_URL is invalid.")
		}
		return canonicalOrigin(u)
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	hops, _ := strconv.Atoi(os.Getenv("TRUST_PROXY"))
	if hops > 0 {
		if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]); forwarded == "https" {
			scheme = "https"
		}
	}
	return scheme + "://" + r.Host
}
func (a *App) ip(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	hops, _ := strconv.Atoi(os.Getenv("TRUST_PROXY"))
	if hops > 0 {
		chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if len(chain) >= hops {
			candidate := strings.TrimSpace(chain[len(chain)-hops])
			if net.ParseIP(candidate) != nil {
				host = candidate
			}
		}
	}
	return host
}
func (a *App) limit(r *http.Request, name string, count int, duration time.Duration, owner bool) {
	key := a.ip(r)
	if addr, err := netip.ParseAddr(key); err == nil && addr.Is6() {
		key = netip.PrefixFrom(addr, 56).Masked().String()
	}
	if owner {
		key = "owner"
	}
	key = name + ":" + key
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for k, v := range a.limits {
		if now.Sub(v.Start) > time.Hour {
			delete(a.limits, k)
		}
	}
	v := a.limits[key]
	if now.Sub(v.Start) >= duration {
		v = window{Start: now}
	}
	v.Count++
	a.limits[key] = v
	rateHeaders(r, name, strings.TrimPrefix(key, name+":"), count, v, duration)
	if v.Count > count {
		fail(429, limitMessage(name))
	}
}
func (a *App) authenticated(r *http.Request) bool {
	authorization := r.Header.Get("Authorization")
	if strings.HasPrefix(authorization, "Bearer ") {
		if strings.HasPrefix(strings.TrimPrefix(authorization, "Bearer "), "moat_") {
			return a.oauthPrincipal(r, strings.TrimPrefix(authorization, "Bearer ")) != nil
		}
		return len(a.DB.Must(r.Context(), "SELECT token_hash FROM api_tokens WHERE token_hash=$1", hash(strings.TrimPrefix(authorization, "Bearer ")))) > 0
	}
	return a.browserPrincipal(r) != nil
}
func (a *App) static(w http.ResponseWriter, r *http.Request) {
	if isAPI(r.URL.Path) {
		fail(404, "API endpoint not found.")
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		http.NotFound(w, r)
		return
	}
	if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/admin/") {
		a.workspaceHTML(w, r)
		return
	}
	if a.Web == nil {
		a.publicError(w, r, 404)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	data, err := fs.ReadFile(a.Web, name)
	if err != nil {
		a.publicError(w, r, 404)
		return
	}
	// Only the bundled PDF worker needs WebAssembly compilation; JavaScript eval stays disabled.
	if strings.Contains(name, "/pdf.worker.min-") && strings.HasSuffix(name, ".mjs") {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'")
	}
	serveWebAsset(w, r, name, mountedWebData(name, data))
}
func (a *App) workspaceHTML(w http.ResponseWriter, r *http.Request) {
	if a.Web == nil {
		a.publicError(w, r, 503)
		return
	}
	data, err := fs.ReadFile(a.Web, "index.html")
	if err != nil {
		a.publicError(w, r, 503)
		return
	}
	nonce := pageNonce(w)
	content := workspaceNonce(string(mountedWebData("index.html", data)), nonce)
	content = workspaceStartup(content, a.settings(r.Context()))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	if r.Method != "HEAD" {
		_, _ = w.Write([]byte(content))
	}
}

func limitMessage(name string) string {
	messages := map[string]string{
		"auth":                 "Too many sign-in attempts. Try again later.",
		"comments":             "Please wait before leaving another comment.",
		"ai-summaries":         "Please wait before generating more social drafts.",
		"ai-images":            "Please wait before generating more images.",
		"newsletter-subscribe": "Too many subscription requests. Please try again later.",
	}
	if message, ok := messages[name]; ok {
		return message
	}
	return "Too many requests. Please try again later."
}

func canonicalOrigin(u *url.URL) string {
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if scheme == "https" && port == "443" || scheme == "http" && port == "80" {
		port = ""
	}
	if port != "" {
		host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return scheme + "://" + host
}

func rateHeaders(r *http.Request, name, key string, count int, value window, duration time.Duration) {
	w, ok := r.Context().Value(responseWriterKey{}).(http.ResponseWriter)
	if !ok {
		return
	}
	seconds := int(duration.Seconds())
	reset := max(0, int(time.Until(value.Start.Add(duration)).Seconds())+1)
	remaining := max(0, count-value.Count)
	if strings.HasPrefix(name, "newsletter-") {
		w.Header().Set("RateLimit-Policy", fmt.Sprintf("%d;w=%d", count, seconds))
		w.Header().Set("RateLimit", fmt.Sprintf("limit=%d, remaining=%d, reset=%d", count, remaining, reset))
	} else {
		identifier := fmt.Sprintf("%d-in-%dmin", count, int(duration.Minutes()))
		partition := base64.StdEncoding.EncodeToString([]byte(hash(key)[:12]))
		w.Header().Set("RateLimit", fmt.Sprintf("%q; r=%d; t=%d", identifier, remaining, reset))
		w.Header().Set("RateLimit-Policy", fmt.Sprintf("%q; q=%d; w=%d; pk=:%s:", identifier, count, seconds, partition))
	}
	if value.Count > count {
		w.Header().Set("Retry-After", strconv.Itoa(reset))
	}
}
