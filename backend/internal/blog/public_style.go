package blog

import (
	"fmt"
	"html/template"
	"strings"
	"time"
)

var publicFonts = map[string]string{
	"serif": "'Lora',Georgia,serif", "sans": "'Inter',Arial,sans-serif", "source-serif": "'Source Serif 4',Georgia,serif", "playfair": "'Playfair Display',Georgia,serif", "dm-sans": "'DM Sans',Arial,sans-serif", "plex-mono": "'IBM Plex Mono',monospace", "caveat": "'Caveat',cursive", "kalam": "'Kalam',cursive", "dancing-script": "'Dancing Script',cursive", "oswald": "'Oswald',sans-serif",
}

func publicDate(value string) string {
	date, _ := time.Parse(time.RFC3339Nano, value)
	return date.UTC().Format("2 Jan 2006")
}
func publicReadTime(content string) int { return max(1, (len(strings.Fields(content))+199)/200) }
func publicThemeStyle(theme Row, section string) template.CSS {
	look, _ := theme[section].(map[string]any)
	font, _ := look["font"].(string)
	family := publicFonts[font]
	articleWidth, homeWidth := "var(--publication-width, 100%)", "760px"
	if look["width"] == "wide" {
		homeWidth = "1120px"
	}
	border := "color-mix(in srgb, var(--blog-text) 20%, var(--blog-background))"
	if look["border"] == "bold" {
		border = "var(--blog-text)"
	}
	// The theme is validated by parseTheme; only fixed fonts and validated colors/numbers enter CSS.
	radius, _ := look["radius"].(float64)
	heading := publicFonts[lookString(look, "headingFont", font)]
	article, _ := theme["article"].(map[string]any)
	bodySize := map[string]string{"small": "15px", "regular": "17px", "large": "20px"}[lookString(article, "bodySize", "small")]
	leading := map[string]string{"compact": "1.6", "relaxed": "1.8", "loose": "1.95"}[lookString(article, "lineSpacing", "loose")]
	return template.CSS(fmt.Sprintf("--heading-font:%s;--body-size:%s;--body-leading:%s;--article-font:%s;--article-width:%s;--home-width:%s;--accent:%s;--radius:%gpx;--theme-border:%s;--blog-background:%s;--blog-text:%s;--image-border-width:%s;--video-border-width:%s", heading, bodySize, leading, family, articleWidth, homeWidth, sectionColor(theme, look, "accent"), radius, border, sectionColor(theme, look, "background"), sectionColor(theme, look, "text"), mediaBorderWidth(theme.str("imageBorder")), mediaBorderWidth(theme.str("videoBorder")))) // #nosec G203 -- parseTheme validates colors and numbers; font, size, width and border values come from fixed choices.
}

func publicFooterStyle(theme Row) template.CSS {
	// Footer colors and font come from validTheme's fixed or validated values.
	background, text, font := theme.str("footerBackground"), theme.str("footerText"), publicFonts[theme.str("footerFont")]
	if background == "" {
		background = "transparent"
	}
	if text == "" {
		text = "inherit"
	}
	if font == "" {
		font = "inherit"
	}
	return template.CSS(fmt.Sprintf("background-color:%s;color:%s;font-family:%s", background, text, font)) // #nosec G203 -- validTheme validates colors and selects fonts from publicFonts.
}

func lookString(row Row, key, fallback string) string {
	if value := row.str(key); value != "" {
		return value
	}
	return fallback
}
