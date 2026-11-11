package blog

import (
	"net/url"
	"regexp"
	"strings"
)

type hostedPlayer struct {
	provider, origin, embed, view string
	path                          *regexp.Regexp
}

var descriptPlayer = hostedPlayer{"Descript", "https://share.descript.com", "/embed/", "/view/", regexp.MustCompile(`^/(?:view|embed)/([a-zA-Z0-9_-]{6,64})/?$`)}
var veedPlayer = hostedPlayer{"VEED", "https://www.veed.io", "/embed/", "/view/", regexp.MustCompile(`^/(?:view|embed)/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/?$`)}
var riversidePlayer = hostedPlayer{"Riverside", "https://api.riverside.fm", "/embeddable-components/embedded-assets/public/", "/embeddable-components/embedded-assets/public/", regexp.MustCompile(`^/embeddable-components/embedded-assets/public/([a-zA-Z0-9_-]{6,128})/?$`)}
var hostedPlayers = map[string]hostedPlayer{"share.descript.com": descriptPlayer, "veed.io": veedPlayer, "www.veed.io": veedPlayer, "api.riverside.fm": riversidePlayer}

// Only documented public players enter an iframe; private project URLs do not.
func hostedMediaURL(u *url.URL) *audioSource {
	if !rssPublicURL(u) || u.Port() != "" {
		return nil
	}
	player, ok := hostedPlayers[strings.ToLower(u.Hostname())]
	if !ok {
		return nil
	}
	match := player.path.FindStringSubmatch(u.EscapedPath())
	if match == nil {
		return nil
	}
	return &audioSource{provider: player.provider, src: player.origin + player.embed + match[1], link: player.origin + player.view + match[1], height: 352}
}
