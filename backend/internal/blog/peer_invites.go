package blog

import "net/http"

func (a *App) invitePeer(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	input["articleId"] = r.PathValue("id")
	input["role"] = "peer_reviewer"
	a.inviteLocalPeer(w, r, input)
}
