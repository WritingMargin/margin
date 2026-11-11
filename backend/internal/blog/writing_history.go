package blog

import (
	"sort"
	"unicode/utf16"

	"margin/backend/internal/writing"
)

const writingPayloadLimit = 60000

// The text gateway accepts 60,000 UTF-16 units of JSON. Preserve the current
// request and as many complete recent turns as fit, in chronological order.
func attachConversationHistory(input Row, history []writing.Turn) {
	fitConversationContext(input)
	for i := len(history) - 1; i >= 0; i-- {
		input["history"] = history[i:]
		if len(utf16.Encode([]rune(encode(input)))) > writingPayloadLimit {
			if i+1 == len(history) {
				delete(input, "history")
			} else {
				input["history"] = history[i+1:]
			}
			return
		}
	}
}

// Escaped text and non-BMP characters can exceed the serialized request
// budget even when each field is within its character limit.
func fitConversationContext(input Row) {
	size := len(utf16.Encode([]rune(encode(input))))
	if size <= writingPayloadLimit {
		return
	}
	// Preserve room for the live draft even when the selected passage is
	// itself larger than the provider's input budget after JSON escaping.
	for _, field := range []string{"passage", "content"} {
		original := input.str(field)
		if original == "" {
			continue
		}
		units := writingStringUnits(original)
		budget := units - (size - writingPayloadLimit)
		if field == "passage" && budget < 12000 {
			budget = 12000
		}
		if budget >= units {
			continue
		}
		clipped := conversationExcerpt(original, budget)
		input[field] = clipped
		size += writingStringUnits(clipped) - units
		if size <= writingPayloadLimit {
			return
		}
	}
}

func writingStringUnits(value string) int {
	return len(utf16.Encode([]rune(encode(value)))) - 2
}

func conversationExcerpt(value string, budget int) string {
	const omission = "\n[…]\n"
	if budget < writingStringUnits(omission) {
		return ""
	}
	chars := []rune(value)
	excerpt := func(n int) string {
		return string(chars[:(n+1)/2]) + omission + string(chars[len(chars)-n/2:])
	}
	firstTooLong := sort.Search(len(chars)+1, func(n int) bool { return writingStringUnits(excerpt(n)) > budget })
	return excerpt(firstTooLong - 1)
}
