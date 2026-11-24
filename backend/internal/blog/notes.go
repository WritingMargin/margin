package blog

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

type noteActor struct {
	id, name, email, role string
}

func (a *App) noteRoutes() {
	a.mux.HandleFunc("GET /api/notes", a.listWorkspaceNotes)
	a.mux.HandleFunc("POST /api/notes", a.createWorkspaceNote)
	a.mux.HandleFunc("GET /api/notes/{id}", a.readWorkspaceNote)
	a.mux.HandleFunc("PUT /api/notes/{id}", a.updateWorkspaceNote)
	a.mux.HandleFunc("DELETE /api/notes/{id}", a.deleteWorkspaceNote)
	a.mux.HandleFunc("POST /api/notes/{id}/share", a.shareWorkspaceNote)
	a.mux.HandleFunc("POST /api/notes/{id}/duplicate", a.duplicateWorkspaceNote)
	a.mux.HandleFunc("GET /api/public/notes/{token}", a.readSharedNote)
	a.mux.HandleFunc("GET /note/{token}", a.workspaceHTML)
}

func (a *App) currentNoteActor(r *http.Request) noteActor {
	if value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return a.tokenNoteActor(r, value)
	}
	if principal := a.browserPrincipal(r); principal != nil && principal.str("subject") != "" {
		return noteActor{
			id:    principal.str("subject"),
			name:  fallbackName(principal.str("name"), principal.str("email")),
			email: principal.str("email"),
			role:  principal.str("role"),
		}
	}
	return a.ownerNoteActor(r.Context(), "owner")
}

func (a *App) tokenNoteActor(r *http.Request, value string) noteActor {
	if strings.HasPrefix(value, "moat_") {
		principal := a.oauthPrincipal(r, value)
		if principal != nil && principal.str("subject") != "" {
			return noteActor{
				id:    principal.str("subject"),
				name:  fallbackName(principal.str("name"), principal.str("email")),
				email: principal.str("email"),
				role:  principal.str("role"),
			}
		}
	}
	return a.ownerNoteActor(r.Context(), a.requestRole(r))
}

func (a *App) ownerNoteActor(ctx context.Context, role string) noteActor {
	owner := first(a.DB.Must(ctx, "SELECT email FROM admins WHERE id=1"))
	email := ""
	if owner != nil {
		email = owner.str("email")
	}
	profileName := strings.TrimSpace(a.publicAuthorProfile(ctx).str("name"))
	return noteActor{
		id:    "local-owner",
		name:  fallbackName(profileName, email),
		email: email,
		role:  role,
	}
}

func fallbackName(name, email string) string {
	if strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	if strings.TrimSpace(email) != "" {
		return strings.TrimSpace(email)
	}
	return "Owner"
}

func validNoteLinks(raw any) []Row {
	if raw == nil {
		return []Row{}
	}
	items, ok := raw.([]any)
	if !ok || len(items) > 50 {
		fail(400, "links: provide up to 50 valid links.")
	}
	out := make([]Row, 0, len(items))
	for _, item := range items {
		out = append(out, validNoteLink(item))
	}
	return out
}

func validNoteLink(item any) Row {
	entry, ok := item.(map[string]any)
	if !ok {
		fail(400, "links: each link must be an object.")
	}
	row := Row(entry)
	strict(row, "url", "title")
	address := stringField(row, "url", 1, 2048, true)
	parsed, err := url.Parse(address)
	if err != nil || parsed.User != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		fail(400, "links: use valid http or https URLs.")
	}
	title := ""
	if _, exists := row["title"]; exists {
		title = stringField(row, "title", 0, 200, true)
	}
	return Row{"url": address, "title": title}
}

func validNoteInput(input Row, existing Row) Row {
	strict(input, "title", "content", "links", "isPublic")
	result := Row{
		"title":    "",
		"content":  "",
		"links":    []Row{},
		"isPublic": false,
	}
	if existing != nil {
		result["title"] = existing.str("title")
		result["content"] = existing.str("content")
		result["links"] = normalizedNoteLinks(existing["links"])
		result["isPublic"] = existing.yes("is_public")
	}
	if _, ok := input["title"]; ok {
		result["title"] = stringField(input, "title", 0, 200, true)
	}
	if _, ok := input["content"]; ok {
		result["content"] = stringField(input, "content", 0, 50000, false)
	}
	if _, ok := input["links"]; ok {
		result["links"] = validNoteLinks(input["links"])
	}
	if _, ok := input["isPublic"]; ok {
		result["isPublic"] = booleanField(input, "isPublic")
	}
	return result
}

func normalizedNoteLinks(raw any) []Row {
	items, ok := raw.([]any)
	if !ok {
		return []Row{}
	}
	out := make([]Row, 0, len(items))
	for _, item := range items {
		entry := object(item)
		if entry.str("url") != "" {
			out = append(out, Row{"url": entry.str("url"), "title": entry.str("title")})
		}
	}
	return out
}

