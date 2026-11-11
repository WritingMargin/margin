package blog

import (
	"context"
	"net/url"
	"time"
)

// A configured credential is not proof that Central accepts this account.
func (a *App) accountState(ctx context.Context) string {
	if a.accountToken(ctx) == "" {
		return "disconnected"
	}
	base, err := serviceURL()
	if err != nil {
		return "unavailable"
	}
	result, status, err := a.fetchJSON(ctx, "GET", base.ResolveReference(&url.URL{Path: "/v1/account"}).String(), nil, a.serviceHeaders(ctx), 10*time.Second)
	if status == 401 {
		return "rejected"
	}
	if err != nil || status != 200 || !validEntitlements(object(result["entitlements"])) {
		return "unavailable"
	}
	return "connected"
}
