package blog

import (
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

func rssVideoFigure(attrs map[string]string) string {
	target, provider := rssVideo(attrs["src"])
	content := `<video src="` + html.EscapeString(attrs["src"]) + `" controls=""></video>`
	if target != "" {
		title := attrs["title"]
		if title == "" {
			title = attrs["caption"]
		}
		if title == "" {
			title = "Watch on " + provider
		}
		content = `<a href="` + html.EscapeString(target) + `">` + html.EscapeString(title) + `</a>`
	}
	return rssFigure(content, attrs["caption"])
}
func rssVideo(raw string) (string, string) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", ""
	}
	if !rssPublicURL(u) {
		return "", ""
	}
	host := strings.ToLower(u.Hostname())
	if rssYouTubeHosts[host] {
		return rssYouTube(u), "YouTube"
	}
	if host == "vimeo.com" || host == "www.vimeo.com" || host == "player.vimeo.com" {
		return rssVimeo(u), "Vimeo"
	}
	return rssOtherVideo(u, host)
}

var rssYouTubeHosts = map[string]bool{"youtube.com": true, "www.youtube.com": true, "m.youtube.com": true, "youtube-nocookie.com": true, "www.youtube-nocookie.com": true, "youtu.be": true, "www.youtu.be": true}
var rssVideoID = regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`)
var rssAlphaID = regexp.MustCompile(`^[a-zA-Z0-9]+$`)
var rssSecondsPattern = regexp.MustCompile(`^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$`)
var rssDigits = regexp.MustCompile(`^\d+$`)

func rssSeconds(value string) string {
	if rssDigits.MatchString(value) {
		n, _ := strconv.Atoi(value)
		return strconv.Itoa(n)
	}
	match := rssSecondsPattern.FindStringSubmatch(value)
	if match == nil || value == "" {
		return ""
	}
	hours, _ := strconv.Atoi(match[1])
	minutes, _ := strconv.Atoi(match[2])
	seconds, _ := strconv.Atoi(match[3])
	return strconv.Itoa(hours*3600 + minutes*60 + seconds)
}
func rssYouTubeID(u *url.URL) string {
	parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
	if strings.HasSuffix(u.Hostname(), "youtu.be") {
		return parts[0]
	}
	if u.EscapedPath() == "/watch" {
		return u.Query().Get("v")
	}
	allowed := map[string]bool{"embed": true, "shorts": true, "live": true}
	if len(parts) >= 2 && allowed[parts[0]] {
		return parts[1]
	}
	return ""
}
func rssYouTube(u *url.URL) string {
	id := rssYouTubeID(u)
	if !rssVideoID.MatchString(id) {
		return ""
	}
	target := "https://www.youtube-nocookie.com/embed/" + id
	start := u.Query().Get("start")
	if start == "" {
		start = u.Query().Get("t")
	}
	if start == "" {
		fragment, _ := url.ParseQuery(u.Fragment)
		start = fragment.Get("t")
	}
	if seconds := rssSeconds(start); seconds != "" {
		target += "?start=" + seconds
	}
	return target
}

var rssVimeoPath = regexp.MustCompile(`^(?:/video)?/(\d+)(?:/([a-zA-Z0-9]+))?/?$`)
var rssVimeoGroup = regexp.MustCompile(`^/(?:channels/[^/]+|groups/[^/]+/videos)/(\d+)/?$`)

func rssVimeo(u *url.URL) string {
	match := rssVimeoPath.FindStringSubmatch(u.EscapedPath())
	if match == nil {
		match = rssVimeoGroup.FindStringSubmatch(u.EscapedPath())
	}
	if match == nil {
		return ""
	}
	target := "https://player.vimeo.com/video/" + match[1]
	secret := u.Query().Get("h")
	if secret == "" && len(match) > 2 {
		secret = match[2]
	}
	if secret != "" {
		if !rssAlphaID.MatchString(secret) {
			return ""
		}
		target += "?h=" + secret
	}
	fragment, _ := url.ParseQuery(u.Fragment)
	if seconds := rssSeconds(fragment.Get("t")); seconds != "" {
		target += "#t=" + seconds + "s"
	}
	return target
}
func rssOtherVideo(u *url.URL, host string) (string, string) {
	if hosted := hostedMediaURL(u); hosted != nil {
		return hosted.src, hosted.provider
	}
	switch host {
	case "player.mux.com":
		if !rssMuxPath.MatchString(u.EscapedPath()) {
			return "", ""
		}
		u.Scheme = "https"
		u.Host = host
		u.RawQuery = rssVideoQuery(u.RawQuery, "autoplay", "", true)
		return u.String(), "Mux"
	case "player.cloudinary.com":
		return rssCloudinary(u)
	}
	if !strings.HasSuffix(strings.ToLower(u.EscapedPath()), ".m3u8") {
		return "", ""
	}
	provider := map[string]string{"stream.mux.com": "Mux", "res.cloudinary.com": "Cloudinary"}[host]
	if provider == "" {
		provider = "Video"
	}
	return u.String(), provider
}
func rssCloudinary(u *url.URL) (string, string) {
	query := u.Query()
	if strings.TrimSuffix(u.EscapedPath(), "/") != "/embed" || query.Get("cloud_name") == "" || query.Get("public_id") == "" {
		return "", ""
	}
	u.Scheme = "https"
	u.Host = u.Hostname()
	u.RawQuery = rssVideoQuery(u.RawQuery, "player[autoplay]", "false", false)
	return u.String(), "Cloudinary"
}

var rssMuxPath = regexp.MustCompile(`^/[a-zA-Z0-9]+/?$`)

func rssVideoQuery(raw, key, value string, remove bool) string {
	pairs := []string{}
	found := false
	for _, pair := range strings.Split(raw, "&") {
		if pair == "" {
			continue
		}
		name, item := rssQueryPair(pair)
		if name == key {
			if remove || found {
				continue
			}
			found = true
			item = value
		}
		pairs = append(pairs, rssEncodePair(name, item))
	}
	if !remove && !found {
		pairs = append(pairs, rssEncodePair(key, value))
	}
	return strings.Join(pairs, "&")
}
func rssQueryPair(pair string) (string, string) {
	name, value, _ := strings.Cut(pair, "=")
	name, _ = url.QueryUnescape(name)
	value, _ = url.QueryUnescape(value)
	return name, value
}
func rssEncodePair(name, value string) string {
	return strings.ReplaceAll(url.QueryEscape(name)+"="+url.QueryEscape(value), "~", "%7E")
}
