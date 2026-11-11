package blog

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func cloudOwnerFixture(t *testing.T) *App {
	a, _ := coreFixture(t)
	t.Setenv("SETUP_TOKEN", strings.Repeat("s", 32))
	t.Setenv("PUBLIC_URL", "https://notes.pages.example")
	t.Setenv("MARGIN_COOKIE_DOMAIN", "host-only")
	t.Setenv("MARGIN_ENV", "production")
	return a
}
func cloudOwnerInput() Row {
	return Row{"subject": "central-owner-id", "email": "owner@example.com", "name": "Field notes", "centralOrigin": "https://margin.example", "emailVerified": true}
}
func cloudMachineCall(a *App, path string, input Row) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "https://notes.pages.example"+path, strings.NewReader(encode(input)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+strings.Repeat("s", 32))
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestCloudOwnerBootstrapIsAtomicAndImmutable(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 200)
	owner := first(a.DB.Must(context.Background(), "SELECT * FROM admins"))
	if owner.str("email") != "owner@example.com" || owner.str("password_hash") != "cloud-managed:no-local-password" {
		t.Fatal(owner)
	}
	session := responseRow(t, request(t, a, "GET", "/api/session", nil, false), 200)
	if session.yes("setupRequired") || !session.yes("cloudManaged") || session.yes("authenticated") {
		t.Fatal(session)
	}
	input := cloudOwnerInput()
	input["subject"] = "someone-else"
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", input), 409)
	input = cloudOwnerInput()
	input["centralOrigin"] = "https://other-central.example"
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", input), 409)
	if first(a.DB.Must(context.Background(), "SELECT * FROM admins")).str("email") != "owner@example.com" {
		t.Fatal("changed owner")
	}
}
func TestCloudBootstrapCannotClaimExistingLocalOwner(t *testing.T) {
	a := cloudOwnerFixture(t)
	a.createOwner(context.Background(), "local@example.com", "local-digest", "research")
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 409)
	if a.cloudOwner(context.Background()).str("subject") != "" {
		t.Fatal("claimed a local owner")
	}
	if a.settings(context.Background()).str("publicationType") != "research" {
		t.Fatal("changed existing settings")
	}
}
func TestCloudBootstrapRequiresBackendCredential(t *testing.T) {
	a := cloudOwnerFixture(t)
	for _, headers := range []map[string]string{{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Bearer " + strings.Repeat("s", 32), "Origin": "https://notes.pages.example"}, {"Authorization": "Bearer " + strings.Repeat("s", 32), "Sec-Fetch-Site": "same-origin"}} {
		r := httptest.NewRequest("POST", "https://notes.pages.example/api/cloud/bootstrap", strings.NewReader(encode(cloudOwnerInput())))
		r.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			r.Header.Set(key, value)
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 403)
	}
	if len(a.DB.Must(context.Background(), "SELECT * FROM admins")) != 0 {
		t.Fatal("unauthorized bootstrap")
	}
}
