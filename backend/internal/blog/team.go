package blog

import (
	"net/http"
	"strconv"
	"time"
)

func (a *App) teamRoutes() {
	a.mux.HandleFunc("GET /api/public/team/invitation", a.teamInvitation)
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
func (a *App) teamList(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "list", Row{}))
}

func (a *App) teamMembersPage(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "list_members", teamPageInput(r)))
}

func (a *App) teamInvitationsPage(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "list_invitations", teamPageInput(r)))
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
		a.inviteLocalPeer(w, r, input)
		return
	}
	send(w, 201, a.localTeamRequest(r, "invite", Row{"email": email, "role": role}))
}
func (a *App) teamResend(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "team-invite", 30, time.Hour, true)
	strict(body(w, r))
	send(w, 200, a.localTeamRequest(r, "resend", Row{"invitationId": r.PathValue("id")}))
}
func (a *App) teamRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "revoke", Row{"invitationId": r.PathValue("id")}))
}
func (a *App) teamUpdateMember(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "role")
	role := enumField(input, "role", "owner", "writer", "publisher", "peer_reviewer")
	send(w, 200, a.localTeamRequest(r, "update", Row{"memberSubject": r.PathValue("id"), "role": role}))
}
func (a *App) teamRemoveMember(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "remove", Row{"memberSubject": r.PathValue("id")}))
}
func (a *App) teamRevokeArticle(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.localTeamRequest(r, "revoke_article", Row{"memberSubject": r.PathValue("id"), "articleId": r.PathValue("articleId")}))
}
