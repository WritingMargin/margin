package blog

import (
	"context"
	"encoding/base64"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func (a *App) aiConfig(ctx context.Context) Row {
	return a.serviceRequest(ctx, "/v1/account", nil, "")
}
func (a *App) aiRoutes() {
	a.mux.HandleFunc("GET /api/ai/config", func(w http.ResponseWriter, r *http.Request) { send(w, 200, a.aiConfig(r.Context())) })
	a.mux.HandleFunc("GET /api/ai/pricing", func(w http.ResponseWriter, r *http.Request) {
		send(w, 200, validPricing(a.serviceRequest(r.Context(), "/v1/pricing", nil, "")))
	})
	a.mux.HandleFunc("POST /api/ai/checkout", func(w http.ResponseWriter, r *http.Request) {
		input := body(w, r)
		send(w, 200, a.serviceRequest(r.Context(), "/v1/checkout", billingInput(Row{"planId": stringField(input, "planId", 1, 64, false)}), ""))
	})
	a.mux.HandleFunc("POST /api/ai/topups", func(w http.ResponseWriter, r *http.Request) {
		input := body(w, r)
		send(w, 200, a.serviceRequest(r.Context(), "/v1/topups", billingInput(Row{"packId": stringField(input, "packId", 0, 64, false)}), ""))
	})
	a.mux.HandleFunc("POST /api/ai/billing/auto-topup", func(w http.ResponseWriter, r *http.Request) {
		input := body(w, r)
		delete(input, "publicUrl")
		input = billingInput(input)
		send(w, 200, a.serviceRequest(r.Context(), "/v1/billing/auto-topup", input, ""))
	})
	a.mux.HandleFunc("POST /api/ai/billing/stop", func(w http.ResponseWriter, r *http.Request) {
		input := body(w, r)
		send(w, 200, a.serviceRequest(r.Context(), "/v1/billing/stop", Row{"component": stringField(input, "component", 1, 20, false)}, ""))
	})
	a.mux.HandleFunc("POST /api/ai/billing/portal", func(w http.ResponseWriter, r *http.Request) {
		input := body(w, r)
		send(w, 200, a.serviceRequest(r.Context(), "/v1/billing/portal", billingInput(Row{"planId": billingPlanID(input)}), ""))
	})
	a.mux.HandleFunc("GET /api/ai/history", a.aiHistory)
	a.mux.HandleFunc("POST /api/ai/summaries", a.generateSummaries)
	a.mux.HandleFunc("POST /api/ai/writing", a.writingAssistant)
	a.mux.HandleFunc("POST /api/ai/writing/stream", a.writingAssistantStream)
	a.mux.HandleFunc("GET /api/ai/writing/sessions/{key}", a.writingChatSession)
	a.mux.HandleFunc("PUT /api/ai/writing/sessions/{key}", a.saveWritingChatSession)
	a.mux.HandleFunc("POST /api/ai/formatting", a.formatContent)
	a.mux.HandleFunc("POST /api/ai/images", a.generateImage)
	a.mux.HandleFunc("GET /api/assets/{filename}", a.generatedAsset)
}
func aiSnapshot(input Row) Row {
	id := stringField(input, "postId", 1, 100, false)
	if !uuidRE.MatchString(id) {
		fail(400, "postId: invalid UUID")
	}
	out := Row{"postId": id, "title": stringField(input, "title", 1, 240, false), "content": stringField(input, "content", 1, 40000, false)}
	for _, k := range []string{"title", "content"} {
		if strings.TrimSpace(out.str(k)) == "" {
			fail(400, k+": cannot be blank")
		}
	}
	return out
}
func summaryInput(input Row) Row {
	out := aiSnapshot(input)
	out["tone"] = enumField(input, "tone", "natural", "professional", "playful")
	if _, ok := input["instructions"]; ok {
		out["instructions"] = stringField(input, "instructions", 0, 2000, false)
	}
	platforms, ok := input["platforms"].([]any)
	if !ok || len(platforms) < 1 || len(platforms) > 8 {
		fail(400, "platforms: select one to eight platforms")
	}
	seen := map[string]bool{}
	selected := []string{}
	for _, p := range platforms {
		value := enumField(Row{"platform": p}, "platform", "linkedin", "x", "instagram", "facebook", "threads", "devto", "substack", "medium")
		if seen[value] {
			fail(400, "Choose each platform once")
		}
		seen[value] = true
		selected = append(selected, value)
	}
	out["platforms"] = selected
	return out
}
func imageInput(input Row) Row {
	out := aiSnapshot(input)
	out["style"] = enumField(input, "style", "editorial", "photographic", "illustration", "minimal")
	out["size"] = enumField(input, "size", "1536x1024", "1024x1024", "1024x1536")
	if _, ok := input["prompt"]; ok {
		out["prompt"] = stringField(input, "prompt", 0, 4000, true)
	}
	return out
}
func requestID(r *http.Request) string {
	id := r.Header.Get("Idempotency-Key")
	if id == "" {
		return uuid()
	}
	if !uuidRE.MatchString(id) {
		fail(400, "Idempotency-Key: invalid UUID")
	}
	return id
}
func (a *App) requireAIPost(ctx context.Context, id string, published bool) Row {
	row := first(a.DB.Must(ctx, "SELECT id,status,slug FROM posts WHERE id=$1", id))
	if row == nil {
		coded(404, "Save this post before using AI tools.", "POST_NOT_FOUND")
	}
	if published && row.str("status") != "published" {
		coded(409, "Publish this post before generating social summaries.", "POST_NOT_PUBLISHED")
	}
	return row
}
func summaryRow(row Row) Row {
	return Row{"id": row["id"], "postId": row["post_id"], "sourceHash": row["source_hash"], "tone": row["tone"], "summaries": row["summaries"], "createdAt": row["created_at"]}
}
func imageRow(row Row) Row {
	return Row{"id": row["id"], "postId": row["post_id"], "url": "/api/assets/" + row.str("id") + ".png", "title": generatedImageTitle(row.str("prompt")), "prompt": row["prompt"], "style": row["style"], "size": row["size"], "sourceHash": row["source_hash"], "createdAt": row["created_at"]}
}
func (a *App) aiHistory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("postId")
	if !uuidRE.MatchString(id) {
		fail(400, "postId: invalid UUID")
	}
	a.requireAIPost(r.Context(), id, false)
	summaries, images := []Row{}, []Row{}
	for _, row := range a.DB.Must(r.Context(), "SELECT * FROM ai_summaries WHERE post_id=$1 ORDER BY created_at DESC", id) {
		summaries = append(summaries, summaryRow(row))
	}
	for _, row := range a.DB.Must(r.Context(), "SELECT * FROM generated_assets WHERE post_id=$1 ORDER BY created_at DESC", id) {
		images = append(images, imageRow(row))
	}
	send(w, 200, Row{"summaries": summaries, "images": images})
}

