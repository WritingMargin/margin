package blog

import (
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Extra origins permit browser mutations from explicitly configured aliases.
// They do not change the canonical publication URL or enable cross-origin CORS.
func additionalOriginAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	for _, value := range strings.Split(os.Getenv("MARGIN_ALLOWED_ORIGINS"), ",") {
		if configuredOrigin(value) == origin {
			return true
		}
	}
	return false
}

func configuredOrigin(value string) string {
	value = strings.TrimSpace(value)
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || strings.ContainsAny(value, "*?#") {
		return ""
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return ""
	}
	if u.Path != "" && u.Path != "/" {
		return ""
	}
	if !validOriginPort(u) {
		return ""
	}
	return canonicalOrigin(u)
}

func validOriginPort(u *url.URL) bool {
	if u.Port() == "" {
		return !strings.HasSuffix(u.Host, ":")
	}
	port, err := strconv.Atoi(u.Port())
	return err == nil && port > 0 && port <= 65535
}

// Permit only the public host's www pair, with the same scheme and port.
// Sharing cookies does not grant mutation access to arbitrary subdomains.
func publicAliasOriginAllowed(origin string) bool {
	domain := automaticCookieDomain()
	if domain == "" || cookieDomain() != domain {
		return false
	}
	public, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil {
		return false
	}
	alias := domain
	if strings.EqualFold(public.Hostname(), domain) {
		alias = "www." + domain
	}
	if public.Port() != "" {
		alias += ":" + public.Port()
	}
	public.Host = alias
	return origin == canonicalOrigin(public)
}