func noteResponse(row Row, actor noteActor) Row {
	isAuthor := row.str("author_id") == actor.id
	canDelete := isAuthor || (actor.role == "owner" && row.yes("is_public"))
	shareToken := row.str("share_token")
	result := Row{
		"id":          row["id"],
		"authorId":    row["author_id"],
		"authorName":  row["author_name"],
		"authorEmail": row["author_email"],
		"title":       row["title"],
		"content":     row["content"],
		"links":       normalizedNoteLinks(row["links"]),
		"isPublic":    row.yes("is_public"),
		"shared":      shareToken != "",
		"canEdit":     isAuthor,
		"canDelete":   canDelete,
		"createdAt":   row["created_at"],
		"updatedAt":   row["updated_at"],
	}
	if shareToken != "" {
		result["shareUrl"] = sitePath("/note/" + shareToken)
	}
	if isAuthor && shareToken != "" {
		result["shareToken"] = shareToken
	}
	return result
}

func (a *App) getVisibleNote(ctx context.Context, id string, actor noteActor) Row {
	if !uuidRE.MatchString(id) {
		fail(404, "Note not found.")
	}
	row := first(a.DB.Must(ctx, "SELECT * FROM workspace_notes WHERE id=$1", id))
	if row == nil || (row.str("author_id") != actor.id && !row.yes("is_public")) {
		fail(404, "Note not found.")
	}
	return row
}

// @Summary List workspace notes
// @ID listNotes
// @Description List workspace notes created by the current author and public notes shared by teammates, ordered by most recently updated.
// @Tags Notes
// @Produce json
// @Security BearerAuth
// @Success 200 {array} APIWorkspaceNote
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Router /api/notes [get]
func (a *App) listWorkspaceNotes(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	rows := a.DB.Must(r.Context(),
		"SELECT * FROM workspace_notes WHERE author_id=$1 OR is_public=TRUE ORDER BY updated_at DESC,id DESC",
		actor.id,
	)
	result := make([]Row, 0, len(rows))
	for _, row := range rows {
		result = append(result, noteResponse(row, actor))
	}
	send(w, 200, result)
}

