package blog

import (
	cli "margin-cli"
	"net/http"
)

func (a *App) deploymentConfig(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "server", "publicUrl", "upstream", "hosted")
	server := enumField(input, "server", "nginx", "apache")
	publicURL := stringField(input, "publicUrl", 1, 2048, true)
	upstream := stringField(input, "upstream", 1, 512, true)
	config, err := cli.GenerateDeployment(server, publicURL, upstream)
	if input.yes("hosted") {
		if a.cloudOwner(r.Context()).str("subject") == "" {
			fail(400, "Hosted configuration requires a hosted publication.")
		}
		if server != "nginx" {
			fail(400, "Choose Nginx for a hosted proxy.")
		}
		hosting, hostingErr := a.hostingAddress(r.Context(), nil)
		if hostingErr != nil {
			fail(503, "The assigned Margin address is unavailable. Try again later.")
		}
		config, err = cli.GenerateHostedProxy(publicURL, hosting.str("assignedUrl"))
	}
	if err != nil {
		fail(400, err.Error())
	}
	send(w, 200, Row{"config": config, "filename": "margin-" + server + ".conf"})
}
