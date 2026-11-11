package blog

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestSettingsSoftwareUpdateUsesHostedBinding(t *testing.T) {
	a := cloudOwnerFixture(t)
	path := "/api/settings/software-update"
	expectStatus(t, request(t, a, "POST", path, Row{}, false), 401)
	expectStatus(t, request(t, a, "POST", path, Row{}, true), 403)
	if responseRow(t, request(t, a, "GET", path, nil, true), 200).yes("hosted") {
		t.Fatal("self-hosted update available")
	}
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	a.Version = "1.2.3"
	a.Client = &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return hostedSoftwareUpdateResponse(t, r)
	})}
	if status := responseRow(t, request(t, a, "GET", path, nil, true), 200); status.str("state") != "available" || status.str("version") != "1.2.3" {
		t.Fatal(status)
	}
	status := responseRow(t, request(t, a, "POST", path, Row{}, true), 200)
	if !status.yes("hosted") || status.str("version") != "1.2.3" || status.str("state") != "updating" {
		t.Fatal(status)
	}
}

func hostedSoftwareUpdateResponse(t *testing.T, r *http.Request) (*http.Response, error) {
	t.Helper()
	var input Row
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		t.Fatal(err)
	}
	if r.URL.String() != "https://margin.example/cloud/api/engine-update" || r.Header.Get("Authorization") != "Bearer "+strings.Repeat("s", 32) || input.str("subject") != "central-owner-id" {
		t.Fatal("unexpected Central update request")
	}
	switch input.str("action") {
	case "status":
		return fixtureResponse(Row{"state": "available"}), nil
	case "install":
		return fixtureResponse(Row{"state": "updating"}), nil
	default:
		t.Fatal("unexpected update action")
		return nil, nil
	}
}
