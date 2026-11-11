package blog

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

func object(v any) Row {
	switch r := v.(type) {
	case Row:
		return r
	case map[string]any:
		return Row(r)
	}
	return Row{}
}
func (a *App) fetchJSON(ctx context.Context, method, address string, value any, headers map[string]string, timeout time.Duration) (Row, int, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var reader io.Reader
	if value != nil {
		reader = bytes.NewBufferString(encode(value))
	}
	req, err := http.NewRequestWithContext(ctx, method, address, reader)
	if err != nil {
		return nil, 0, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := *a.Client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }
	response, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	var row Row
	if err = json.NewDecoder(io.LimitReader(response.Body, 48_000_000)).Decode(&row); err != nil {
		return nil, response.StatusCode, &HTTPError{502, "The AI service returned an unreadable response.", "AI_INVALID_RESPONSE"}
	}
	return row, response.StatusCode, nil
}
func (a *App) remote(ctx context.Context, method, address string, body any, headers map[string]string, timeout time.Duration) (Row, error) {
	row, status, err := a.fetchJSON(ctx, method, address, body, headers, timeout)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, &HTTPError{status, row.str("error"), row.str("code")}
	}
	return row, nil
}
func serviceAddress() string {
	return env("AI_SERVICE_URL", "https://margin.usefused.com")
}
func serviceURL() (*url.URL, error) {
	u, err := url.Parse(serviceAddress())
	if err != nil {
		return nil, err
	}
	if u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid service URL")
	}
	if u.Scheme != "https" && !(env("MARGIN_ENV", "production") != "production" && u.Scheme == "http") {
		return nil, errors.New("service requires HTTPS")
	}
	return u, nil
}
func (a *App) access(ctx context.Context) Row {
	if a.accountToken(ctx) == "" {
		coded(503, "Create a Margin account to use this feature. Your blog works without an account.", "ACCOUNT_REQUIRED")
	}
	base := accountURL()
	result, status, err := a.fetchJSON(ctx, "GET", base.ResolveReference(&url.URL{Path: "/v1/account"}).String(), nil, a.serviceHeaders(ctx), 10*time.Second)
	if err != nil || status < 200 || status >= 300 || !validEntitlements(object(result["entitlements"])) {
		coded(503, "Margin Central could not verify this engine. Check the connection and account key, then try again.", "ACCOUNT_UNAVAILABLE")
	}
	return entitlements(object(result["entitlements"]))
}
func validEntitlements(row Row) bool {
	if _, ok := row["active"].(bool); !ok {
		return false
	}
	p, ok := row["planId"]
	if !ok {
		return false
	}
	if p != nil && p != "starter" && p != "studio" {
		return false
	}
	e, ok := row["expiresAt"]
	return ok && nullableString(e)
}
func entitlements(row Row) Row {
	end, err := time.Parse(time.RFC3339Nano, row.str("expiresAt"))
	active := row.yes("active") && row.str("planId") != "" && err == nil && end.After(time.Now())
	result := Row{"active": active, "planId": nil, "expiresAt": nil, "ai": active, "email": active, "newsletter": active, "integrations": active && row.str("planId") == "studio"}
	if active {
		result["planId"] = row["planId"]
		result["expiresAt"] = end.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	return result
}
func (a *App) require(ctx context.Context, feature string) Row {
	access := a.access(ctx)
	if !access.yes(feature) {
		message := "This feature requires an active £10 Starter or £50 Studio subscription."
		if feature == "integrations" {
			message = "Integration services require an active £50 Studio subscription."
		}
		coded(402, message, "SUBSCRIPTION_REQUIRED")
	}
	return access
}
func (a *App) serviceRequest(ctx context.Context, route string, input any, id string) Row {
	if a.accountToken(ctx) == "" {
		coded(503, "Create a Margin account to use this feature.", "ACCOUNT_REQUIRED")
	}
	base, err := serviceURL()
	if err != nil {
		coded(503, "AI_SERVICE_URL must use HTTPS in production.", "AI_CONFIGURATION")
	}
	method := "GET"
	timeout := 30 * time.Second
	if input != nil {
		method = "POST"
	}
	if id != "" {
		timeout = 300 * time.Second
	}
	headers := a.serviceHeaders(ctx)
	if id != "" {
		headers["Idempotency-Key"] = id
	}
	row, status, err := a.fetchJSON(ctx, method, base.ResolveReference(&url.URL{Path: route}).String(), input, headers, timeout)
	return serviceResult(row, status, err)
}
func serviceResult(row Row, status int, err error) Row {
	if err != nil {
		var known *HTTPError
		if errors.As(err, &known) {
			panic(known)
		}
		coded(503, "The AI service could not be reached. Retry to recover this generation.", "AI_UNAVAILABLE")
	}
	if status < 200 || status >= 300 {
		message := row.str("error")
		if message == "" {
			message = "The AI service could not complete the request."
		}
		code := row.str("code")
		if code == "" {
			code = "AI_UNAVAILABLE"
		}
		coded(status, message, code)
	}
	return row
}

func accountURL() *url.URL {
	parsed, err := url.Parse(serviceAddress())
	if err != nil || parsed.Host == "" {
		coded(503, "The account service URL is invalid.", "ACCOUNT_UNAVAILABLE")
	}
	base, err := serviceURL()
	if err != nil {
		coded(503, "The account service requires HTTPS.", "ACCOUNT_UNAVAILABLE")
	}
	return base
}
