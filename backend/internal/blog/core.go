package blog

import (
	"context"
	"crypto/subtle"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"os"
	"time"
)

func (a *App) coreRoutes() {
	a.draftRoutes()
	a.peerRoutes()
	a.researchRoutes()
	a.mux.HandleFunc("GET /api/posts/{id}/link", a.readPostLink)
	a.mux.HandleFunc("POST /api/posts/audit", a.auditArticle)
	a.mux.HandleFunc("GET /api/settings/templates", a.readTemplates)
	a.ownerEmailRoutes()
	a.passwordRecoveryRoutes()
	a.cloudOwnerRoutes()
	a.teamRoutes()
	a.commentVerificationRoutes()
	a.commentAuthRoutes()
	routes := map[string]http.HandlerFunc{
		"GET /api/public/app": a.publicApp, "GET /api/public/search": a.publicSearch, "GET /api/posts/search": a.privateSearch,
		"GET /api/health": a.health, "GET /api/session": a.session, "POST /api/setup": a.setup, "POST /api/login": a.login, "POST /api/logout": a.logout,
		"GET /api/public/settings": a.publicSettings, "GET /api/public/posts": a.publicPosts, "GET /api/public/posts/{slug}": a.publicPost,
		"GET /api/public/posts/{id}/comments": a.publicComments, "POST /api/public/posts/{id}/comments": a.createComment,
		"GET /api/recommendations": a.recommendationConfig, "GET /api/posts/{id}/recommendations": a.readRecommendations, "GET /api/posts": a.posts, "GET /api/posts/page": a.workspacePostsPage, "GET /api/posts/{id}": a.readPost, "POST /api/posts": a.createPost, "PUT /api/posts/{id}": a.updatePost, "DELETE /api/posts/{id}": a.deletePost,
		"GET /api/posts/{id}/events":    a.postEvents,
		"GET /api/posts/{id}/revisions": a.revisionList, "GET /api/posts/{id}/revisions/{revision}": a.readRevision,
		"GET /api/posts/{id}/writing-notes": a.writingNotes, "POST /api/posts/{id}/writing-notes": a.saveWritingNote,
		"GET /api/settings": a.readSettings, "PUT /api/settings": a.saveSettings, "GET /api/settings/captcha": a.readTurnstile, "PUT /api/settings/captcha": a.saveTurnstile, "GET /api/settings/turnstile": a.readTurnstile, "PUT /api/settings/turnstile": a.saveTurnstile,
		"GET /api/comments": a.comments, "PATCH /api/comments/{id}": a.moderateComment, "DELETE /api/comments/{id}": a.deleteComment,
		"PATCH /api/tokens/{id}": a.updateToken, "GET /api/tokens": a.tokens, "POST /api/tokens": a.createToken, "DELETE /api/tokens/{id}": a.deleteToken, "GET /api/storage": a.storageStatus, "GET /api/storage/usage": a.storageUsageStatus,
	}
	for pattern, handler := range routes {
		a.mux.HandleFunc(pattern, handler)
	}
}
func (a *App) health(w http.ResponseWriter, r *http.Request) {
	a.DB.Must(r.Context(), "SELECT 1")
	send(w, 200, Row{"ok": true, "database": a.DB.Kind, "storageConfigured": a.Storage.Configured()})
}
func (a *App) session(w http.ResponseWriter, r *http.Request) {
	result := Row{"authenticated": a.authenticated(r), "setupRequired": len(a.DB.Must(r.Context(), "SELECT id FROM admins")) == 0, "storageConfigured": a.Storage.Configured(), "setupTokenRequired": env("MARGIN_ENV", "production") == "production" || os.Getenv("SETUP_TOKEN") != ""}
	binding := a.cloudOwner(r.Context())
	result["cloudManaged"] = binding.str("subject") != ""
	if result.yes("cloudManaged") {
		result["passwordRecoveryUrl"] = cloudCentralOrigin(binding.str("centralOrigin")) + "/forgot-password"
	}
	a.addSessionIdentity(r, result, binding)
	scopes, oauth := a.requestOAuthScopes(r)
	if a.requestRole(r) == "owner" && (!oauth || hasOAuthScope(scopes, "administration:manage")) && (r.Header.Get("Authorization") != "" || a.primaryOwnerSession(r)) {
		result["ownerEmail"] = a.ownerEmail(r.Context())
	}
	send(w, 200, result)
}
func (a *App) startSession(w http.ResponseWriter, r *http.Request) {
	value := token()
	expires := time.Now().Add(7 * 24 * time.Hour)
	a.DB.Must(r.Context(), "DELETE FROM sessions WHERE expires_at<NOW()")
	a.DB.Must(r.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES($1,$2)", hash(value), expires.UTC().Format("2006-01-02T15:04:05.000Z"))
	setSessionCookie(w, "margin_session", value, 7*24*60*60, expires)
}
func (a *App) setup(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "auth", 15, 15*time.Minute, false)
	if len(a.DB.Must(r.Context(), "SELECT id FROM admins LIMIT 1")) > 0 {
		coded(409, "This workspace is already set up. Please sign in.", "SETUP_COMPLETE")
	}
	expected := os.Getenv("SETUP_TOKEN")
	if env("MARGIN_ENV", "production") == "production" && expected == "" {
		fail(503, "Set SETUP_TOKEN on the server before creating a production owner account.")
	}
	input := body(w, r)
	email := emailField(input, "email", false)
	password := stringField(input, "password", 12, 128, false)
	if len([]byte(password)) > 72 {
		fail(400, "password: Password must be at most 72 UTF-8 bytes")
	}
	setupToken := ""
	if _, ok := input["setupToken"]; ok {
		setupToken = stringField(input, "setupToken", 0, 512, false)
	}
	if expected != "" && subtle.ConstantTimeCompare([]byte(hash(expected)), []byte(hash(setupToken))) != 1 {
		fail(403, "A valid setup token is required.")
	}
	kind := setupPublicationType(input)
	digest, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	must(err)
	a.createOwner(r.Context(), email, string(digest), kind)
	a.startSession(w, r)
	send(w, 201, Row{"authenticated": true, "emailVerification": a.tryOwnerVerification(r.Context())})
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "auth", 15, 15*time.Minute, false)
	input := body(w, r)
	email := emailField(input, "email", false)
	providedPassword := stringField(input, "password", 1, 128, false)
	if a.cloudPasswordLogin(w, r, email, providedPassword) {
		return
	}
	password := []byte(providedPassword)
	if len(password) > 72 {
		// Setup rejects passwords beyond bcrypt's byte limit; login must not
		// silently accept a different password with the same first 72 bytes.
		fail(401, "Email or password is incorrect.")
	}
	user := first(a.DB.Must(r.Context(), "SELECT * FROM admins WHERE id=1"))
	digest := "$2b$12$KvUWUgqpZyPFjPaa.cRP.OAk2ry.HNVJzIBZI08aWUgtHM53.S.Yq"
	if user != nil {
		digest = user.str("password_hash")
	}
	err := bcrypt.CompareHashAndPassword([]byte(digest), password)
	if user == nil || email != user.str("email") || err != nil {
		fail(401, "Email or password is incorrect.")
	}
	a.startSession(w, r)
	send(w, 200, Row{"authenticated": true})
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName("margin_session")); err == nil {
		a.DB.Must(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", hash(cookie.Value))
	}
	setSessionCookie(w, "margin_session", "", -1, time.Unix(0, 0))
	send(w, 200, Row{"ok": true})
}
func (a *App) settings(ctx context.Context) Row {
	row := first(a.DB.Must(ctx, "SELECT theme FROM settings WHERE id=1"))
	return parseTheme(row["theme"])
}
func (a *App) publicSettings(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.publicTheme(r))
}
func (a *App) readSettings(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.settings(r.Context()))
}
func (a *App) saveSettings(w http.ResponseWriter, r *http.Request) {
	theme := validTheme(body(w, r))
	a.DB.Must(r.Context(), "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", encode(theme))
	send(w, 200, theme)
}
func post(row Row) Row {
	return Row{"coverMode": lookString(row, "cover_mode", "player"), "contentType": postContentType(row), "tableOfContents": lookString(row, "toc", "off"), "featured": row.yes("featured"), "id": row["id"], "title": row["title"], "slug": row["slug"], "excerpt": row["excerpt"], "status": row["status"], "tags": row["tags"], "cover": row["cover"], "seo": row["seo"], "createdAt": row["created_at"], "updatedAt": row["updated_at"], "revision": row["revision"]}
}
func (a *App) getPost(ctx context.Context, id string) Row {
	row := first(a.DB.Must(ctx, "SELECT * FROM posts WHERE id=$1", id))
	if row == nil {
		fail(404, "Post not found.")
	}
	return row
}
func (a *App) postList(w http.ResponseWriter, r *http.Request, query string, args ...any) {
	result := []Row{}
	for _, row := range a.DB.Must(r.Context(), query, args...) {
		result = append(result, post(row))
	}
	a.sendPostResponse(w, r, 200, result)
}

