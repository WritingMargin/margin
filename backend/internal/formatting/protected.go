package formatting

import (
	"regexp"
	"strings"
)

var containerTag = regexp.MustCompile(`(?i)^\[(/?)(callout|carousel|tabs|tab|widget|widgets|columns|column|diagram|mermaid|chart|scene|font|highlight)(\s|=|\])`)
var htmlTag = regexp.MustCompile(`(?i)^<(/?)([a-z][a-z0-9-]*)(\s|>)`)
var codeFence = regexp.MustCompile("^(`{3,}|~{3,})(.*)$")

// Conservatively lock custom containers and HTML, including unclosed ones.
// Code fences cannot accidentally close an enclosing custom container.
func protectedLines(source string) map[int]bool {
	result := map[int]bool{}
	stack := []string{}
	fence := ""
	for i, raw := range strings.Split(source, "\n") {
		line := strings.TrimSpace(raw)
		wasInside := len(stack) > 0
		match := codeFence.FindStringSubmatch(line)
		if fence != "" {
			if closesFence(match, fence) {
				fence = ""
			}
			result[i+1] = true
			continue
		}
		if match != nil {
			fence = match[1]
			result[i+1] = true
			continue
		}
		stack = containerStack(stack, line)
		result[i+1] = wasInside || len(stack) > 0
	}
	return result
}

func closesFence(match []string, fence string) bool {
	return match != nil && match[1][0] == fence[0] && len(match[1]) >= len(fence) && strings.TrimSpace(match[2]) == ""
}

func containerStack(stack []string, line string) []string {
	if match := containerTag.FindStringSubmatch(line); match != nil {
		name := strings.ToLower(match[2])
		if match[1] == "" && strings.Contains(strings.ToLower(line), "[/"+name+"]") {
			return stack
		}
		return updateStack(stack, "["+name, match[1] == "/")
	}
	if strings.HasPrefix(line, ":::") {
		marker := line[:len(line)-len(strings.TrimLeft(line, ":"))]
		return updateStack(stack, marker, strings.Trim(line, ":") == "")
	}
	return htmlStack(stack, line)
}

func htmlStack(stack []string, line string) []string {
	match := htmlTag.FindStringSubmatch(line)
	if match == nil {
		return stack
	}
	name := strings.ToLower(match[2])
	if match[1] == "/" {
		return updateStack(stack, "<"+name, true)
	}
	void := " area base br col embed hr img input link meta param source track wbr "
	if strings.Contains(void, " "+name+" ") || strings.HasSuffix(line, "/>") || strings.Contains(strings.ToLower(line), "</"+name+">") {
		return stack
	}
	return append(stack, "<"+name)
}

func updateStack(stack []string, marker string, close bool) []string {
	if !close {
		return append(stack, marker)
	}
	if len(stack) > 0 && stack[len(stack)-1] == marker {
		return stack[:len(stack)-1]
	}
	return stack
}
