package blog

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func passwordRecoveryFixture(t *testing.T) (*App, *[]Row) {
	t.Helper()
	a, _ := coreFixture(t)
	t.Setenv("PUBLIC_URL", "https://blog.example.test")
	digest, err := bcrypt.GenerateFromPassword([]byte("old-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "owner@example.test", string(digest))
	a.DB.Must(context.Background(), "INSERT INTO owner_email_verification(id,email,verified_at) VALUES(1,$1,NOW())", "owner@example.test")
	messages := []Row{}
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/account":
			return fixtureResponse(paidAccount()), nil
		case "/v1/newsletter/status":
			return fixtureResponse(Row{"ready": true}), nil
		case "/v1/newsletter/owner-password-reset", "/v1/newsletter/member-password-reset":
			var input Row
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			messages = append(messages, input)
			return fixtureResponse(Row{"accepted": true}), nil
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
			return fixtureResponse(Row{}), nil
		}
	})
	t.Cleanup(a.passwordMailTasks.Wait)
	return a, &messages
}

func requestPasswordRecovery(t *testing.T, a *App, email string) Row {
	t.Helper()
	out := responseRow(t, request(t, a, "POST", sitePath("/api/public/password/forgot"), Row{"email": email}, false), 202)
	a.passwordMailTasks.Wait()
	return out
}

func TestPasswordRecoveryLifecycle(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	ctx := context.Background()
	known := requestPasswordRecovery(t, a, "OWNER@example.test")
	unknown := requestPasswordRecovery(t, a, "unknown@example.test")
	if encode(known) != encode(unknown) || len(*messages) != 1 {
		t.Fatal("enumeration or incorrect delivery")
	}
	value := (*messages)[0].str("resetToken")
	if (*messages)[0].str("publicUrl") != "https://blog.example.test" {
		t.Fatal("lost mount path")
	}
	row := first(a.DB.Must(ctx, "SELECT * FROM owner_password_resets"))
	if row.str("token_hash") != hash(value) || strings.Contains(encode(row), value) {
		t.Fatal("raw token storage")
	}
	requestPasswordRecovery(t, a, "owner@example.test")
	if len(*messages) != 1 {
		t.Fatal("cooldown did not suppress duplicate email")
	}
	a.DB.Must(ctx, "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash("old-session"), "2100-01-01T00:00:00.000Z")
	response := request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-password-123"}, false)
	expectStatus(t, response, 200)
	if len(a.DB.Must(ctx, "SELECT * FROM sessions")) != 0 || response.Header().Get("Set-Cookie") != "" {
		t.Fatal("reset did not revoke sessions or automatically logged in")
	}
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.test", "password": "old-password-123"}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.test", "password": "new-password-123"}, false), 200)
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-password-456"}, false), 400)
}

func TestPasswordRecoveryEligibilityAndBinding(t *testing.T) {
	for _, scenario := range []string{"unverified", "cloud", "expired", "changed-email", "changed-password"} {
		t.Run(scenario, func(t *testing.T) {
			a, messages := passwordRecoveryFixture(t)
			ctx := context.Background()
			if scenario == "unverified" {
				a.DB.Must(ctx, "DELETE FROM owner_email_verification")
			}
			if scenario == "cloud" {
				a.DB.Must(ctx, "INSERT INTO site_settings(name,configuration) VALUES('cloud_owner',$1)", encode(Row{"subject": "central-owner", "centralOrigin": "https://central.example"}))
			}
			requestPasswordRecovery(t, a, "owner@example.test")
			if scenario == "unverified" || scenario == "cloud" {
				if len(*messages) != 0 {
					t.Fatal("ineligible account received local reset")
				}
				return
			}
			value := (*messages)[0].str("resetToken")
			switch scenario {
			case "expired":
				a.DB.Must(ctx, "UPDATE owner_password_resets SET expires_at=$1", "2000-01-01T00:00:00.000Z")
			case "changed-email":
				a.DB.Must(ctx, "UPDATE admins SET email='changed@example.test'")
			case "changed-password":
				a.DB.Must(ctx, "UPDATE admins SET password_hash='changed'")
			}
			expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-password-123"}, false), 400)
		})
	}
}

