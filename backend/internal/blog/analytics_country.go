package blog

import (
	"net/http"
	"net/netip"
	"regexp"
	"strings"
)

var analyticsCountryCode = regexp.MustCompile(`^[A-Z]{2}$`)

func (a *App) analyticsLocationSource() string {
	if a.countryDatabaseStatus().yes("installed") {
		return "local"
	}
	return "none"
}

// Later heartbeats reuse the first location saved for this visit.
func (a *App) analyticsLocationForVisit(r *http.Request, viewID string) string {
	if saved := first(a.DB.Must(r.Context(), "SELECT country FROM analytics_visits WHERE id=$1", viewID)); saved != nil {
		if country := saved.str("country"); !strings.HasPrefix(country, "ip:") {
			return country
		}
		return "Unknown"
	}
	return a.analyticsLocation(r)
}

func (a *App) analyticsLocation(r *http.Request) string {
	address, err := netip.ParseAddr(a.ip(r))
	if err != nil {
		return "Unknown"
	}
	address = address.Unmap()
	if code, installed := a.localCountry(address); installed {
		return code
	}
	return "Unknown"
}

func normalizedCountry(value string) string {
	country := strings.ToUpper(strings.TrimSpace(value))
	if !analyticsCountryCode.MatchString(country) || country == "XX" || country == "T1" {
		return "Unknown"
	}
	return country
}