// A struct preserves the JavaScript object's title/content property order in its digest.
func sourceHash(input Row) string {
	serialized := encode(struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}{input.str("title"), input.str("content")})
	return hash(unescapeJSONSeparators(serialized))
}
func (a *App) generateSummaries(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "ai-summaries", 15, 15*time.Minute, true)
	input := summaryInput(body(w, r))
	post := a.requireAIPost(r.Context(), input.str("postId"), true)
	postURL := readableLinks(post, a.publicationOrigin(r)).str("canonical")
	id := requestID(r)
	result := a.serviceRequest(r.Context(), "/v1/generations/summaries", input, id)
	summaries := summariesWithPostURL(arrayValue(result, "summaries"), postURL)
	row := first(a.DB.Must(r.Context(), "INSERT INTO ai_summaries(id,post_id,source_hash,tone,summaries) SELECT $1,id,$3,$4,$5 FROM posts WHERE id=$2 AND status='published' RETURNING *", uuid(), input["postId"], sourceHash(input), input["tone"], encode(summaries)))
	if row == nil {
		coded(409, "This post is no longer published. Publish it before generating social summaries.", "POST_NOT_PUBLISHED")
	}
	send(w, 201, summaryRow(row))
}
func (a *App) generateImage(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "ai-images", 6, 15*time.Minute, true)
	input := imageInput(body(w, r))
	a.requireAIPost(r.Context(), input.str("postId"), false)
	if !a.aiConfig(r.Context()).yes("configured") {
		coded(503, "AI is not connected. Contact your server administrator.", "AI_NOT_CONFIGURED")
	}
	if a.Storage.Health(r.Context()) != nil {
		coded(503, "Image storage is unavailable. Check the storage connection in Settings before generating images.", "AI_STORAGE_UNAVAILABLE")
	}
	prompt, bytes := a.aiImage(r.Context(), input, requestID(r))
	id := uuid()
	key := "assets/" + id + ".png"
	if a.Storage.Put(r.Context(), key, bytes) != nil {
		coded(503, "The image was generated but could not be saved. Check the storage connection in Settings before retrying.", "AI_STORAGE_UNAVAILABLE")
	}
	defer func() {
		if err := recover(); err != nil {
			_ = a.Storage.Remove(r.Context(), key)
			panic(err)
		}
	}()
	row := first(a.DB.Must(r.Context(), "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", id, input["postId"], key, prompt, input["style"], input["size"], sourceHash(input)))
	send(w, 201, imageRow(row))
}
func (a *App) aiImage(ctx context.Context, input Row, id string) (string, []byte) {
	result := a.serviceRequest(ctx, "/v1/generations/image", input, id)
	s, ok := result["png"].(string)
	_, promptOK := result["prompt"].(string)
	if !ok || len(s) > 44_000_000 || !promptOK {
		coded(502, "The AI service returned an invalid image.", "AI_INVALID_RESPONSE")
	}
	bytes := nodeBase64(s)
	if !pngSignature(bytes) {
		coded(502, "The AI service returned an unsupported image.", "AI_INVALID_RESPONSE")
	}
	return result.str("prompt"), bytes
}
func pngSignature(b []byte) bool { return len(b) >= 8 && string(b[:8]) == "\x89PNG\r\n\x1a\n" }

