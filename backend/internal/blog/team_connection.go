package blog

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Team identity is separate from hosting and never replaces the local owner.
func (a *App) teamBinding(ctx context.Context) Row {
	if binding := a.cloudOwner(ctx); binding.str("subject") != "" {
		return binding
	}
	return object(first(a.DB.Must(ctx, "SELECT configuration FROM site_settings WHERE name='team_connection'"))["configuration"])
}
func (a *App) teamOwnerSubject(ctx context.Context) string { return a.teamBinding(ctx).str("subject") }

func (a *App) teamConnectionRoutes() {
	a.mux.HandleFunc("GET /api/team/connection", a.teamConnectionStatus)
	a.mux.HandleFunc("POST /api/team/connection", a.connectTeam)
	a.mux.HandleFunc("POST /api/team/connection/complete", a.completeTeamConnection)
}
func (a *App) teamConnectionStatus(w http.ResponseWriter, r *http.Request) {
	if a.teamOwnerSubject(r.Context()) != "" {
		send(w, 200, Row{"connected": true})
		return
	}
	send(w, 200, Row{"connected": false})
}
func (a *App) connectTeam(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "consent")
	if !booleanField(input, "consent") {
		fail(400, "Confirm connecting your publication team before continuing.")
	}
	a.limit(r, "team-connect", 10, time.Hour, true)
	a.teamConnectionRequest(w, r, "POST", Row{"consent": true})
}
func (a *App) completeTeamConnection(w http.ResponseWriter, r *http.Request) {
	strict(body(w, r))
	a.limit(r, "team-connect-poll", 30, time.Minute, true)
	a.teamConnectionRequest(w, r, "GET", nil)
}
func (a *App) teamConnectionRequest(w http.ResponseWriter, r *http.Request, method string, input Row) {
	if a.teamOwnerSubject(r.Context()) != "" {
		send(w, 200, Row{"connected": true})
		return
	}
	if a.accountToken(r.Context()) == "" {
		coded(409, "Connect your Margin account before enabling team invitations.", "ACCOUNT_REQUIRED")
	}
	base := accountURL()
	result, status, err := a.fetchJSON(r.Context(), method, base.ResolveReference(&url.URL{Path: "/v1/team/connection"}).String(), input, a.serviceHeaders(r.Context()), 20*time.Second)
	result = serviceResult(result, status, err)
	a.finishTeamConnection(w, r, result)
}
func (a *App) finishTeamConnection(w http.ResponseWriter, r *http.Request, result Row) {
	if result.yes("connected") || result.yes("authenticationRequired") {
		a.validateTeamPublication(r.Context(), result)
	}
	if result.yes("connected") {
		if !uuidRE.MatchString(result.str("publicationId")) || !uuidRE.MatchString(result.str("ownerSubject")) {
			coded(502, "Margin could not verify the publication connection. Please try again.", "TEAM_CONNECTION_INVALID")
		}
		base := accountURL()
		origin := result.str("centralOrigin")
		if origin == "" {
			origin = base.Scheme + "://" + base.Host
		}
		origin = cloudCentralOrigin(origin)
		binding := Row{"subject": result["ownerSubject"], "publicationId": result["publicationId"], "centralOrigin": origin, "serviceURL": serviceAddress()}
		a.DB.Must(r.Context(), "INSERT INTO site_settings(name,configuration) VALUES('team_connection',$1) ON CONFLICT(name) DO NOTHING", encode(binding))
		saved := a.teamBinding(r.Context())
		if saved.str("subject") != binding.str("subject") || saved.str("publicationId") != binding.str("publicationId") {
			coded(409, "This publication is already connected to another team.", "TEAM_CONNECTION_CONFLICT")
		}
		send(w, 200, Row{"connected": true})
		return
	}
	response := Row{"connected": false}
	if result.yes("authenticationRequired") {
		response["authentication"] = validatedAccountAuthentication(result)
	}
	owner := first(a.DB.Must(r.Context(), "SELECT email FROM admins WHERE id=1"))
	response["email"], response["blogUrl"] = owner["email"], a.newsletterOrigin(r.Context())
	send(w, 200, response)
}

// Reconfiguration must not send a newly configured account credential to an
// earlier connection's service. Check the destination before loading the key.
func (a *App) teamAccountCredential(ctx context.Context, binding Row) string {
	expected := binding.str("serviceURL")
	if expected == "" {
		expected = binding.str("centralOrigin")
	}
	if expected != serviceAddress() {
		coded(503, "The team connection uses a different Margin service address. Restore the account connection before managing teammates.", "TEAM_CONNECTION_CONFIGURATION")
	}
	return a.accountToken(ctx)
}

func (a *App) validateTeamPublication(ctx context.Context, result Row) {
	expected := strings.TrimRight(a.newsletterOrigin(ctx), "/")
	if expected == "" || strings.TrimRight(result.str("blogUrl"), "/") != expected {
		coded(409, "This Margin account connection belongs to a different publication. Connect an account for this publication before inviting teammates.", "TEAM_PUBLICATION_MISMATCH")
	}
}
