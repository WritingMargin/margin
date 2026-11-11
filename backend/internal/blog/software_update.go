package blog

import (
	"net/http"
	"os"
	"time"
)

func (a *App) softwareUpdate(w http.ResponseWriter, r *http.Request) {
	binding := a.cloudOwner(r.Context())
	if binding.str("subject") == "" {
		if r.Method == "POST" {
			fail(403, "Software updates are available for hosted publications.")
		}
		send(w, 200, Row{"hosted": false})
		return
	}
	action := "status"
	if r.Method == "POST" {
		strict(body(w, r))
		action = "install"
	}
	origin := cloudCentralOrigin(binding.str("centralOrigin"))
	input := Row{"subject": binding["subject"], "action": action}
	result, status, err := a.fetchJSON(r.Context(), "POST", origin+"/cloud/api/engine-update", input, map[string]string{"Authorization": "Bearer " + os.Getenv("SETUP_TOKEN"), "Content-Type": "application/json"}, 10*time.Second)
	if err != nil || status != 200 {
		if action == "status" {
			send(w, 200, Row{"hosted": true, "version": a.Version, "state": "unavailable"})
			return
		}
		fail(503, "Could not confirm the update with Margin Central. Check its status before trying again.")
	}
	send(w, 200, Row{"hosted": true, "version": a.Version, "state": result.str("state")})
}
