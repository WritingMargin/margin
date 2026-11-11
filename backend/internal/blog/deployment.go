package blog

import (
	cli "margin-cli"
	"net/http"
)

func (a *App) deploymentConfig(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "server", "publicUrl", "upstream")
	server := enumField(input, "server", "nginx", "apache")
	publicURL := stringField(input, "publicUrl", 1, 2048, true)
	upstream := stringField(input, "upstream", 1, 512, true)
	config, err := cli.GenerateDeployment(server, publicURL, upstream)
	if err != nil {
		fail(400, err.Error())
	}
	send(w, 200, Row{"config": config, "filename": "margin-" + server + ".conf"})
}
