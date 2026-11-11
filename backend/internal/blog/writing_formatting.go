package blog

import (
	"margin/backend/internal/formatting"
	"margin/backend/internal/writing"
	"unicode/utf16"
)

func prepareWritingFormatting(input writing.Input, context Row) {
	if input.ConversationMode && !writing.GreetingOnly(input.Brief) {
		attachWritingFormatting(context, input.Content)
	}
}
func attachFormattingProposal(response Row, input writing.Input, context Row, raw any) {
	if !input.ConversationMode {
		return
	}
	if proposal := conversationFormatting(input.Content, context, raw); proposal != nil {
		response["formatting"] = proposal
	}
}

// Candidate text is source material, never instructions. Add only what fits
// alongside the current message, draft and recent conversation.
func attachWritingFormatting(input Row, source string) {
	budget := writingPayloadLimit - len(utf16.Encode([]rune(encode(input)))) - 64
	candidates := []formatting.Candidate{}
	for _, candidate := range formatting.Candidates(source) {
		size := len(utf16.Encode([]rune(encode(candidate)))) + 1
		if size > budget {
			continue
		}
		candidates = append(candidates, candidate)
		budget -= size
		if len(candidates) == 500 {
			break
		}
	}
	if len(candidates) > 0 {
		input["formattingCandidates"] = candidates
	}
}

func conversationFormatting(source string, context Row, raw any) Row {
	if raw == nil {
		return nil
	}
	content, changes, err := formatting.Apply(source, raw)
	if err != nil {
		coded(502, "The assistant returned invalid formatting. Your draft has not changed.", "AI_INVALID_RESPONSE")
	}
	if changes == 0 {
		return nil
	}
	if context["formattingCandidates"] == nil {
		coded(502, "Formatting is unavailable for this draft context. Try a shorter draft.", "AI_INVALID_RESPONSE")
	}
	return Row{"before": source, "content": content, "changes": changes}
}