// @Summary List published posts
// @ID publicPosts
// @Description Returns published posts only, newest created first. No pagination.
// @Tags Public posts
// @Produce json
// @Param status query string false "Both values return published posts only" Enums(published,all) default(published)
// @Success 200 {array} APIPostSummary
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Router /api/public/posts [get]
func (a *App) publicPosts(w http.ResponseWriter, r *http.Request) {
	status := requestedPostStatus(r, true)
	query, args := postsStatusQuery(status)
	a.postList(w, r, query+" ORDER BY created_at DESC", args...)
}

// @Summary List posts
// @ID posts
// @Description Returns every matching post, newest updated first. No pagination.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param status query string false "Filter by lifecycle status" Enums(draft,published,archived,all) default(all)
// @Success 200 {array} APIPostSummary
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Router /api/posts [get]
func (a *App) posts(w http.ResponseWriter, r *http.Request) {
	query, args := postsStatusQuery(requestedPostStatus(r, false))
	a.postList(w, r, query+" ORDER BY updated_at DESC", args...)
}
func (a *App) postContent(ctx context.Context, row Row) Row {
	content, err := a.Storage.Get(ctx, row.str("content_key"))
	must(err)
	result := post(row)
	result["content"] = string(content)
	return result
}

// @Summary Read a published post by slug
// @ID publicPost
// @Description Draft and archived posts return 404.
// @Tags Public posts
// @Produce json
// @Param slug path string true "Slug"
// @Success 200 {object} APIPublicPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 404 {object} APIError "Not found"
// @Router /api/public/posts/{slug} [get]
func (a *App) publicPost(w http.ResponseWriter, r *http.Request) {
	row := first(a.DB.Must(r.Context(), "SELECT * FROM posts WHERE slug=$1 AND status='published'", r.PathValue("slug")))
	if row == nil {
		fail(404, "Post not found.")
	}
	result := a.postContent(r.Context(), row)
	result["reviewedBy"] = a.reviewerBadges(r.Context(), row)
	result["relatedPosts"] = a.relatedPosts(r.Context(), row.str("id"))
	// A withdrawal or edit can occur while the body is loading from storage.
	a.recheckReadable(r.Context(), []Row{row})
	a.sendPostResponse(w, r, 200, result)
}

