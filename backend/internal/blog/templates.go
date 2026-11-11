package blog

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type templateCatalogCache struct {
	mu      sync.Mutex
	address string
	catalog Row
	etag    string
}

func (a *App) readTemplates(w http.ResponseWriter, r *http.Request) {
	base, err := serviceURL()
	if err != nil {
		coded(503, "Template catalog unavailable. Included templates are still available.", "TEMPLATES_UNAVAILABLE")
	}
	address := base.ResolveReference(&url.URL{Path: "/v1/templates", RawQuery: "schemaVersion=5"}).String()
	cache := &a.templates
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.address != address {
		cache.address, cache.catalog, cache.etag = address, nil, ""
	}
	// Revalidate only in response to a visit to the template browser. No timer.
	catalog, etag, err := a.fetchTemplates(r.Context(), address, cache.etag)
	if err == nil && catalog != nil {
		cache.catalog, cache.etag = catalog, etag
	}
	if cache.catalog == nil {
		coded(503, "Template catalog unavailable. Included templates are still available.", "TEMPLATES_UNAVAILABLE")
	}
	send(w, http.StatusOK, cache.catalog)
}

func (a *App) fetchTemplates(ctx context.Context, address, etag string) (Row, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	// Catalog reads carry no account token, cookie, draft, or publication settings.
	client := *a.Client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotModified {
		return nil, etag, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, "", errors.New("template catalog unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return nil, "", errors.New("template catalog exceeds size limit")
	}
	var catalog Row
	if json.Unmarshal(data, &catalog) != nil || !validTemplateCatalog(catalog) {
		return nil, "", errors.New("invalid template catalog")
	}
	return catalog, response.Header.Get("ETag"), nil
}
