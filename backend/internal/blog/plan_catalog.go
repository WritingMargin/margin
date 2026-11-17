package blog

import (
	_ "embed"
	"encoding/json"
)

//go:embed plan-catalog.generated.json
var planCatalogJSON []byte

var planCatalog = func() Row {
	var catalog Row
	must(json.Unmarshal(planCatalogJSON, &catalog))
	return catalog
}()

func enginePlan(id string) Row {
	for _, value := range arrayValue(planCatalog, "plans") {
		plan := object(value)
		if plan.str("id") == id {
			return plan
		}
	}
	return nil
}

func enginePlanFeature(id, feature string) bool {
	return object(enginePlan(id)["entitlements"]).yes(feature)
}

func pricingPlanID(row Row, key string) {
	id := stringField(row, key, 1, 64, false)
	if id != "free" && enginePlan(id) == nil {
		panic("unknown pricing plan")
	}
}