// @Summary Read a post
// @ID readPost
// @Description Includes content and the revision required for subsequent edits.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Success 200 {object} APIPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Router /api/posts/{id} [get]
func (a *App) readPost(w http.ResponseWriter, r *http.Request) {
	result := a.postContent(r.Context(), a.getPost(r.Context(), r.PathValue("id")))
	result["recommendations"] = a.recommendationSettings(r.Context(), result.str("id"))
	result["author"] = a.savedRevisionAuthor(r.Context(), result.str("id"), result.str("revision"))
	a.sendPostResponse(w, r, 200, result)
}

// A failed metadata write must not leave the newly uploaded revision behind.
func (a *App) writePost(ctx context.Context, previous, author Row, key, content string, query string, args ...any) Row {
	must(a.Storage.Put(ctx, key, []byte(content)))
	saved := false
	defer func() {
		if !saved {
			_ = a.Storage.Remove(context.WithoutCancel(ctx), key)
		}
	}()
	row := a.commitPost(ctx, previous, author, content, query, args...)
	saved = true
	result := post(row)
	result["recommendations"] = row["recommendations"]
	result["content"] = content
	result["author"] = author
	return result
}

// @Summary Create a post
// @ID createPost
// @Description Before generating rich content, call getAuthoringGuide for supported blocks, examples and constraints. Status defaults to draft. Draft responses include draftUrl, an absolute admin-session-only preview URL at /draft/post/{slug}. Writers may create drafts only. Publishing or archiving requires publisher or owner.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Accept json
// @Param input body APICreatePost true "Request body"
// @Success 201 {object} APIPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 409 {object} APIError "Revision conflict or duplicate slug"
// @Router /api/posts [post]
func (a *App) createPost(w http.ResponseWriter, r *http.Request) {
	input := validPost(body(w, r), false)
	a.authorizePostWrite(r, input, nil)
	id, revision := uuid(), uuid()
	a.validateRecommendationPosts(r.Context(), id, input["recommendations"])
	key := "posts/" + id + "/" + revision + ".md"
	recommended := a.prepareRecommendedIDs(r.Context(), id, input, input.str("content"))
	result := a.writePost(r.Context(), nil, a.revisionAuthor(r), key, input.str("content"), "INSERT INTO posts(id,title,slug,excerpt,status,tags,cover,content_key,revision,seo,recommendations,recommended_ids,citation_documents,featured,toc,content_type,cover_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *", id, input["title"], input["slug"], input["excerpt"], input["status"], encode(input["tags"]), input["cover"], key, revision, encode(input["seo"]), encode(input["recommendations"]), encode(recommended), encode(citationDocumentIDs(input.str("content"))), input["featured"], input["tableOfContents"], input["contentType"], input["coverMode"])
	a.sendPostResponse(w, r, 201, result)
}

