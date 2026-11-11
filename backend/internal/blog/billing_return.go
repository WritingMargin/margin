package blog

import (
	"os"
	"strings"
)

func billingPlanID(input Row) string {
	if _, exists := input["planId"]; !exists {
		return ""
	}
	return stringField(input, "planId", 0, 64, false)
}

// Only the server supplies this address; ignore browser-supplied redirect URLs.
func billingInput(input Row) Row {
	if publicURL := strings.TrimRight(os.Getenv("PUBLIC_URL"), "/"); publicURL != "" {
		input["publicUrl"] = publicURL
	}
	return input
}
