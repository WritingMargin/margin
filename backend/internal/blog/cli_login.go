package blog

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var cliHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (a *App) cliLoginRoutes() {
	a.mux.HandleFunc("POST /api/cli/login", a.startCLILogin)
	a.mux.HandleFunc("POST /api/cli/poll", a.pollCLILogin)
	a.mux.HandleFunc("POST /api/tokens/cli/approve", a.approveCLILogin)
}

func (a *App) startCLILogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "cli-login", 10, 10*time.Minute, false)
	input := body(w, r)
	strict(input, "tokenHash")
	tokenHash := stringField(input, "tokenHash", 64, 64, false)
	if !cliHashPattern.MatchString(tokenHash) {
		fail(400, "Invalid CLI credential hash.")
	}
	device := token()
	code := strings.ToUpper(hash(token())[:12])
	code = code[:4] + "-" + code[4:8] + "-" + code[8:]
	expires := time.Now().Add(10 * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	a.DB.Must(r.Context(), "DELETE FROM cli_logins WHERE expires_at<=NOW()")
	a.DB.Must(r.Context(), "INSERT INTO cli_logins(device_hash,code_hash,token_hash,expires_at) VALUES($1,$2,$3,$4)", hash(device), hash(code), tokenHash, expires)
	send(w, 201, Row{"deviceCode": device, "userCode": code, "expiresIn": 600, "interval": 2})
}

func (a *App) pollCLILogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "cli-poll", 360, 10*time.Minute, false)
	input := body(w, r)
	strict(input, "deviceCode")
	device := stringField(input, "deviceCode", 40, 100, false)
	row := first(a.DB.Must(r.Context(), "SELECT token_hash FROM cli_logins WHERE device_hash=$1 AND expires_at>NOW()", hash(device)))
	if row == nil {
		coded(410, "This CLI connection expired. Run margin login again.", "LOGIN_EXPIRED")
	}
	approved := len(a.DB.Must(r.Context(), "SELECT token_hash FROM api_tokens WHERE token_hash=$1", row["token_hash"])) > 0
	send(w, 200, Row{"approved": approved})
}

func (a *App) approveCLILogin(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "cli-approve", 15, 10*time.Minute, true)
	input := body(w, r)
	strict(input, "code")
	code := strings.ToUpper(strings.TrimSpace(stringField(input, "code", 1, 30, true)))
	err := a.approveCLICode(r.Context(), code)
	if errors.Is(err, sql.ErrNoRows) {
		fail(410, "This connection code expired or was already approved. Check your terminal or run margin login again.")
	}
	must(err)
	send(w, 201, Row{"connected": true})
}

func (a *App) approveCLICode(ctx context.Context, code string) error {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Consume the human code and activate its credential in the same transaction.
	query, args := a.DB.adapt("UPDATE cli_logins SET code_hash=$1 WHERE code_hash=$2 AND expires_at>NOW() RETURNING token_hash", []any{hash(token()), hash(code)})
	var digest string
	if err = tx.QueryRowContext(ctx, query, args...).Scan(&digest); err != nil {
		return err
	}
	query, args = a.DB.adapt("INSERT INTO api_tokens(token_hash,name) VALUES($1,$2) ON CONFLICT(token_hash) DO NOTHING", []any{digest, "CLI " + code})
	if _, err = tx.ExecContext(ctx, query, args...); err != nil {
		return err
	}
	return tx.Commit()
}
