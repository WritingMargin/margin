package blog

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type managedCaptchaCache struct {
	mu    sync.Mutex
	key   string
	until time.Time
	value Row
}

func (a *App) managedCaptcha(ctx context.Context, refresh bool) (result Row) {
	defer func() {
		if problem := recover(); problem != nil {
			if _, ok := problem.(error); !ok {
				panic(problem)
			}
			result = Row{"issue": "The Margin account connection could not be loaded. Restore the connection or use your own CAPTCHA keys."}
		}
	}()
	return a.loadManagedCaptcha(ctx, refresh)
}
func (a *App) loadManagedCaptcha(ctx context.Context, refresh bool) Row {
	credential := a.accountToken(ctx)
	if credential == "" {
		return Row{"issue": "Connect a Margin account to use managed protection, or enter your own CAPTCHA keys."}
	}
	origin, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil || origin.Hostname() == "" {
		return Row{"issue": "Set PUBLIC_URL to your registered blog address to use managed protection."}
	}
	base, err := serviceURL()
	if err != nil {
		return Row{"issue": "The Margin account connection requires a valid HTTPS address."}
	}
	cache := &a.captchaCache
	cache.mu.Lock()
	defer cache.mu.Unlock()
	key := hash(credential + "\n" + base.String() + "\n" + origin.Hostname())
	if !refresh && key == cache.key && time.Now().Before(cache.until) {
		return cache.value
	}
	result, status, err := a.fetchJSON(ctx, "GET", base.ResolveReference(&url.URL{Path: "/v1/captcha"}).String(), nil, a.serviceHeaders(ctx), 3*time.Second)
	value := managedCaptchaResult(result, status, err, origin.Hostname())
	ttl := 30 * time.Second
	if value.str("siteKey") != "" {
		ttl = 5 * time.Minute
	}
	cache.key, cache.value, cache.until = key, value, time.Now().Add(ttl)
	return value
}

func managedCaptchaResult(result Row, status int, err error, hostname string) Row {
	if err != nil || status != http.StatusOK {
		issue := "Margin bot protection is unavailable. Try again or use your own keys."
		if status == 503 && strings.HasPrefix(result.str("code"), "CAPTCHA_") {
			issue = result.str("error")
		}
		return Row{"issue": issue}
	}
	if result.str("provider") != "recaptcha-v2" || !keyRE.MatchString(result.str("siteKey")) {
		return Row{"issue": "Margin could not load bot protection. Please try again."}
	}
	if result.str("hostname") != strings.ToLower(hostname) {
		return Row{"issue": "Your public blog hostname does not match the registered Margin account. Use your own keys or update the account hostname."}
	}
	return Row{"provider": "recaptcha-v2", "source": "central", "siteKey": result["siteKey"]}
}

func (a *App) verifyManagedCaptcha(r *http.Request, token string) Row {
	base, err := serviceURL()
	if err != nil {
		fail(503, "Managed bot protection is unavailable.")
	}
	result, status, err := a.fetchJSON(r.Context(), "POST", base.ResolveReference(&url.URL{Path: "/v1/captcha/verify"}).String(), Row{"token": token, "remoteip": a.ip(r)}, a.serviceHeaders(r.Context()), 10*time.Second)
	if err != nil || status != http.StatusOK {
		managedVerificationError(status)
	}
	return result
}

func managedVerificationError(status int) {
	if status == http.StatusBadRequest {
		fail(400, "CAPTCHA verification failed. Please try again.")
	}
	if status == http.StatusTooManyRequests {
		fail(429, "Too many verification requests. Please wait and try again.")
	}
	fail(503, "Managed bot verification is temporarily unavailable. Please try again.")
}