// @Summary Create a workspace note
// @ID createNote
// @Description Create a private workspace note or set isPublic true to share it with teammates. Supports Markdown content, uploaded media image references, and up to 50 HTTP/HTTPS links.
// @Tags Notes
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param input body APIWorkspaceNoteInput true "Workspace note fields"
// @Success 201 {object} APIWorkspaceNote
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Router /api/notes [post]
func (a *App) createWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	input := validNoteInput(optionalBody(w, r), nil)
	id := uuid()
	rows := a.DB.Must(r.Context(),
		`INSERT INTO workspace_notes(id,author_id,author_name,author_email,title,content,links,is_public)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
		id, actor.id, actor.name, actor.email, input["title"], input["content"], encode(input["links"]), input["isPublic"],
	)
	send(w, 201, noteResponse(rows[0], actor))
}

// @Summary Read a workspace note
// @ID readNote
// @Description Read a single workspace note if owned by the current author or marked public to teammates.
// @Tags Notes
// @Produce json
// @Security BearerAuth
// @Param id path string true "Note ID"
// @Success 200 {object} APIWorkspaceNote
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/notes/{id} [get]
func (a *App) readWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	row := a.getVisibleNote(r.Context(), r.PathValue("id"), actor)
	send(w, 200, noteResponse(row, actor))
}

// @Summary Update a workspace note
// @ID updateNote
// @Description Update selected fields on a workspace note owned by the current author. Omitted fields remain unchanged.
// @Tags Notes
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Note ID"
// @Param input body APIWorkspaceNoteInput true "Updated note fields"
// @Success 200 {object} APIWorkspaceNote
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/notes/{id} [put]
func (a *App) updateWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	existing := a.getVisibleNote(r.Context(), r.PathValue("id"), actor)
	if existing.str("author_id") != actor.id {
		fail(403, "Only the author of this note can edit it.")
	}
	input := validNoteInput(body(w, r), existing)
	rows := a.DB.Must(r.Context(),
		`UPDATE workspace_notes SET title=$1,content=$2,links=$3,is_public=$4,updated_at=NOW()
		 WHERE id=$5 RETURNING *`,
		input["title"], input["content"], encode(input["links"]), input["isPublic"], existing["id"],
	)
	send(w, 200, noteResponse(rows[0], actor))
}

// @Summary Delete a workspace note
// @ID deleteNote
// @Description Permanently delete a workspace note authored by the caller, or a public teammate note when called by an owner.
// @Tags Notes
// @Produce json
// @Security BearerAuth
// @Param id path string true "Note ID"
// @Success 200 {object} APIOK
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/notes/{id} [delete]
func (a *App) deleteWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	existing := a.getVisibleNote(r.Context(), r.PathValue("id"), actor)
	isAuthor := existing.str("author_id") == actor.id
	if !isAuthor && !(actor.role == "owner" && existing.yes("is_public")) {
		fail(403, "Only the author or an owner can delete this note.")
	}
	a.DB.Must(r.Context(), "DELETE FROM workspace_notes WHERE id=$1", existing["id"])
	send(w, 200, Row{"ok": true})
}

// @Summary Configure external sharing for a workspace note
// @ID shareNote
// @Description Enable, disable, or regenerate the external read-only share link for a workspace note owned by the current author.
// @Tags Notes
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Note ID"
// @Param input body APIShareWorkspaceNoteInput true "Share link configuration"
// @Success 200 {object} APIWorkspaceNote
// @Failure 400 {object} APIError
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/notes/{id}/share [post]
func (a *App) shareWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	existing := a.getVisibleNote(r.Context(), r.PathValue("id"), actor)
	if existing.str("author_id") != actor.id {
		fail(403, "Only the author can change share links for this note.")
	}
	input := body(w, r)
	strict(input, "enabled", "regenerate")
	enabled := booleanField(input, "enabled")
	regenerate := false
	if _, ok := input["regenerate"]; ok {
		regenerate = booleanField(input, "regenerate")
	}
	nextToken := ""
	if enabled {
		nextToken = existing.str("share_token")
		if nextToken == "" || regenerate {
			nextToken = token()
		}
	}
	rows := a.DB.Must(r.Context(),
		"UPDATE workspace_notes SET share_token=$1,updated_at=NOW() WHERE id=$2 RETURNING *",
		nextToken, existing["id"],
	)
	send(w, 200, noteResponse(rows[0], actor))
}

// @Summary Duplicate a workspace note
// @ID duplicateNote
// @Description Create a new private editable copy of any visible workspace note under the current author.
// @Tags Notes
// @Produce json
// @Security BearerAuth
// @Param id path string true "Note ID"
// @Success 201 {object} APIWorkspaceNote
// @Failure 401 {object} APIError
// @Failure 403 {object} APIError
// @Failure 404 {object} APIError
// @Router /api/notes/{id}/duplicate [post]
func (a *App) duplicateWorkspaceNote(w http.ResponseWriter, r *http.Request) {
	actor := a.currentNoteActor(r)
	source := a.getVisibleNote(r.Context(), r.PathValue("id"), actor)
	title := strings.TrimSpace(source.str("title"))
	if title == "" {
		title = "Untitled note (copy)"
	} else if utf8.RuneCountInString(title) <= 193 {
		title += " (copy)"
	}
	rows := a.DB.Must(r.Context(),
		`INSERT INTO workspace_notes(id,author_id,author_name,author_email,title,content,links,is_public)
		 VALUES($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING *`,
		uuid(), actor.id, actor.name, actor.email, title, source.str("content"), encode(normalizedNoteLinks(source["links"])),
	)
	send(w, 201, noteResponse(rows[0], actor))
}

func (a *App) readSharedNote(w http.ResponseWriter, r *http.Request) {
	shareToken := strings.TrimSpace(r.PathValue("token"))
	if shareToken == "" || len(shareToken) > 128 {
		fail(404, "Shared note not found.")
	}
	row := first(a.DB.Must(r.Context(), "SELECT * FROM workspace_notes WHERE share_token=$1", shareToken))
	if row == nil {
		fail(404, "Shared note not found.")
	}
	send(w, 200, Row{
		"id":         row["id"],
		"title":      row["title"],
		"content":    row["content"],
		"links":      normalizedNoteLinks(row["links"]),
		"authorName": row["author_name"],
		"createdAt":  row["created_at"],
		"updatedAt":  row["updated_at"],
	})
}

func (a *App) coverInSharedNote(ctx context.Context, shareToken, address string) bool {
	shareToken = strings.TrimSpace(shareToken)
	if shareToken == "" || len(shareToken) > 128 {
		return false
	}
	row := first(a.DB.Must(ctx, "SELECT content FROM workspace_notes WHERE share_token=$1 LIMIT 1", shareToken))
	return row != nil && strings.Contains(row.str("content"), address)
}

func (a *App) loadAttachedWritingNotes(r *http.Request, ids []string) []Row {
	if len(ids) == 0 {
		return nil
	}
	actor := a.currentNoteActor(r)
	notes := make([]Row, 0, len(ids))
	for _, id := range ids {
		if !uuidRE.MatchString(id) {
			fail(400, "attachedNoteIds: invalid UUID")
		}
		row := a.getVisibleNote(r.Context(), id, actor)
		notes = append(notes, writingAttachedNote(row))
	}
	return notes
}

func writingAttachedNote(row Row) Row {
	title := strings.TrimSpace(row.str("title"))
	if title == "" {
		title = "Untitled note"
	}
	note := Row{
		"id":      row["id"],
		"title":   title,
		"content": clipRunes(row.str("content"), 8000),
	}
	if links := normalizedNoteLinks(row["links"]); len(links) > 0 {
		note["links"] = links
	}
	return note
}

func clipRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "\n[…]"
}
