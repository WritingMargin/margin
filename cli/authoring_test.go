package cli

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestOfflineSkillIncludesEngineAuthoringReferences(t *testing.T) {
	var output bytes.Buffer
	if err := showSkill("margin-authoring", true, &output); err != nil {
		t.Fatal(err)
	}
	var result struct {
		References map[string]string `json:"references"`
	}
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	guide, err := AuthoringGuide()
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := AuthoringBlocks()
	if err != nil {
		t.Fatal(err)
	}
	if result.References["references/content.md"] != string(guide) || result.References["references/blocks.json"] != string(catalog) {
		t.Fatal("offline skill and engine documentation differ")
	}
}
