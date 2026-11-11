package blog

import "testing"

func TestDeploymentConfigRequiresOwnerAndDoesNotSaveSettings(t *testing.T) {
	app, _ := coreFixture(t)
	input := Row{"server": "nginx", "publicUrl": "https://usefused.com/blog", "upstream": "http://127.0.0.1:30010"}
	expectStatus(t, request(t, app, "POST", "/api/settings/deployment", input, false), 401)
	for _, server := range []string{"nginx", "apache"} {
		input["server"] = server
		result := responseRow(t, request(t, app, "POST", "/api/settings/deployment", input, true), 200)
		containsHTML(t, result.str("config"), "PUBLIC_URL=https://usefused.com/blog", "MARGIN_BASE_PATH=/blog", "http://127.0.0.1:30010")
		if result.str("filename") != "margin-"+server+".conf" {
			t.Fatal("unexpected download filename")
		}
	}
	saved := responseRow(t, request(t, app, "GET", "/api/settings/domain", nil, true), 200)
	if saved.str("url") != "" {
		t.Fatal("generating a template changed the public address")
	}
}

func TestDeploymentConfigRejectsInvalidInput(t *testing.T) {
	app, _ := coreFixture(t)
	for key, value := range map[string]string{"server": "caddy", "publicUrl": "https://example.com;bad", "upstream": "http://127.0.0.1:3001;bad"} {
		input := Row{"server": "nginx", "publicUrl": "https://example.com", "upstream": "http://127.0.0.1:3001"}
		input[key] = value
		expectStatus(t, request(t, app, "POST", "/api/settings/deployment", input, true), 400)
	}
}
