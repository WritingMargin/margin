package blog

import (
	"context"
	"strings"
)

// Edits apply in order to the reviewed revision. Ambiguous matches fail the
// entire save before any content or metadata is written.
func validContentEdits(input Row, key string) any {
	if _, exists := input["content"]; exists {
		fail(400, "Use content or edits, not both.")
	}
	values, ok := input[key].([]any)
	if !ok || len(values) == 0 || len(values) > 100 {
		fail(400, "edits: supply between 1 and 100 text replacements.")
	}
	for _, value := range values {
		edit := object(value)
		strict(edit, "oldText", "newText")
		stringField(edit, "oldText", 1, 2000000, false)
		stringField(edit, "newText", 0, 2000000, false)
	}
	return values
}

func (a *App) applyPostEdits(ctx context.Context, input, previous Row) {
	values, exists := input["edits"]
	if !exists {
		return
	}
	data, err := a.Storage.Get(ctx, previous.str("content_key"))
	must(err)
	content := string(data)
	for _, value := range values.([]any) {
		edit := object(value)
		if strings.Count(content, edit.str("oldText")) != 1 {
			coded(409, "Each oldText must match exactly once. Read the post and include enough surrounding text to identify the edit.", "EDIT_MATCH_CONFLICT")
		}
		content = strings.Replace(content, edit.str("oldText"), edit.str("newText"), 1)
	}
	input["content"] = stringField(Row{"content": content}, "content", 0, 2000000, false)
	delete(input, "edits")
}
