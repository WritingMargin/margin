package blog

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestRotationRejectsUnknownTableAndColumn(t *testing.T) {
	for _, setting := range []rotationSetting{
		{table: "newsletter_smtp; DROP TABLE posts; --", column: "encrypted_configuration"},
		{table: "newsletter_smtp", column: "encrypted_token"},
	} {
		// Rejection must happen before touching the database.
		if err := applyRotationSetting(context.Background(), nil, setting); err == nil {
			t.Fatal("accepted an unknown rotation target")
		}
	}
}

func TestCommentCallbackRevalidatesStoredReturnPath(t *testing.T) {
	a, _ := coreFixture(t)
	for _, target := range []string{"https://other.test/", "//other.test/", `/\other.test/`, "/post/room\r\nLocation: https://other.test"} {
		state := newsletterToken()
		a.DB.Must(context.Background(), "INSERT INTO comment_auth_flows(state_hash,verifier,return_path,expires_at) VALUES($1,$2,$3,$4)", hash(state), newsletterToken(), target, commentAuthExpiry(time.Minute))
		cookie := &http.Cookie{Name: sessionCookieName("margin_comment_flow"), Value: state}
		response := commentAuthRequest(a, "GET", "/reader/auth/callback?error=denied&state="+state, nil, cookie, "")
		expectStatus(t, response, 400)
		if response.Header().Get("Location") != "" {
			t.Errorf("unsafe target %q produced a redirect", target)
		}
	}
}