func TestPasswordRecoveryConcurrentSingleUseAndValidation(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	requestPasswordRecovery(t, a, "owner@example.test")
	value := (*messages)[0].str("resetToken")
	for _, password := range []string{"short", strings.Repeat("é", 40)} {
		expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": password}, false), 400)
	}
	var workers sync.WaitGroup
	results := make(chan int, 2)
	for range 2 {
		workers.Go(func() {
			results <- request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-password-123"}, false).Code
		})
	}
	workers.Wait()
	close(results)
	counts := map[int]int{}
	for code := range results {
		counts[code]++
	}
	if counts[200] != 1 || counts[400] != 1 {
		t.Fatal(counts)
	}
}

func TestPasswordRecoveryDeliveryFailureAndRateLimit(t *testing.T) {
	a, _ := passwordRecoveryFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	requestPasswordRecovery(t, a, "owner@example.test")
	if len(a.DB.Must(context.Background(), "SELECT * FROM owner_password_resets")) != 0 {
		t.Fatal("failed mail left token")
	}
	for range 4 {
		requestPasswordRecovery(t, a, "unknown@example.test")
	}
	expectStatus(t, request(t, a, "POST", "/api/public/password/forgot", Row{"email": "unknown@example.test"}, false), 429)
}

func TestPasswordRecoveryPreservesPublicationMount(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	requestPasswordRecovery(t, a, "owner@example.test")
	if (*messages)[0].str("publicUrl") != "https://blog.example.test/journal" {
		t.Fatal("lost publication mount")
	}
}

func TestPasswordRecoveryUsesSMTPWithoutCentral(t *testing.T) {
	a, input := smtpFixture(t)
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 200)
	config := a.ownerEmailDelivery(context.Background())
	if config.str("delivery") != "smtp" || a.accountToken(context.Background()) != "" {
		t.Fatal("local recovery requires Central")
	}
}

func TestCloudOwnerRecoveryURLAndLocalResetRejection(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	result := responseRow(t, request(t, a, "GET", "/api/session", nil, false), 200)
	if result.str("hostedOwnerRecoveryUrl") != "https://margin.example/forgot-password" {
		t.Fatal("wrong Central recovery destination")
	}
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": strings.Repeat("a", 64), "password": "new-password-123"}, false), 400)
}

func TestPasswordRecoveryRotationAndDeliveryFailure(t *testing.T) {
	a, messages := passwordRecoveryFixture(t)
	ctx := context.Background()
	requestPasswordRecovery(t, a, "owner@example.test")
	old := (*messages)[0].str("resetToken")
	a.DB.Must(ctx, "UPDATE owner_password_resets SET sent_at=$1", "2000-01-01T00:00:00.000Z")
	requestPasswordRecovery(t, a, "owner@example.test")
	if len(*messages) != 2 {
		t.Fatal("new link was not sent")
	}
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": old, "password": "new-password-123"}, false), 400)
	a.DB.Must(ctx, "UPDATE owner_password_resets SET sent_at=$1", "2000-01-01T00:00:00.000Z")
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/account" {
			return fixtureResponse(paidAccount()), nil
		}
		if r.URL.Path == "/v1/newsletter/status" {
			return fixtureResponse(Row{"ready": true}), nil
		}
		return fixtureResponse(Row{"accepted": false}), nil
	})
	requestPasswordRecovery(t, a, "owner@example.test")
	if len(a.DB.Must(ctx, "SELECT * FROM owner_password_resets")) != 0 {
		t.Fatal("failed delivery left an active reset link")
	}
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.test", "password": "old-password-123"}, false), 200)
}
