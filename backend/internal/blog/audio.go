package blog

import (
	"html"
	"html/template"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type audioSource struct {
	provider  string
	src, link string
	spotify   bool
	height    int
}

var spotifyAudioPath = regexp.MustCompile(`^/(?:intl-[a-z-]+/)?(?:embed/)?(episode|show|track|album|playlist|artist)/([a-zA-Z0-9]{22})/?$`)
var directAudioPath = regexp.MustCompile(`(?i)\.(mp3|m4a|aac|wav|ogg|oga|flac)$`)

func resolveAudio(raw string) *audioSource { return resolveAudioMode(raw, "player") }
func resolveAudioMode(raw, mode string) *audioSource {
	raw = strings.TrimSpace(raw)
	if audioUploadRE.MatchString(previewMediaBase(raw)) {
		return &audioSource{src: raw, link: raw}
	}
	u, err := url.Parse(raw)
	if err != nil || !rssPublicURL(u) {
		return nil
	}
	if strings.EqualFold(u.Hostname(), "open.spotify.com") {
		return spotifyAudio(u, mode)
	}
	if strings.HasSuffix(strings.ToLower(u.Hostname()), "soundcloud.com") {
		return soundcloudAudio(u, mode)
	}
	if hosted := hostedMediaURL(u); hosted != nil {
		return hosted
	}
	if directAudioPath.MatchString(u.EscapedPath()) {
		return &audioSource{src: u.String(), link: u.String()}
	}
	return nil
}
func spotifyAudio(u *url.URL, mode string) *audioSource {
	if u.Port() != "" {
		return nil
	}
	match := spotifyAudioPath.FindStringSubmatch(u.EscapedPath())
	if match == nil {
		return nil
	}
	path := match[1] + "/" + match[2]
	height := 352
	if mode != "preview" && (match[1] == "episode" || match[1] == "track") {
		height = 152
	}
	return &audioSource{src: "https://open.spotify.com/embed/" + path, link: "https://open.spotify.com/" + path, spotify: true, provider: "Spotify", height: height}
}
func coverImage(raw string) string {
	if resolveAudio(raw) != nil {
		return ""
	}
	if source, _ := heroVideoSource(raw); source != "" {
		return ""
	}
	return raw
}
func audioFigure(attrs map[string]string, styled bool) string {
	source := resolveAudioMode(attrs["src"], attrs["mode"])
	if source == nil {
		return `<p class="audio-error">Add a valid audio or Spotify URL.</p>`
	}
	title := attrs["title"]
	if title == "" {
		title = "Listen to this article"
	}
	link := `<a class="audio-source" href="` + html.EscapeString(mediaPath(source.link)) + `">` + html.EscapeString(title) + `</a>`
	if !styled {
		return rssFigure(link, attrs["caption"])
	}
	player := `<div class="audio-media audio-file"><span class="audio-title">` + html.EscapeString(title) + `</span><audio src="` + html.EscapeString(mediaPath(source.src)) + `" controls="" preload="none" aria-label="` + html.EscapeString(title) + `"></audio>` + link + `</div>`
	if source.provider != "" {
		player = `<div class="audio-media audio-spotify"><iframe src="` + html.EscapeString(source.src) + `" title="` + source.provider + `: ` + html.EscapeString(title) + `" width="100%" height="` + strconv.Itoa(source.height) + `" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" referrerpolicy="strict-origin-when-cross-origin"></iframe>` + link + `</div>`
	}
	return strings.Replace(rssFigure(player, attrs["caption"]), "<figure>", audioFigureClass(attrs), 1)
}

// Only renderer-owned HTML and validated media URLs enter template.HTML.
func publicCover(raw, title, mode string, thumbnail bool) template.HTML {
	if resolveAudio(raw) != nil {
		if thumbnail {
			return template.HTML(`<span class="audio-cover-badge">Listen &amp; read</span>`)
		}
		return template.HTML(`<div class="article-audio-cover">` + audioFigure(map[string]string{"src": raw, "title": title, "mode": mode}, true) + `</div>`) // #nosec G203 -- audioFigure validates the provider URL and HTML-escapes all interpolated attributes.
	}
	if source, _ := heroVideoSource(raw); source != "" {
		return publicVideoCover(raw, title, thumbnail)
	}
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || (!rssPublicURL(u) && !coverRE.MatchString(previewMediaBase(raw)) && !assetRE.MatchString(previewMediaBase(raw))) {
		return ""
	}
	class := ` class="article-cover"`
	if thumbnail {
		class = ` loading="lazy"`
	}
	return template.HTML(`<img` + class + ` src="` + html.EscapeString(mediaPath(raw)) + `" alt="">`) // #nosec G203 -- The image URL is HTML-escaped in a quoted src attribute; the remaining markup is fixed.
}
func publicVideoCover(raw, title string, thumbnail bool) template.HTML {
	if thumbnail {
		return template.HTML(`<span class="video-cover-badge">Watch &amp; read</span>`)
	}
	return template.HTML(`<div class="article-video-cover article-cover">` + string(publicHeroVideo(raw, title)) + `</div>`) // #nosec G203 -- publicHeroVideo validates and escapes its media URL and title.
}
func audioCoverContent(cover, content string) string {
	if resolveAudio(cover) != nil {
		return "[Audio src=" + strconv.Quote(cover) + "]\n\n" + content
	}
	return content
}

func audioFigureClass(attrs map[string]string) string {
	width, align := attrs["width"], attrs["align"]
	if width != "wide" && width != "small" {
		width = "full"
	}
	if align != "left" && align != "right" {
		align = "center"
	}
	return `<figure class="md-media md-width-` + width + ` md-align-` + align + `">`
}

var soundcloudTrackPath = regexp.MustCompile(`^/[a-zA-Z0-9_-]+/(?:sets/)?[a-zA-Z0-9_-]+(?:/s-[a-zA-Z0-9]+)?/?$`)
var soundcloudAPIPath = regexp.MustCompile(`^/(tracks|playlists)/[0-9]+/?$`)
var soundcloudSecret = regexp.MustCompile(`^s-[a-zA-Z0-9]+$`)

func soundcloudTarget(u *url.URL) *url.URL {
	host := strings.ToLower(u.Hostname())
	if u.Port() != "" {
		return nil
	}
	switch host {
	case "soundcloud.com", "www.soundcloud.com":
		if !soundcloudTrackPath.MatchString(u.EscapedPath()) {
			return nil
		}
		host = "soundcloud.com"
	case "api.soundcloud.com":
		if !soundcloudAPIPath.MatchString(u.EscapedPath()) {
			return nil
		}
	default:
		return nil
	}
	target := &url.URL{Scheme: "https", Host: host, Path: u.Path}
	if secret := u.Query().Get("secret_token"); soundcloudSecret.MatchString(secret) {
		target.RawQuery = url.Values{"secret_token": {secret}}.Encode()
	}
	return target
}
func soundcloudAudio(u *url.URL, mode string) *audioSource {
	if strings.EqualFold(u.Hostname(), "w.soundcloud.com") {
		if u.Port() != "" || u.Path != "/player/" {
			return nil
		}
		nested, err := url.Parse(u.Query().Get("url"))
		if err != nil || !rssPublicURL(nested) {
			return nil
		}
		u = nested
	}
	target := soundcloudTarget(u)
	if target == nil {
		return nil
	}
	preview := mode == "preview"
	height := 166
	if preview {
		height = 450
	}
	query := url.Values{"url": {target.String()}, "auto_play": {"false"}, "visual": {strconv.FormatBool(preview)}, "show_artwork": {strconv.FormatBool(preview)}}
	return &audioSource{src: "https://w.soundcloud.com/player/?" + query.Encode(), link: target.String(), provider: "SoundCloud", height: height}
}

func audioMarker(name string) bool {
	return name == "audio" || name == "spotify" || name == "soundcloud"
}