// @Summary Update content, SEO, cover or publication status
// @ID updatePost
// @Description Before generating rich content, call getAuthoringGuide for supported blocks, examples and constraints. Works for articles and guides. Omitted properties are preserved. Supplied content replaces the entire Markdown document. Alternatively supply edits, an ordered list of oldText/newText exact replacements; each oldText must match exactly once. content and edits are mutually exclusive. To insert an uploaded image, use the URL returned by uploadImage in Markdown: ![Alt text](URL). Use cover for the on-page image, audio player, or video hero. An empty seo.image defaults to an image cover for sharing; video and audio covers need a separate seo.image for a share image. Insert videos with [Video src="URL" title="Description"]. URL can be returned by uploadVideo or listVideos, or be an existing YouTube, Vimeo, Mux (player or HLS), Cloudinary, or direct MP4/WebM video link. Hosted video links need no upload. A supplied seo object replaces the previous SEO object: include title, description and image (empty strings use defaults), plus any noindex/nofollow overrides you want to keep. Send the latest revision; missing revision returns 428 and stale revision returns 409. Set status to published to publish, archived to archive, or draft to unpublish. Unpublishing keeps staged edits as the private draft, preserves the last live version in revision history, and returns draftUrl. Supply the current live revision when unpublishing. Writers may edit only posts that are and remain drafts. To prepare changes to published content without changing the live version, use updatePostDraft, then publishPostDraft when approved. Draft saves return draftUrl, an admin-session-only preview at /draft/post/{slug}. Use previewPost for a 30-minute bearer preview link without an admin login. Responses include structural block warnings and publicationState (never_published, published, unpublished, archived).
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Accept json
// @Param input body APIUpdatePost true "Request body"
// @Success 200 {object} APIPost
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Failure 409 {object} APIError "Revision conflict or duplicate slug"
// @Failure 428 {object} APIError "Revision required"
// @Router /api/posts/{id} [put]
func (a *App) updatePost(w http.ResponseWriter, r *http.Request) {
	input := validPost(body(w, r), true)
	previous := a.getPost(r.Context(), r.PathValue("id"))
	requirePostRevision(input, previous)
	a.authorizePostWrite(r, input, previous)

	result := a.updatePostWithDraft(r, input, previous)
	a.sendPostResponse(w, r, 200, result)
}

