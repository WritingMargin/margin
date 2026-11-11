package blog

import "strings"

type mcpPostTarget struct {
	name, method, path, permission string
}

var mcpPostViews = []mcpPostTarget{
	{"current", "GET", "/api/posts/{id}", ""},
	{"draft", "GET", "/api/posts/{id}/draft", ""},
	{"link", "GET", "/api/posts/{id}/link", ""},
	{"revision", "GET", "/api/posts/{id}/revisions/{revision}", ""},
	{"preview", "GET", "/api/posts/{id}/preview", ""},
}
var mcpPostActions = []mcpPostTarget{
	{"save", "PUT", "/api/posts/{id}", ""},
	{"save_draft", "PUT", "/api/posts/{id}/draft", ""},
	{"publish", "POST", "/api/posts/{id}/draft/publish", ""},
	{"unpublish", "PUT", "/api/posts/{id}", "POST /api/posts/{id}/draft/publish"},
	{"archive", "PUT", "/api/posts/{id}", "POST /api/posts/{id}/draft/publish"},
	{"discard_draft", "DELETE", "/api/posts/{id}/draft", ""},
}

func mcpPostTargets(name string) (string, []mcpPostTarget) {
	switch name {
	case "get_post":
		return "view", mcpPostViews
	case "update_post":
		return "action", mcpPostActions
	}
	return "", nil
}

// Each role/consent gets its own schema. Available actions reflect permissions;
// dispatch still passes through REST authorization, including per-post checks.
func configureMCPPostTool(operation mcpOperation, allowed func(string) bool) mcpOperation {
	selector, targets := mcpPostTargets(operation.tool.Name)
	if targets == nil {
		return operation
	}
	choices := []string{}
	for _, target := range targets {
		permission := target.permission
		if permission == "" {
			permission = target.method + " " + target.path
		}
		if allowed(permission) {
			choices = append(choices, target.name)
		}
	}
	tool := *operation.tool
	schema := mcpJSONSchema(tool.InputSchema, nil).(map[string]any)
	properties := schema["properties"].(map[string]any)
	properties[selector] = map[string]any{"type": "string", "enum": choices, "description": "Select the post operation. Omission uses " + targets[0].name + "."}
	tool.InputSchema = schema
	if selector == "view" {
		properties["revision"] = map[string]any{"type": "string", "minLength": 1, "description": "Required only for view=revision; use a revision from list_revisions."}
		fields := properties["fields"].(map[string]any)["items"].(map[string]any)
		fields["enum"] = strings.Split(privatePostFields+",version,savedAt,previousRevision", ",")
		tool.Description = "Read a post: view=current (default) returns the current post and editing revision; view=draft returns the working draft or current post if none exists; view=link returns a published post's absolute canonical URL (drafts/archives return 409); view=revision requires revision and returns that historical version. Use list_revisions to find versions. fields selects response fields except for view=link or view=preview, which return their complete result. Draft responses include draftUrl for an admin browser session. view=preview returns an expiring bearer previewUrl for the saved draft that opens without login, with structural block warnings. Anyone holding that URL can view this revision for 30 minutes. publicationState distinguishes never_published, published, unpublished and archived independently of the editing status."
	} else {
		tool.Description += " Use input.edits [{oldText,newText}] for sequential exact replacements instead of resending content; each oldText must match exactly once. Save replies are compact by default; use fields to request content or other fields. warnings report structural block issues and a share image without a cover. Actions: save (default) applies input fields immediately, including SEO; save_draft stages input fields without changing live content. Read view=draft before save_draft. For publish, unpublish, archive, or discard_draft, input must contain only revision. publish publishes the reviewed working draft (read view=draft); unpublish removes public access and keeps pending edits as the private draft, with the last live version retained in history (read view=current); archive archives the current post (read view=current); discard_draft discards only staged edits (read view=draft), preserving the live post and history. Publishing requires publisher permission; saving/discarding staged drafts requires draft permission. On revision conflict reread and reconcile."
	}
	operation.tool = &tool
	return operation
}

func resolveMCPPostOperation(operation mcpOperation, input map[string]any) (mcpOperation, map[string]any) {
	selector, targets := mcpPostTargets(operation.tool.Name)
	if targets == nil {
		return operation, input
	}
	selected := targets[0].name
	if _, exists := input[selector]; exists {
		selected = stringField(Row(input), selector, 1, 40, false)
	}
	for _, target := range targets {
		if target.name != selected {
			continue
		}
		operation.method, operation.path = target.method, target.path
		if selector == "view" {
			return resolveMCPPostRead(operation, input, selected), input
		}
		return operation, mcpPostActionInput(input, selected)
	}
	fail(400, "Unknown post "+selector+".")
	return operation, input
}

func resolveMCPPostRead(operation mcpOperation, input map[string]any, view string) mcpOperation {
	if view == "revision" {
		stringField(Row(input), "revision", 1, 3000000, false)
		operation.parameters = append(append([]mcpParameter{}, operation.parameters...), mcpParameter{Name: "revision", In: "path", Required: true})
	} else if _, exists := input["revision"]; exists {
		fail(400, "revision is only supported with view=revision.")
	}
	if view == "link" || view == "preview" {
		if _, exists := input["fields"]; exists {
			fail(400, "view=link and view=preview do not accept fields.")
		}
	}
	return operation
}

func mcpPostActionInput(input map[string]any, action string) map[string]any {
	if action == "save" || action == "save_draft" {
		return input
	}
	body := object(input["input"])
	strict(body, "revision")
	next := map[string]any{}
	for key, value := range input {
		next[key] = value
	}
	nextBody := Row{"revision": body["revision"]}
	switch action {
	case "unpublish":
		nextBody["status"] = "draft"
	case "archive":
		nextBody["status"] = "archived"
	}
	next["input"] = nextBody
	return next
}
