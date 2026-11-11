package blog

import (
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"golang.org/x/net/publicsuffix"
)

// Infer only from the configured public URL, never from request or proxy headers.
// Strip www, but do not broaden blog.example.com to example.com.
func automaticCookieDomain() string {
	public, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil || public.Scheme != "https" || public.User != nil {
		return ""
	}
	domain := strings.TrimPrefix(strings.ToLower(public.Hostname()), "www.")
	if !shareableCookieDomain(domain) {
		return ""
	}
	return domain
}

func shareableCookieDomain(domain string) bool {
	suffix, _ := publicsuffix.PublicSuffix(domain)
	return validDomainHost(domain) && domain != suffix
}

func cookieDomain() string {
	value := strings.ToLower(strings.TrimSpace(os.Getenv("MARGIN_COOKIE_DOMAIN")))
	if value == "host-only" {
		return ""
	}
	if value == "" {
		return automaticCookieDomain()
	}
	return strings.TrimPrefix(value, ".")
}

// Explicit overrides must remain within the configured public host's parents.
func ValidateCookieDomain() error {
	domain := cookieDomain()
	if value := strings.TrimSpace(os.Getenv("MARGIN_COOKIE_DOMAIN")); value == "" || strings.EqualFold(value, "host-only") {
		return nil
	}
	if !shareableCookieDomain(domain) {
		return errors.New("MARGIN_COOKIE_DOMAIN must be a domain name, not a public suffix, scheme, port, or path")
	}
	public, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil || public.Scheme != "https" || public.User != nil {
		return errors.New("MARGIN_COOKIE_DOMAIN requires an HTTPS PUBLIC_URL")
	}
	host := strings.ToLower(public.Hostname())
	if host != domain && !strings.HasSuffix(host, "."+domain) {
		return errors.New("MARGIN_COOKIE_DOMAIN must match PUBLIC_URL's hostname or its parent domain")
	}
	return nil
}

func sessionCookieName(name string) string {
	// Separate names prevent old host-only cookies on either host from shadowing
	// the shared session. Enabling sharing deliberately requires a fresh login.
	if cookieDomain() != "" {
		return name + "_shared"
	}
	return name
}

func setSessionCookie(w http.ResponseWriter, name, value string, age int, expires time.Time) {
	if err := ValidateCookieDomain(); err != nil {
		fail(503, err.Error())
	}
	cookie := &http.Cookie{Name: sessionCookieName(name), Value: value, Domain: cookieDomain(), Path: sitePath("/"), HttpOnly: true, Secure: env("MARGIN_ENV", "production") == "production", SameSite: http.SameSiteStrictMode, MaxAge: age, Expires: expires} // #nosec G124 -- Secure is enabled in production; explicit development/test environments support local HTTP. HttpOnly and Strict SameSite are set.
	if cookie.Domain != "" {
		// Clear this host's legacy cookie. Other hosts' legacy cookies are ignored.
		http.SetCookie(w, &http.Cookie{Name: name, Path: cookie.Path, HttpOnly: true, Secure: cookie.Secure, SameSite: cookie.SameSite, MaxAge: -1, Expires: time.Unix(0, 0)}) // #nosec G124 -- Deletes the legacy cookie with the same environment-dependent Secure and SameSite flags as its replacement.
	}
	http.SetCookie(w, cookie)
}