func (a *App) updatePostResult(r *http.Request, input, previous Row) Row {
	a.applyPostEdits(r.Context(), input, previous)
	input["coverMode"] = lookString(input, "coverMode", lookString(previous, "cover_mode", "player"))
	a.validateRecommendationPosts(r.Context(), previous.str("id"), input["recommendations"])
	revision := uuid()
	key := "posts/" + previous.str("id") + "/" + revision + ".md"
	content, exists := input["content"]
	if !exists {
		data, err := a.Storage.Get(r.Context(), previous.str("content_key"))
		must(err)
		content = string(data)
	}
	if _, exists := input["contentType"]; !exists {
		input["contentType"] = postContentType(previous)
	}
	if _, exists := input["tableOfContents"]; !exists {
		input["tableOfContents"] = lookString(previous, "toc", "off")
	}
	for _, field := range []string{"title", "slug", "excerpt", "status", "tags", "cover", "seo", "recommendations", "featured"} {
		if _, ok := input[field]; !ok {
			input[field] = previous[field]
		}
	}
	recommended := a.prepareRecommendedIDs(r.Context(), previous.str("id"), input, content.(string))
	result := a.writePost(r.Context(), previous, a.revisionAuthor(r), key, content.(string), "UPDATE posts SET title=$1,slug=$2,excerpt=$3,status=$4,tags=$5,cover=$6,content_key=$7,revision=$8,seo=$11,recommendations=$12,recommended_ids=$13,citation_documents=$14,featured=$15,toc=$16,content_type=$17,cover_mode=$18,updated_at=NOW() WHERE id=$9 AND revision=$10 RETURNING *", input["title"], input["slug"], input["excerpt"], input["status"], encode(input["tags"]), input["cover"], key, revision, previous["id"], input["revision"], encode(input["seo"]), encode(input["recommendations"]), encode(recommended), encode(citationDocumentIDs(content.(string))), input["featured"], input["tableOfContents"], input["contentType"], input["coverMode"])
	return result
}

// @Summary Delete a post
// @ID deletePost
// @Description Send the latest revision in the JSON body. Missing revision returns 428 and stale revision returns 409.
// @Tags Posts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Accept json
// @Param input body APIDeletePost true "Request body"
// @Success 200 {object} APIOK
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Failure 409 {object} APIError "Revision conflict or duplicate slug"
// @Failure 428 {object} APIError "Revision required"
// @Router /api/posts/{id} [delete]
func (a *App) deletePost(w http.ResponseWriter, r *http.Request) {
	row := a.getPost(r.Context(), r.PathValue("id"))
	input := body(w, r)
	requirePostRevision(input, row)
	a.deletePostWithSearch(r.Context(), row)
	send(w, 200, Row{"ok": true})
}
func comment(row Row, private bool) Row {
	result := Row{"id": row["id"], "postId": row["post_id"], "name": row["name"], "body": row["body"], "createdAt": row["created_at"], "approved": row["approved"]}
	if private {
		result["email"] = row["email"]
		for _, key := range []string{"quote", "anchor_status", "answer"} {
			result[key] = row[key]
		}
		result["kind"] = row["kind"]
	}
	return result
}
func (a *App) publicComments(w http.ResponseWriter, r *http.Request) {
	row := a.getPost(r.Context(), r.PathValue("id"))
	if row.str("status") != "published" {
		fail(404, "Post not found.")
	}
	send(w, 200, a.visibleComments(r.Context(), a.settings(r.Context()), row.str("id")))
}
func (a *App) createComment(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "comments", 5, 15*time.Minute, false)
	theme := a.settings(r.Context())
	if !commentsVisible(theme) || !Row(theme["comments"].(map[string]any)).yes("enabled") {
		fail(403, "Comments are disabled for this publication.")
	}
	input := body(w, r)
	name := stringField(input, "name", 1, 100, true)
	email := a.requireCommentReader(r).str("email")
	message := stringField(input, "body", 1, 10000, true)
	row := a.getPost(r.Context(), r.PathValue("id"))
	if row.str("status") != "published" {
		fail(404, "Post not found.")
	}
	send(w, 201, a.submitConversation(r, row, input, name, email, message, ""))
}
func (a *App) comments(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		a.commentsPage(w, r)
		return
	}
	result := []Row{}
	for _, row := range a.DB.Must(r.Context(), `SELECT c.*,COALESCE(q.quote,a.quote,'') AS quote,
		COALESCE(q.anchor_status,a.anchor_status,'active') AS anchor_status,q.answer,
		CASE WHEN q.comment_id IS NOT NULL THEN 'question' ELSE 'comment' END AS kind
		FROM comments c LEFT JOIN passage_questions q ON q.comment_id=c.id
		LEFT JOIN section_anchors a ON a.id=c.id
		WHERE NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=c.id)
		AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=c.id AND s.email_required=TRUE AND s.verified_at IS NULL)
		ORDER BY c.created_at DESC`) {
		item := comment(row, true)
		if row.str("kind") == "question" {
			item["followups"] = a.questionFollowups(r.Context(), row.str("id"), false)
		}
		result = append(result, item)
	}
	send(w, 200, result)
}
func (a *App) moderateComment(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	approved := booleanField(input, "approved")
	row := first(a.DB.Must(r.Context(), "UPDATE comments SET approved=$1 WHERE id=$2 AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=comments.id) AND NOT EXISTS (SELECT 1 FROM comment_submissions s WHERE s.comment_id=comments.id AND s.email_required=TRUE AND s.verified_at IS NULL) RETURNING *", approved, r.PathValue("id")))
	if row == nil {
		if first(a.DB.Must(r.Context(), "SELECT id FROM comments c WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=c.id)", r.PathValue("id"))) == nil {
			fail(404, "Comment not found.")
		}
		fail(409, "Verify the commenter’s email before approving this contribution.")
	}
	send(w, 200, comment(row, true))
}
func (a *App) deleteComment(w http.ResponseWriter, r *http.Request) {
	if first(a.DB.Must(r.Context(), "SELECT id FROM comments c WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=c.id)", r.PathValue("id"))) == nil {
		fail(404, "Comment not found.")
	}
	a.DB.Must(r.Context(), "DELETE FROM section_anchors WHERE id=$1 AND kind IN ('question','note')", r.PathValue("id"))
	a.DB.Must(r.Context(), "DELETE FROM comments WHERE id=$1", r.PathValue("id"))
	send(w, 200, Row{"ok": true})
}

