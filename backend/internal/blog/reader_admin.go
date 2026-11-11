package blog

import (
	"context"
	"net/http"
	"strconv"
)

func (a *App) readerAdminRoutes() {
	a.guideAnalyticsRoutes()
	a.mux.HandleFunc("GET /api/settings/readers", func(w http.ResponseWriter, r *http.Request) { send(w, 200, a.readerPreferences(r.Context())) })
	a.mux.HandleFunc("PUT /api/settings/readers", a.saveReaderPreferences)
	a.mux.HandleFunc("GET /api/readers/subscribers", a.readerSubscribers)
}
func conversationMode(visible, enabled bool) string {
	if !visible {
		return "hidden"
	}
	if !enabled {
		return "closed"
	}
	return "open"
}
func (a *App) readerPreferences(ctx context.Context) Row {
	interactions := a.interactionSettings(ctx)
	comments := object(a.settings(ctx)["comments"])
	result := Row{"newsletter": a.newsletterSettings(ctx)["enabled"], "comments": conversationMode(comments.yes("visible"), comments.yes("enabled")), "questions": interactions["questions"], "notes": interactions["notes"], "editPolicy": interactions["editPolicy"]}
	for key, value := range a.commentPolicy(ctx) {
		result[key] = value
	}
	return result
}
func validReaderPreferences(input Row) Row {
	strict(input, "newsletter", "comments", "questions", "notes", "editPolicy", "requireEmailVerification", "requireApproval", "requireSignIn")
	// Accept the old field for compatibility, but it cannot override comments.
	if _, ok := input["questions"]; ok {
		enumField(input, "questions", "open", "closed", "hidden")
	}
	mode := enumField(input, "comments", "open", "closed", "hidden")
	result := Row{"newsletter": booleanField(input, "newsletter"), "comments": mode, "questions": mode, "notes": booleanField(input, "notes"), "editPolicy": enumField(input, "editPolicy", "keep", "hide")}
	for _, key := range []string{"requireEmailVerification", "requireApproval"} {
		if _, ok := input[key]; ok {
			result[key] = booleanField(input, key)
		}
	}
	return result
}
func (a *App) saveReaderPreferences(w http.ResponseWriter, r *http.Request) {
	input := validReaderPreferences(body(w, r))
	policy := a.updatedCommentPolicy(r.Context(), input)
	newsletter := a.newsletterSettings(r.Context())
	if input.yes("newsletter") && !newsletter.yes("enabled") && newsletter.str("delivery") == "managed" {
		a.require(r.Context(), "newsletter")
	}
	newsletter["enabled"] = input["newsletter"]
	interactions := validInteractions(Row{"enabled": false, "questions": input["questions"], "notes": input["notes"], "editPolicy": input["editPolicy"]})
	tx, err := a.DB.SQL.BeginTx(r.Context(), nil)
	must(err)
	defer tx.Rollback()
	a.execInteraction(r.Context(), tx, "INSERT INTO site_settings(name,configuration) VALUES('comment-policy',$1) ON CONFLICT(name) DO UPDATE SET configuration=EXCLUDED.configuration", encode(policy))
	a.execInteraction(r.Context(), tx, "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO NOTHING", encode(defaultTheme()))
	a.execInteraction(r.Context(), tx, "INSERT INTO site_settings(name,configuration) VALUES('interactions',$1) ON CONFLICT(name) DO UPDATE SET configuration=EXCLUDED.configuration", encode(interactions))
	a.execInteraction(r.Context(), tx, "INSERT INTO newsletter_settings(id,configuration) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET configuration=EXCLUDED.configuration", encode(newsletter))
	query := "UPDATE settings SET theme=jsonb_set(jsonb_set(theme,'{comments,visible}',$1::jsonb),'{comments,enabled}',$2::jsonb) WHERE id=1"
	if a.DB.Kind == "sqlite" {
		query = "UPDATE settings SET theme=json_set(theme,'$.comments.visible',json($1),'$.comments.enabled',json($2)) WHERE id=1"
	}
	a.execInteraction(r.Context(), tx, query, encode(input.str("comments") != "hidden"), encode(input.str("comments") == "open"))
	must(tx.Commit())
	for key, value := range policy {
		input[key] = value
	}
	send(w, 200, input)
}
func (a *App) readerSubscribers(w http.ResponseWriter, r *http.Request) {
	offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
	if r.URL.Query().Get("offset") != "" && (err != nil || offset < 0) {
		fail(400, "Invalid subscriber offset.")
	}
	rows := a.DB.Must(r.Context(), "SELECT email,status,created_at,confirmed_at FROM newsletter_subscribers ORDER BY created_at DESC,email LIMIT 100 OFFSET $1", offset)
	more := false
	if len(rows) == 100 {
		more = first(a.DB.Must(r.Context(), "SELECT 1 AS present FROM newsletter_subscribers ORDER BY created_at DESC,email LIMIT 1 OFFSET $1", offset+100)) != nil
	}
	if rows == nil {
		rows = []Row{}
	}
	send(w, 200, Row{"subscribers": rows, "hasMore": more})
}
