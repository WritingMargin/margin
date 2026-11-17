package blog

import (
	"testing"
	"time"
)

func TestAIPlanEntitlementsRejectExtraBenefits(t *testing.T) {
	for _, id := range []string{"ai-starter", "ai-studio"} {
		row := Row{"active": true, "planId": id, "expiresAt": time.Now().Add(time.Hour).Format(time.RFC3339), "email": true, "newsletter": true, "integrations": true}
		if !validEntitlements(row) {
			t.Fatalf("AI plan rejected: %s", id)
		}
		access := entitlements(row)
		if !access.yes("ai") || access.yes("email") || access.yes("newsletter") || access.yes("integrations") {
			t.Fatalf("AI-only permissions incorrect: %#v", access)
		}
	}
}

func TestPrepaidAIEntitlementsWithoutSubscription(t *testing.T) {
	row := Row{"active": false, "planId": nil, "expiresAt": nil, "ai": true, "billingModel": "prepaid", "creditBalance": float64(100)}
	if !validEntitlements(row) || !entitlements(row).yes("ai") {
		t.Fatal("prepaid account rejected")
	}
	if entitlements(row).yes("email") || entitlements(row).yes("integrations") {
		t.Fatal("prepaid credits granted subscription benefits")
	}
	for _, balance := range []any{float64(-1), float64(0.5), "100", nil} {
		row["creditBalance"] = balance
		if validEntitlements(row) {
			t.Fatalf("accepted invalid credit balance: %v", balance)
		}
	}
	row["creditBalance"] = float64(0)
	if entitlements(row).yes("ai") {
		t.Fatal("empty balance allowed AI")
	}
	row["creditBalance"] = float64(100)
	row["ai"] = false
	if entitlements(row).yes("ai") {
		t.Fatal("ignored account disablement")
	}
}
