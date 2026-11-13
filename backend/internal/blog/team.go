package blog

import (
	"net/http"
	"strconv"
	"time"
)

func (a *App) teamRoutes() {
	a.teamConnectionRoutes()
	a.mux.HandleFunc("GET /api/team", a.teamList)
	a.mux.HandleFunc("GET /api/team/members", a.teamMembersPage)
	a.mux.HandleFunc("GET /api/team/invitations", a.teamInvitationsPage)
	a.mux.HandleFunc("POST /api/team/invitations", a.teamInvite)
	a.mux.HandleFunc("POST /api/team/invitations/{id}/resend", a.teamResend)
	a.mux.HandleFunc("DELETE /api/team/invitations/{id}", a.teamRevokeInvitation)
	a.mux.HandleFunc("PATCH /api/team/members/{id}", a.teamUpdateMember)
	a.mux.HandleFunc("DELETE /api/team/members/{id}", a.teamRemoveMember)
	a.mux.HandleFunc("DELETE /api/team/members/{id}/articles/{articleId}", a.teamRevokeArticle)
	a.mux.HandleFunc("POST /api/public/team/accept", a.teamAccept)
}
func (a *App) centralTeamRequest(r *http.Request, action string, fields Row) Row {
	principal := a.browserPrincipal(r)
	if principal == nil {
		fail(401, "Sign in to manage this publication's team.")
	}
	input := Row{"action": action, "actorSubject": principal["subject"]}
	for key, value := range fields {
		input[key] = value
	}
	// Caller-supplied fields can never substitute the actor or publication.
	input["actorSubject"], input["action"] = principal["subject"], action
	result, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-team", input)
	requireCentralSuccess(result, status)
	return result
}
func (a *App) teamList(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "list", Row{}))
}

func (a *App) teamMembersPage(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "list_members", teamPageInput(r)))
}

func (a *App) teamInvitationsPage(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "list_invitations", teamPageInput(r)))
}

func teamPageInput(r *http.Request) Row {
	return Row{"page": teamPageNumber(r, "page", 1, 2147483647), "pageSize": teamPageNumber(r, "pageSize", 10, 100)}
}

func teamPageNumber(r *http.Request, name string, fallback, maximum int) int {
	values, present := r.URL.Query()[name]
	if !present {
		return fallback
	}
	if len(values) != 1 {
		fail(400, "Use one "+name+" parameter.")
	}
	value, err := strconv.Atoi(values[0])
	if err != nil || value < 1 || value > maximum {
		fail(400, name+" must be a whole number from 1 to "+strconv.Itoa(maximum)+".")
	}
	return value
}
func (a *App) teamInvite(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-invite", 30, time.Hour, true)
	input := body(w, r)
	strict(input, "email", "role", "articleId")
	email := emailField(input, "email", true)
	role := enumField(input, "role", "owner", "writer", "publisher", "peer_reviewer")
	if role == "peer_reviewer" {
		a.inviteCentralPeer(w, r, input)
		return
	}
	send(w, 201, a.centralTeamRequest(r, "invite", Row{"email": email, "role": role}))
}
func (a *App) teamResend(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-invite", 30, time.Hour, true)
	strict(body(w, r))
	send(w, 200, a.centralTeamRequest(r, "resend", Row{"invitationId": r.PathValue("id")}))
}
func (a *App) teamRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "revoke", Row{"invitationId": r.PathValue("id")}))
}
func (a *App) teamUpdateMember(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "role")
	role := enumField(input, "role", "owner", "writer", "publisher", "peer_reviewer")
	send(w, 200, a.centralTeamRequest(r, "update", Row{"memberSubject": r.PathValue("id"), "role": role}))
}
func (a *App) teamRemoveMember(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "remove", Row{"memberSubject": r.PathValue("id")}))
}
func (a *App) teamAccept(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-accept", 15, 15*time.Minute, false)
	input := body(w, r)
	strict(input, "token", "email", "password")
	fields := Row{"token": stringField(input, "token", 32, 256, false), "email": emailField(input, "email", true), "password": stringField(input, "password", 1, 128, false)}
	result, status := a.centralIdentityRequest(r.Context(), "/cloud/api/engine-invite", fields)
	requireCentralSuccess(result, status)
	if !result.yes("authenticated") {
		fail(401, "Sign in with the Margin account that received this invitation.")
	}
	a.startMemberSession(w, r, result)
	send(w, 200, Row{"authenticated": true})
}

func (a *App) teamRevokeArticle(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.centralTeamRequest(r, "revoke_article", Row{"memberSubject": r.PathValue("id"), "articleId": r.PathValue("articleId")}))
}
