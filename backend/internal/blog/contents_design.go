package blog

import (
	"fmt"
	"strconv"
	"strings"
)

func validContentsDesign(row Row) {
	_, exists := row["tableOfContents"]
	if !exists {
		return
	}
	design := objectField(row, "tableOfContents")
	strict(design, "title", "style", "numbered", "maxDepth", "sticky", "width", "radius", "background", "text", "accent")
	if _, exists := design["title"]; exists {
		stringField(design, "title", 0, 80, false)
	}
	optionalEnum(design, "style", "plain", "outlined", "filled")
	for _, key := range []string{"numbered", "sticky"} {
		if _, exists := design[key]; exists {
			booleanField(design, key)
		}
	}
	for _, key := range []string{"background", "text", "accent"} {
		if _, exists := design[key]; exists {
			colorField(design, key)
		}
	}
	validContentsNumber(design, "maxDepth", 1, 6)
	validContentsNumber(design, "width", 160, 320)
	validContentsNumber(design, "radius", 0, 32)
}

func validContentsNumber(design Row, key string, low, high float64) {
	raw, exists := design[key]
	if !exists {
		return
	}
	value, ok := raw.(float64)
	if !ok || value < low || value > high || value != float64(int(value)) {
		fail(400, key+": invalid value")
	}
}

func contentsDesignStyle(design Row) string {
	values := []string{}
	for _, key := range []string{"width", "radius"} {
		if value, ok := design[key].(float64); ok {
			values = append(values, fmt.Sprintf("--toc-%s:%gpx", key, value))
		}
	}
	for _, key := range []string{"background", "text", "accent"} {
		if value, ok := design[key].(string); ok {
			values = append(values, "--toc-"+key+":"+value)
		}
	}
	return strings.Join(values, ";")
}

func contentsDesign(theme Row) Row {
	article, _ := theme["article"].(map[string]any)
	design, _ := article["tableOfContents"].(map[string]any)
	return Row(design)
}

func contentsBool(design Row, key string, fallback bool) string {
	value, ok := design[key].(bool)
	if !ok {
		value = fallback
	}
	return strconv.FormatBool(value)
}
