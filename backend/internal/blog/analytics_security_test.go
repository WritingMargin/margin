package blog

import "testing"

func TestAnalyticsRejectsOverflowingSections(t *testing.T) {
	a, post := interactionFixture(t)
	payload := analyticsPayload(post)
	payload["activeMs"] = 0
	// Both values fit int64, but their sum wraps negative. An unchecked sum
	// bypasses the page-time bound and can poison subsequent SQL aggregates.
	payload["sections"] = []Row{
		{"id": "first", "label": "First", "activeMs": int64(1) << 62},
		{"id": "second", "label": "Second", "activeMs": int64(1) << 62},
	}
	expectStatus(t, request(t, a, "POST", "/api/public/analytics", payload, false), 400)
	assertAnalyticsNumber(t, analyticsSummary(t, a, ""), "views", 0)
}