// @Summary List tokens
// @ID tokens
// @Description Returns token identifiers and roles, never secret API keys.
// @Tags Tokens
// @Produce json
// @Security BearerAuth
// @Success 200 {array} APIToken
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Router /api/tokens [get]
func (a *App) tokens(w http.ResponseWriter, r *http.Request) {
	result := []Row{}
	for _, row := range a.DB.Must(r.Context(), "SELECT token_hash,name,role,created_at FROM api_tokens ORDER BY created_at DESC") {
		result = append(result, tokenInfo(row))
	}
	send(w, 200, result)
}

// @Summary Create an API key
// @ID createToken
// @Description Defaults to a reader token named CLI. The secret is returned once. Create the first owner API key from the signed-in token settings.
// @Tags Tokens
// @Produce json
// @Security BearerAuth
// @Accept json
// @Param input body APICreateToken false "Request body"
// @Success 201 {object} APITokenSecret
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Router /api/tokens [post]
func (a *App) createToken(w http.ResponseWriter, r *http.Request) {
	input := optionalBody(w, r)
	strict(input, "name", "role")
	role := tokenRole(input, "reader")
	name := "CLI"
	if _, ok := input["name"]; ok {
		name = stringField(input, "name", 1, 100, true)
	}
	value := "margin_" + token()
	a.DB.Must(r.Context(), "INSERT INTO api_tokens(token_hash,name,role) VALUES($1,$2,$3)", hash(value), name, role)
	send(w, 201, Row{"token": value, "role": role})
}

// @Summary Revoke a token
// @ID deleteToken
// @Description Owners can revoke any token. Any role can revoke itself by using its own token identifier (SHA-256 hash of the secret) as id.
// @Tags Tokens
// @Produce json
// @Security BearerAuth
// @Param id path string true "Id"
// @Success 200 {object} APIOK
// @Failure 400 {object} APIError "Invalid input, status or fields"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit this action"
// @Failure 404 {object} APIError "Not found"
// @Router /api/tokens/{id} [delete]
func (a *App) deleteToken(w http.ResponseWriter, r *http.Request) {
	a.DB.Must(r.Context(), "DELETE FROM api_tokens WHERE token_hash=$1", r.PathValue("id"))
	send(w, 200, Row{"ok": true})
}
func (a *App) storageStatus(w http.ResponseWriter, r *http.Request) {
	result := a.Storage.Info()
	result["error"] = result.str("configurationError")
	result["reachable"] = false
	if a.Storage.Configured() {
		if err := a.Storage.Health(r.Context()); err != nil {
			result["error"] = "Cannot access this S3 bucket. Check endpoint, credentials, and bucket permissions."
		} else {
			result["reachable"] = true
		}
	}
	send(w, 200, result)
}

func requirePostRevision(input, previous Row) {
	if input.str("revision") == "" {
		coded(428, "Include the revision you reviewed before changing this post.", "REVISION_REQUIRED")
	}
	if input["revision"] != previous["revision"] {
		coded(409, "This post changed. Review the latest version before saving.", "REVISION_CONFLICT")
	}
}
