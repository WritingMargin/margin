package blog

import (
	"html"
	"html/template"
	"net/url"
	"regexp"
	"strings"
)

var heroDirectVideo = regexp.MustCompile(`(?i)\.(mp4|webm|og[gv]|m4v|m3u8)$`)
var heroCloudinaryVideo = regexp.MustCompile(`^/[^/]+/video/(upload|fetch|authenticated)/.+`)

// Match the trusted player/direct-file contract used by the browser's resolveVideo.
func heroVideoSource(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if videoUploadRE.MatchString(previewMediaBase(raw)) {
		return raw, false
	}
	parsed, err := url.Parse(raw)
	if err != nil || !rssPublicURL(parsed) {
		return "", false
	}
	if target, _ := rssVideo(raw); target != "" {
		targetURL, _ := url.Parse(target)
		return target, !heroDirectVideo.MatchString(targetURL.Path)
	}
	if knownHeroPlayer(strings.ToLower(parsed.Hostname())) {
		return "", false
	}
	if heroDirectVideo.MatchString(parsed.Path) {
		return parsed.String(), false
	}
	if strings.EqualFold(parsed.Hostname(), "res.cloudinary.com") && heroCloudinaryVideo.MatchString(parsed.Path) {
		return parsed.String(), false
	}
	return "", false
}

func validHeroVideo(value string) {
	if source, _ := heroVideoSource(value); value != "" && source == "" {
		fail(400, "Use a supported hero video URL or an uploaded video path.")
	}
}

func publicHeroVideo(raw, title string) template.HTML {
	source, embed := heroVideoSource(raw)
	if source == "" {
		return ""
	}
	if title == "" {
		title = "Homepage video"
	}
	src, label := html.EscapeString(mediaPath(source)), html.EscapeString(title)
	provider, _ := analyticsVideoProvider(raw)
	attributes := ` data-media-id="` + mediaIdentity("video", raw) + `" data-media-provider="` + html.EscapeString(provider) + `"`
	if embed {
		return template.HTML(`<div class="video-embed"` + attributes + ` style="--video-ratio:16 / 9"><iframe src="` + src + `" title="` + label + `" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`)
	}
	return template.HTML(`<div class="video-file"` + attributes + ` style="--video-ratio:16 / 9"><video src="` + src + `" aria-label="` + label + `" controls playsinline preload="metadata"></video></div>`)
}

func publishedDesignVideo(theme Row, address string) bool {
	for _, source := range publishedHeroVideoSources(theme) {
		if strings.TrimSpace(source) == address {
			return true
		}
	}
	return false
}

// Use the same visible sources for upload access and playback attribution.
func publishedHeroVideoSources(theme Row) []string {
	home := object(theme["homepage"])
	if !home.yes("showHero") {
		return nil
	}
	sections, composed := home["sections"].([]any)
	if !composed {
		if home.yes("showArtwork") && home.str("artworkType") == "video" {
			return []string{home.str("artworkVideo")}
		}
		return nil
	}
	var sources []string
	for _, value := range sections {
		section := object(value)
		if section.str("component") == "hero" {
			sources = append(sources, templateHeroVideo(object(section["props"]), home))
		}
	}
	return sources
}

func templateHeroVideo(props, home Row) string {
	if props.str("mediaType") != "video" {
		return ""
	}
	source, exists := props["video"]
	if !exists {
		source = home.str("artworkVideo")
	}
	value, _ := source.(string)
	if resolved, _ := heroVideoSource(value); resolved != "" {
		return value
	}
	return ""
}

func knownHeroPlayer(host string) bool {
	return rssYouTubeHosts[host] || host == "vimeo.com" || host == "www.vimeo.com" || host == "player.vimeo.com" || host == "player.mux.com" || host == "player.cloudinary.com"
}
