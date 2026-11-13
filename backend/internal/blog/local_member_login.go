package blog

import (
	"golang.org/x/crypto/bcrypt"
	"net/http"
)

func (a *App) localUserPasswordLogin(w http.ResponseWriter, r *http.Request, email, password string) bool {
	user := first(a.DB.Must(r.Context(), "SELECT * FROM engine_users WHERE email=$1", email))
	if user == nil {
		return false
	}
	if len([]byte(password)) > 72 || bcrypt.CompareHashAndPassword([]byte(user.str("password_hash")), []byte(password)) != nil {
		fail(401, "Email or password is incorrect.")
	}
	principal := a.localMemberPrincipal(r.Context(), user.str("id"))
	if principal == nil {
		fail(401, "Email or password is incorrect.")
	}
	principal["authVersion"] = user["auth_version"]
	a.startMemberSession(w, r, principal)
	send(w, 200, Row{"authenticated": true})
	return true
}
