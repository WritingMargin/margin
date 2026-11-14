package blog

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"time"
)

// Hosted addresses belong to one provisioned engine. Use its injected credential,
// never a personal account connection that could refer to another publication.
func (a *App) hostingAddress(ctx context.Context, input Row) (Row, error) {
	base, err := serviceURL()
	token := os.Getenv("AI_SERVICE_TOKEN")
	if err != nil || token == "" {
		return nil, errors.New("Hosting settings are unavailable. Try again later.")
	}
	method := http.MethodGet
	var value any
	if input != nil {
		method, value = http.MethodPost, input
	}
	result, status, err := a.fetchJSON(ctx, method, base.ResolveReference(&url.URL{Path: "/v1/hosting/address"}).String(), value,
		map[string]string{"Authorization": "Bearer " + token, "Content-Type": "application/json"}, 30*time.Second)
	return hostingAddressResponse(result, status, err)
}
func hostingAddressResponse(result Row, status int, err error) (Row, error) {
	if err != nil {
		return nil, errors.New("Hosting settings are unavailable. Try again later.")
	}
	if status < 200 || status >= 300 {
		if status >= 400 && status < 500 && result.str("error") != "" {
			return nil, &HTTPError{status, result.str("error"), result.str("code")}
		}
		return nil, errors.New("Hosting settings are unavailable. Try again later.")
	}
	if result.str("assignedUrl") == "" || result.str("publicUrl") == "" {
		return nil, errors.New("Hosting settings are unavailable. Try again later.")
	}
	return result, nil
}

func (a *App) domainResult(r *http.Request, hosting Row) Row {
	result := a.domainSettings(r.Context())
	result["effectiveUrl"] = a.publicationOrigin(r)
	result["serverUrl"] = a.origin(r)
	if a.cloudOwner(r.Context()).str("subject") == "" {
		return result
	}
	if hosting == nil {
		var err error
		hosting, err = a.hostingAddress(r.Context(), nil)
		if err != nil {
			hosting = Row{"status": "unavailable", "message": "Hosting settings are unavailable. Try again later."}
		}
	}
	result["hosting"] = hosting
	result["serverUrl"] = hosting.str("assignedUrl")
	if address := hosting.str("publicUrl"); address != "" {
		result["effectiveUrl"] = address
	}
	return result
}

func (a *App) saveHostingAddress(w http.ResponseWriter, r *http.Request, input Row) {
	strict(input, "url", "mode")
	value := Row{"publicUrl": stringField(input, "url", 1, 2048, true), "mode": enumField(input, "mode", "dns", "proxy")}
	result, err := a.hostingAddress(r.Context(), value)
	if err != nil {
		var httpErr *HTTPError
		if errors.As(err, &httpErr) {
			panic(httpErr)
		}
		fail(503, err.Error())
	}
	send(w, 200, a.domainResult(r, result))
}