var generatedName = regexp.MustCompile(`^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.png$`)

func assetMissing() { coded(404, "Asset not found.", "ASSET_NOT_FOUND") }
func (a *App) assetVisible(ctx context.Context, row Row, id string) bool {
	if row.str("status") != "published" {
		return false
	}
	address := "/api/assets/" + id + ".png"
	if row.str("cover") == address {
		return true
	}
	content, err := a.Storage.Get(ctx, row.str("content_key"))
	must(err)
	return strings.Contains(string(content), address)
}

// An explicit sharing image can be reused from the library. Only a live post's
// saved SEO field grants public access, including after the storage read.
func (a *App) sharedGeneratedImage(ctx context.Context, id string) bool {
	address := "/api/assets/" + id + ".png"
	return len(a.DB.Must(ctx, "SELECT id FROM posts WHERE status='published' AND seo->>'image'=$1 LIMIT 1", address)) > 0
}

// Keep the proof of access so the final check needs only a database lookup.
func (a *App) publicAssetRecheck(ctx context.Context, row Row, id string) func() bool {
	if a.sharedGeneratedImage(ctx, id) {
		return func() bool { return a.sharedGeneratedImage(ctx, id) }
	}
	if !a.assetVisible(ctx, row, id) {
		assetMissing()
	}
	return func() bool {
		return len(a.DB.Must(ctx, "SELECT id FROM posts WHERE id=$1 AND status='published' AND revision=$2", row["post_id"], row["revision"])) > 0
	}
}
func (a *App) generatedAsset(w http.ResponseWriter, r *http.Request) {
	match := generatedName.FindStringSubmatch(r.PathValue("filename"))
	if match == nil {
		assetMissing()
	}
	row := first(a.DB.Must(r.Context(), "SELECT a.*,p.status,p.cover,p.content_key,p.revision FROM generated_assets a JOIN posts p ON p.id=a.post_id WHERE a.id=$1", match[1]))
	if row == nil {
		assetMissing()
	}
	var recheck func() bool
	if !a.privateMediaAllowed(r, "content:read") {
		recheck = a.publicAssetRecheck(r.Context(), row, match[1])
	}
	bytes, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.recheckPreviewMedia(r)
	// Recheck publication after storage reads to prevent serving a withdrawn revision.
	if recheck != nil {
		if !recheck() {
			assetMissing()
		}
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(bytes) // Headers are sent; a disconnected client cannot receive an error response.
}
func arrayValue(row Row, key string) []any {
	v, ok := row[key].([]any)
	if !ok {
		panic("invalid array")
	}
	return v
}
func stringArray(row Row, key string) {
	for _, v := range arrayValue(row, key) {
		if _, ok := v.(string); !ok {
			panic("invalid string array")
		}
	}
}
func pricingInteger(row Row, key string, min float64) {
	n, ok := row[key].(float64)
	if !ok || n < min || n != float64(int64(n)) {
		panic("invalid integer")
	}
}
func pricingOffer(row Row, plan bool) {
	stringField(row, "id", 0, 100000, false)
	stringField(row, "name", 0, 100000, false)
	enumField(row, "currency", "gbp")
	booleanField(row, "available")
	minimum := float64(1)
	if plan {
		minimum = 0
		pricingPlanID(row, "id")
		stringField(row, "description", 0, 100000, false)
		stringArray(row, "features")
		booleanField(row, "featured")
	}
	pricingInteger(row, "amount", minimum)
	pricingInteger(row, "credits", minimum)
}
func pricingAccount(row Row) {
	pricingPlanID(row, "planId")
	for _, key := range []string{"credits", "monthlyCredits", "topupCredits"} {
		pricingInteger(row, key, 0)
	}
	booleanField(row, "canManage")
	booleanField(row, "cancelsAtPeriodEnd")
	for _, key := range []string{"subscriptionStatus", "renewsAt"} {
		v, exists := row[key]
		if !exists || !nullableString(v) {
			panic("invalid nullable string")
		}
	}
}
func validPricing(row Row) Row {
	defer func() {
		if recover() != nil {
			coded(502, "Margin Central returned invalid pricing. Please try again.", "PRICING_INVALID")
		}
	}()
	if _, ok := row["audience"]; ok {
		enumField(row, "audience", "ai", "hosting")
	}
	validateHostingPricing(row)
	plans := arrayValue(row, "plans")
	if len(plans) == 0 {
		panic("invalid plans")
	}
	seen := map[string]bool{}
	for _, p := range plans {
		plan := object(p)
		pricingOffer(plan, true)
		seen[plan.str("id")] = true
	}
	if len(seen) != len(plans) {
		panic("duplicate plans")
	}
	for _, p := range arrayValue(row, "topups") {
		pricingOffer(object(p), false)
	}
	pricingAccount(object(row["account"]))
	for _, key := range []string{"writing", "summaries", "image"} {
		pricingInteger(object(row["costs"]), key, 1)
	}
	stringArray(row, "terms")
	return pricingProjection(row)
}

// JSON.stringify leaves Unicode line separators literal while Go escapes them.
func unescapeJSONSeparators(value string) string {
	var out strings.Builder
	for i := 0; i < len(value); i++ {
		if value[i] != '\\' {
			out.WriteByte(value[i])
			continue
		}
		if strings.HasPrefix(value[i:], `\u2028`) {
			out.WriteRune('\u2028')
			i += 5
			continue
		}
		if strings.HasPrefix(value[i:], `\u2029`) {
			out.WriteRune('\u2029')
			i += 5
			continue
		}
		out.WriteByte(value[i])
		i++
		if i < len(value) {
			out.WriteByte(value[i])
		}
	}
	return out.String()
}

func pickFields(row Row, keys ...string) Row {
	out := Row{}
	for _, key := range keys {
		out[key] = row[key]
	}
	return out
}
func pricingProjection(row Row) Row {
	plans, topups := []Row{}, []Row{}
	for _, value := range arrayValue(row, "plans") {
		plans = append(plans, pickFields(object(value), "id", "name", "description", "amount", "currency", "credits", "features", "available", "featured"))
	}
	for _, value := range arrayValue(row, "topups") {
		topups = append(topups, pickFields(object(value), "id", "name", "credits", "amount", "currency", "available"))
	}
	return Row{"autoTopup": row["autoTopup"], "audience": row["audience"], "hostingPlans": hostingPricingProjection(row), "plans": plans, "topups": topups, "account": pickFields(object(row["account"]), "planId", "credits", "monthlyCredits", "topupCredits", "canManage", "subscriptionStatus", "renewsAt", "cancelsAtPeriodEnd", "hostingPlanId", "hostingRenewsAt", "aiRenewalStopped", "hostingRenewalStopped"), "costs": pickFields(object(row["costs"]), "writing", "summaries", "image"), "terms": row["terms"]}
}

func nodeBase64(value string) []byte {
	normalized := strings.Map(func(r rune) rune {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '+', r == '/':
			return r
		case r == '-':
			return '+'
		case r == '_':
			return '/'
		}
		return -1
	}, strings.SplitN(value, "=", 2)[0])
	bytes, _ := base64.RawStdEncoding.DecodeString(normalized)
	return bytes
}

func validateHostingPricing(row Row) {
	if row["hostingPlans"] == nil {
		return
	}
	plans := arrayValue(row, "hostingPlans")
	seen := map[string]bool{}
	for _, value := range plans {
		plan := object(value)
		pricingOffer(plan, true)
		if enginePlan(plan.str("id")).str("family") != "hosting" || enginePlan(plan.str("id")).yes("legacy") {
			panic("invalid hosting plan")
		}
		if seen[plan.str("id")] {
			panic("duplicate hosting plan")
		}
		seen[plan.str("id")] = true
	}
	account := object(row["account"])
	id := stringField(account, "hostingPlanId", 0, 64, false)
	if id != "" && enginePlan(id).str("family") != "hosting" {
		panic("invalid hosting plan")
	}
	if !nullableString(account["hostingRenewsAt"]) {
		panic("invalid hosting date")
	}
}
func hostingPricingProjection(row Row) []Row {
	result := []Row{}
	if row["hostingPlans"] == nil {
		return result
	}
	for _, value := range arrayValue(row, "hostingPlans") {
		result = append(result, pickFields(object(value), "id", "name", "description", "amount", "currency", "credits", "features", "available", "featured"))
	}
	return result
}
