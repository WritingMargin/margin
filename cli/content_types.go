package cli

import "errors"

func validateContentType(flags map[string]string) error {
	kind, exists := flags["content-type"]
	if !exists {
		return nil
	}
	switch kind {
	case "article", "guide":
		return nil
	}
	return errors.New("--content-type must be article or guide")
}

func setContentType(body map[string]any, flags map[string]string) {
	if kind, exists := flags["content-type"]; exists {
		body["contentType"] = kind
	}
}
