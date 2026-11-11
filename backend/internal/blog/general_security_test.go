package blog

import (
	"context"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestPublicPostRejectsChangesDuringStorageRead(t *testing.T) {
	for _, mutation := range []string{
		"UPDATE posts SET status='draft' WHERE id=$1",
		"UPDATE posts SET status='archived' WHERE id=$1",
		"UPDATE posts SET revision='replacement' WHERE id=$1",
		"DELETE FROM posts WHERE id=$1",
	} {
		t.Run(mutation, func(t *testing.T) {
			a, storage := coreFixture(t)
			post := readableFixturePost(t, a, "published", "withdrawn", "WITHDRAWN PRIVATE BODY")
			storage.onGet = func(string) {
				a.DB.Must(context.Background(), mutation, post["id"])
			}
			response := request(t, a, "GET", "/api/public/posts/withdrawn?fields=content,title", nil, false)
			expectStatus(t, response, 404)
			if strings.Contains(response.Body.String(), "WITHDRAWN PRIVATE BODY") {
				t.Fatal("a changed article was exposed by the public API")
			}
		})
	}
}

func TestLocalLoginRejectsPasswordSuffixBeyondBcryptLimit(t *testing.T) {
	for _, password := range []string{strings.Repeat("a", 72), strings.Repeat("é", 36)} {
		t.Run(password[:2], func(t *testing.T) {
			a, _ := coreFixture(t)
			digest, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
			if err != nil {
				t.Fatal(err)
			}
			a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "owner@example.com", string(digest))
			input := Row{"email": "owner@example.com", "password": password + "different"}
			response := request(t, a, "POST", "/api/login", input, false)
			expectStatus(t, response, 401)
			if len(response.Result().Cookies()) != 0 {
				t.Fatal("incorrect password created a session")
			}
			input["password"] = password
			expectStatus(t, request(t, a, "POST", "/api/login", input, false), 200)
		})
	}
}
