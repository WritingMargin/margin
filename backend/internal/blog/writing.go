package blog

import (
	"context"
	"margin/backend/internal/writing"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

func (a *App) writingAssistant(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "ai-writing", 15, 15*time.Minute, true)
	input, err := writing.ParseInput(body(w, r))
	if err != nil {
		fail(400, err.Error())
	}
	id := a.writingRequestKey(r, input)
	instructions, schema := writing.Instructions, writing.Schema()
	if input.ConversationMode {
		instructions, schema = writing.ConversationInstructions, writing.ConversationSchema()
	}
	context := writingInputRow(input)
	prepareWritingFormatting(input, context)
	result := a.serviceRequest(r.Context(), "/v1/generations/writing", Row{
		"instructions": instructions,
		"input":        context,
		"schemaName":   "writing_plan",
		"schema":       schema,
	}, id)
	send(w, 200, a.writingResult(r.Context(), input, context, id, result))
}

func (a *App) writingResult(ctx context.Context, input writing.Input, context Row, id string, result Row) Row {
	reply, plan, err := writing.ParseReply(result["plan"], input.ConversationMode)
	if err != nil {
		coded(502, "The assistant returned an unreadable response. Please try again.", "AI_INVALID_RESPONSE")
	}
	greeting := input.ConversationMode && writing.GreetingOnly(input.Brief)
	if greeting {
		plan = writing.Result{Sections: []writing.Section{}, Questions: []string{}}
	}
	writing.KeepExactQuotes(&plan, input.Content, input.Passage)
	response := Row{"plan": plan}
	if writingContextExcerpted(input, context, greeting) {
		response["contextExcerpted"] = true
	}
	if reply != "" {
		response["reply"] = reply
	}
	if !greeting {
		attachFormattingProposal(response, input, context, object(result["plan"])["formatting"])
		if input.ResearchMode {
			sources := writingResearchSources(result["researchSources"])
			response["researchSources"] = sources
			if input.PostID != "" {
				response["researchSaved"] = a.applyWritingResearch(ctx, input, id, sources, result["researchActions"])
			}
		}
	}
	return response
}

func writingContextExcerpted(input writing.Input, context Row, greeting bool) bool {
	return input.ConversationMode && !greeting && (input.Content != context.str("content") || input.Passage != context.str("passage"))
}

func (a *App) writingRequestKey(r *http.Request, input writing.Input) string {
	key := requestID(r)
	if input.PostID == "" {
		return key
	}
	if !uuidRE.MatchString(input.PostID) {
		fail(400, "postId: invalid UUID")
	}
	if scopes, oauth := a.requestOAuthScopes(r); oauth && !hasOAuthScope(scopes, "content:draft") {
		coded(403, "This connection does not have permission to save draft research.", "PERMISSION_DENIED")
	}
	a.requireAIPost(r.Context(), input.PostID, false)
	return researchRequestID(key, input.PostID)
}

func writingInputRow(input writing.Input) Row {
	if input.ConversationMode && writing.GreetingOnly(input.Brief) {
		// A greeting needs no draft, selection, research or prior turn context.
		// Keep it from prompting unsolicited editorial feedback.
		return Row{"mode": input.Mode, "brief": input.Brief, "audience": "", "title": "", "content": "", "conversationMode": true}
	}
	row := Row{"mode": input.Mode, "brief": input.Brief, "audience": input.Audience, "title": input.Title, "content": input.Content}
	attachWritingResearchInput(row, input)
	if input.Passage != "" {
		row["passage"] = input.Passage
	}
	if input.Previous != nil {
		row["previous"] = input.Previous
	}
	if input.Feedback != "" {
		row["feedback"] = input.Feedback
	}
	if input.ConversationMode {
		row["conversationMode"] = true
		attachConversationHistory(row, input.History)
	}
	return row
}

func attachWritingResearchInput(row Row, input writing.Input) {
	if !input.ResearchMode {
		return
	}
	row["researchMode"] = true
	if len(input.ResearchSources) > 0 {
		urls := make([]string, 0, len(input.ResearchSources))
		for _, source := range input.ResearchSources {
			urls = append(urls, source.URL)
		}
		row["selectedSourceURLs"] = urls
	}
	if input.PostID != "" {
		row["canSaveResearch"] = true
	}
}

// Keep tool output separate from model-written notes. Only validated DOI links
// from the research service can become clickable suggestions in the workspace.
func writingResearchSources(value any) []Row {
	items, _ := value.([]any)
	sources := []Row{}
	seen := map[string]bool{}
	for _, item := range items {
		source := object(item)
		address := source.str("url")
		if seen[address] || !validWritingSource(source) {
			continue
		}
		sources = append(sources, Row{"url": address, "title": source.str("title"), "excerpt": source.str("excerpt")})
		seen[address] = true
		if len(sources) == 9 {
			break
		}
	}
	return sources
}

func validWritingSource(source Row) bool {
	address := source.str("url")
	if utf8.RuneCountInString(address) > 2048 || strings.TrimSpace(source.str("title")) == "" {
		return false
	}
	u, err := url.Parse(address)
	if err != nil || u.Scheme != "https" || u.Host != "doi.org" || u.User != nil || !strings.HasPrefix(u.Path, "/10.") {
		return false
	}
	return utf8.RuneCountInString(source.str("title")) <= 500 && utf8.RuneCountInString(source.str("excerpt")) <= 4000
}
