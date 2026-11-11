package blog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"margin/backend/internal/contentcrypto"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Keep the table and encryption context so existing Turnstile keys need no migration.
func turnstileEncryption() *contentcrypto.Encryption {
	encryption, err := configuredContentEncryption()
	if err != nil {
		fail(503, "The server encryption key is not configured. Set CONTENT_ENCRYPTION_KEY before saving CAPTCHA keys.")
	}
	return encryption
}
func validTurnstileKey(input Row, key string) string {
	value := stringField(input, key, 1, 512, true)
	if !keyRE.MatchString(value) {
		fail(400, key+": Enter a valid CAPTCHA key.")
	}
	return value
}
func captchaProvider(input Row) string {
	if _, ok := input["provider"]; !ok {
		return "turnstile"
	}
	provider := stringField(input, "provider", 1, 32, false)
	if provider != "turnstile" && provider != "recaptcha-v2" {
		fail(400, "Choose Cloudflare Turnstile or Google reCAPTCHA v2 (checkbox).")
	}
	return provider
}
func (a *App) turnstile(ctx context.Context) Row {
	row := first(a.DB.Must(ctx, "SELECT encrypted_configuration FROM turnstile_settings WHERE id=1"))
	if row == nil {
		return nil
	}
	return decryptTurnstile(turnstileEncryption(), row.str("encrypted_configuration"))
}
func decryptTurnstile(encryption *contentcrypto.Encryption, encoded string) (result Row) {
	defer func() {
		if recover() != nil {
			fail(503, "Saved CAPTCHA settings could not be decrypted. Restore the server encryption key or replace both keys.")
		}
	}()
	data, err := base64.StdEncoding.DecodeString(encoded)
	must(err)
	plain, err := encryption.Decrypt(data, "settings", "turnstile")
	must(err)
	var input Row
	must(json.Unmarshal(plain, &input))
	return Row{"provider": captchaProvider(input), "siteKey": validTurnstileKey(input, "siteKey"), "secretKey": validTurnstileKey(input, "secretKey"), "source": "database"}
}
func (a *App) captchaConfiguration(ctx context.Context) Row {
	if custom := a.turnstile(ctx); custom != nil {
		return custom
	}
	return a.managedCaptcha(ctx, false)
}
func (a *App) publicCaptcha(ctx context.Context) (result Row) {
	result = Row{}
	defer func() {
		if problem := recover(); problem != nil {
			if _, ok := problem.(*HTTPError); !ok {
				panic(problem)
			}
			result = Row{}
		}
	}()
	configuration := a.captchaConfiguration(ctx)
	if configuration.str("siteKey") == "" {
		return Row{}
	}
	return Row{"siteKey": configuration["siteKey"], "provider": configuration["provider"], "action": configuration.str("action"), "cData": configuration.str("cData")}
}
func (a *App) publicSiteKey(ctx context.Context) string { return a.publicCaptcha(ctx).str("siteKey") }

func (a *App) turnstileStatus(ctx context.Context) (result Row) {
	_, err := configuredContentEncryption()
	result = Row{"provider": "managed", "siteKey": "", "secretConfigured": false, "source": "none", "encryptionAvailable": err == nil, "issue": ""}
	defer func() {
		if problem := recover(); problem != nil {
			e, ok := problem.(*HTTPError)
			if !ok {
				panic(problem)
			}
			result["issue"] = e.Message
		}
	}()
	// Mark a saved override before decrypting: broken keys must never fall back to Central.
	if first(a.DB.Must(ctx, "SELECT id FROM turnstile_settings WHERE id=1")) != nil {
		result["source"], result["provider"] = "database", "turnstile"
		saved := a.turnstile(ctx)
		result["provider"], result["siteKey"], result["secretConfigured"] = saved["provider"], saved["siteKey"], true
		return
	}
	managed := a.managedCaptcha(ctx, true)
	result["siteKey"], result["issue"] = managed.str("siteKey"), managed.str("issue")
	if managed.str("siteKey") != "" {
		result["source"] = "central"
	}
	return
}
func (a *App) readTurnstile(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.turnstileStatus(r.Context()))
}
func (a *App) saveTurnstile(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "provider", "siteKey", "secretKey")
	if input.str("provider") == "managed" {
		a.DB.Must(r.Context(), "DELETE FROM turnstile_settings WHERE id=1")
		send(w, 200, a.turnstileStatus(r.Context()))
		return
	}
	provider := captchaProvider(input)
	site := validTurnstileKey(input, "siteKey")
	secret := ""
	if _, ok := input["secretKey"]; ok {
		secret = stringField(input, "secretKey", 0, 512, true)
	}
	encryption := turnstileEncryption()
	if secret == "" {
		secret = a.retainedCaptchaSecret(r.Context(), provider, site)
	}
	value := Row{"provider": provider, "siteKey": site, "secretKey": validTurnstileKey(Row{"secretKey": secret}, "secretKey")}
	encrypted, err := encryption.Encrypt([]byte(encode(value)), "settings", "turnstile")
	must(err)
	a.DB.Must(r.Context(), "INSERT INTO turnstile_settings(id,encrypted_configuration) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET encrypted_configuration=EXCLUDED.encrypted_configuration", base64.StdEncoding.EncodeToString(encrypted))
	send(w, 200, a.turnstileStatus(r.Context()))
}
func (a *App) retainedCaptchaSecret(ctx context.Context, provider, site string) string {
	current := a.turnstile(ctx)
	if current == nil || current.str("siteKey") != site || current.str("provider") != provider {
		fail(400, "Enter the secret key when connecting a provider or changing the site key.")
	}
	return current.str("secretKey")
}
func (a *App) verifyCaptcha(r *http.Request, response string) {
	captcha := a.captchaConfiguration(r.Context())
	if captcha.str("siteKey") == "" {
		fail(503, "Comments are unavailable until bot protection is configured.")
	}
	var verdict Row
	if captcha.str("source") == "central" {
		verdict = a.verifyManagedCaptcha(r, response)
	} else {
		verdict = a.verifyCustomCaptcha(r, captcha, response)
	}
	if !verdict.yes("success") {
		fail(400, "CAPTCHA verification failed. Please try again.")
	}
	if origin := os.Getenv("PUBLIC_URL"); origin != "" {
		parsed, err := url.Parse(origin)
		must(err)
		if !strings.EqualFold(verdict.str("hostname"), parsed.Hostname()) {
			fail(400, "CAPTCHA hostname does not match this blog.")
		}
	} else if env("MARGIN_ENV", "production") == "production" {
		fail(503, "Set PUBLIC_URL before accepting protected comments.")
	}
}
func (a *App) verifyCustomCaptcha(r *http.Request, captcha Row, response string) Row {
	address := "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	if captcha.str("provider") == "recaptcha-v2" {
		address = "https://www.google.com/recaptcha/api/siteverify"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	form := url.Values{"secret": {captcha.str("secretKey")}, "response": {response}, "remoteip": {a.ip(r)}}
	request, err := http.NewRequestWithContext(ctx, "POST", address, strings.NewReader(form.Encode()))
	must(err)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := *a.Client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	verification, err := client.Do(request)
	if err != nil {
		fail(503, "Bot verification is temporarily unavailable. Please try again.")
	}
	defer verification.Body.Close()
	var verdict Row
	if verification.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(verification.Body, 65536)).Decode(&verdict) != nil {
		fail(503, "Bot verification is temporarily unavailable. Please try again.")
	}
	if captcha.str("provider") == "recaptcha-v2" && verdict["score"] != nil {
		fail(400, "Use Google reCAPTCHA v2 checkbox keys for this configuration.")
	}
	return verdict
}
