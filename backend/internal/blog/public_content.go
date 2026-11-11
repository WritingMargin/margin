package blog

import (
	_ "embed"
	"encoding/json"
)

//go:embed content-design-defaults.json
var contentDesignDefaultsJSON []byte

// Choose the same independent content surface used by the browser renderer.
func themeForContent(theme Row, kind string) Row {
	if kind != "guide" {
		return theme
	}
	result := Row{}
	for key, value := range theme {
		result[key] = value
	}
	design := object(theme[kind])
	if len(design) == 0 {
		defaults := Row{}
		must(json.Unmarshal(contentDesignDefaultsJSON, &defaults))
		design = object(defaults[kind])
	}
	result["article"] = map[string]any(design)
	return result
}

func contentSingular(theme, item Row) string {
	switch item.str("contentType") {
	case "guide":
		return "guide"
	default:
		return publicationCopy(theme).Singular
	}
}
