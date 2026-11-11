package blog

import (
	"html"
	"regexp"
	"strings"
)

var rssHTMLParts = regexp.MustCompile(`<[^>]*>|[^<]+`)
var rssFontMarker = regexp.MustCompile(`(?i)\[Font\s*=\s*(?:"|&quot;|'|&#39;)([^"'\r\n]{1,100}?)(?:"|&quot;|'|&#39;)\]|\[(Highlight)\]|\[/(Font|Highlight)\]`)

type rssFontToken struct {
	start, end int
	name, font string
	close      bool
}

var rssFontNames = map[string]string{
	"serif": "serif", "lora": "serif", "sans": "sans", "inter": "sans", "source-serif": "source-serif", "source serif 4": "source-serif", "playfair": "playfair", "playfair display": "playfair", "dm-sans": "dm-sans", "dm sans": "dm-sans", "plex-mono": "plex-mono", "ibm plex mono": "plex-mono", "caveat": "caveat", "kalam": "kalam", "dancing-script": "dancing-script", "dancing script": "dancing-script", "oswald": "oswald",
}

func rssFontTokens(content string) []rssFontToken {
	tokens := []rssFontToken{}
	code := false
	for _, part := range rssHTMLParts.FindAllStringIndex(content, -1) {
		value := content[part[0]:part[1]]
		if strings.HasPrefix(value, "<") {
			if strings.HasPrefix(value, "<code") {
				code = true
			}
			if value == "</code>" {
				code = false
			}
			continue
		}
		if code {
			continue
		}
		for _, match := range rssFontMarker.FindAllStringSubmatchIndex(value, -1) {
			token := rssReadFontToken(value, part[0], match)
			if !rssFontObstructed(value[match[0]:match[1]]) {
				tokens = append(tokens, token)
			}
		}
	}
	return tokens
}
func rssReadFontToken(value string, offset int, match []int) rssFontToken {
	token := rssFontToken{start: offset + match[0], end: offset + match[1], name: "font"}
	if match[2] >= 0 {
		token.font = rssFontNames[strings.ToLower(strings.TrimSpace(html.UnescapeString(value[match[2]:match[3]])))]
	}
	if match[4] >= 0 {
		token.name = "highlight"
	}
	if match[6] >= 0 {
		token.name = strings.ToLower(value[match[6]:match[7]])
		token.close = true
	}
	return token
}

type rssFontPair struct {
	open, close rssFontToken
	block       bool
	flatten     bool
}

func rssFontPairs(content string) []rssFontPair {
	stack := []rssFontToken{}
	pairs := []rssFontPair{}
	for _, token := range rssFontTokens(content) {
		if !token.close {
			stack = append(stack, token)
			continue
		}
		if len(stack) == 0 || stack[len(stack)-1].name != token.name {
			continue
		}
		opening := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		block := rssFontIsBlock(content, opening, token, len(stack))
		pairs = append(pairs, rssFontPair{open: opening, close: token, block: block, flatten: len(stack) >= 32})
	}
	return pairs
}
func rssFonts(content string) string {
	replacements := map[int]struct {
		end  int
		html string
	}{}
	for _, pair := range rssFontPairs(content) {
		open, close := rssFontWrapper(pair)
		replacements[pair.open.start] = struct {
			end  int
			html string
		}{pair.open.end, open}
		replacements[pair.close.start] = struct {
			end  int
			html string
		}{pair.close.end, close}
	}
	var out strings.Builder
	for i := 0; i < len(content); {
		if replace, ok := replacements[i]; ok {
			out.WriteString(replace.html)
			i = replace.end
		} else {
			out.WriteByte(content[i])
			i++
		}
	}
	return strings.ReplaceAll(out.String(), "<p></p>", "")
}
func rssFontWrapper(pair rssFontPair) (string, string) {
	if pair.flatten {
		return "", ""
	}
	tag := "span"
	if pair.open.name == "highlight" {
		tag = "mark"
	}
	if pair.block {
		tag = "div"
	}
	attr := ""
	if pair.open.font != "" {
		attr = ` data-font="` + pair.open.font + `"`
	}
	open, close := "<"+tag+attr+">", "</"+tag+">"
	if pair.block {
		open = "</p>" + open + "<p>"
		close = "</p>" + close + "<p>"
	}
	return open, close
}

func rssFontIsBlock(content string, open, close rssFontToken, depth int) bool {
	return depth < 32 && close.name == "font" && strings.Contains(content[open.end:close.start], "</p>")
}

func rssFontObstructed(marker string) bool {
	return strings.Contains(marker, "MARGINRSS") || strings.Contains(marker, "://")
}
