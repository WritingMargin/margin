package cli

// AuthoringGuide is shared by the offline skill and the engine's public guide.
func AuthoringGuide() ([]byte, error) {
	return skills.ReadFile("skills/margin-authoring/references/content.md")
}

// AuthoringBlocks contains schemas generated from the actual renderer validators.
func AuthoringBlocks() ([]byte, error) {
	return skills.ReadFile("skills/margin-authoring/references/blocks.json")
}

// DesignGuide describes the design API format and partial-edit workflow.
func DesignGuide() ([]byte, error) {
	return skills.ReadFile("skills/margin-authoring/references/design.md")
}

// DesignSchema is generated from the same schema used by the design editor.
func DesignSchema() ([]byte, error) {
	return skills.ReadFile("skills/margin-authoring/references/design.json")
}
