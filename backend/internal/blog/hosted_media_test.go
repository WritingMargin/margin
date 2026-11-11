package blog

import (
	"strings"
	"testing"
)

func TestHostedMediaPlayers(t *testing.T) {
	cases := []struct{ provider, input, target string }{
		{"Descript", "https://share.descript.com/view/TXEDniZ8UEM?autoplay=1", "https://share.descript.com/embed/TXEDniZ8UEM"},
		{"VEED", "https://veed.io/view/3bb96100-cec4-4051-aa66-0363e0336094", "https://www.veed.io/embed/3bb96100-cec4-4051-aa66-0363e0336094"},
		{"Riverside", "https://api.riverside.fm/embeddable-components/embedded-assets/public/g8Ekqw_pE0Z_", "https://api.riverside.fm/embeddable-components/embedded-assets/public/g8Ekqw_pE0Z_"},
	}
	for _, c := range cases {
		t.Run(c.provider, func(t *testing.T) {
			for _, raw := range []string{c.input, c.target} {
				source := resolveAudio(raw)
				if source == nil || source.provider != c.provider || source.src != c.target {
					t.Fatalf("unexpected audio source: %#v", source)
				}
				target, provider := rssVideo(raw)
				if target != c.target || provider != c.provider {
					t.Fatalf("unexpected video source: %s %s", target, provider)
				}
				if coverImage(raw) != "" {
					t.Fatal("hosted player treated as image")
				}
				containsHTML(t, audioFigure(map[string]string{"src": raw, "title": "A <story>"}, true), `<iframe src="`+c.target+`"`, `A &lt;story&gt;`)
				if strings.Contains(audioFigure(map[string]string{"src": raw}, false), "<iframe") {
					t.Fatal("feed should contain source link")
				}
			}
		})
	}
}

func TestHostedMediaRejectsUnsafeURLs(t *testing.T) {
	for _, raw := range []string{
		"https://share.descript.com.evil.test/view/TXEDniZ8UEM", "https://share.descript.com:9000/view/TXEDniZ8UEM",
		"https://user:pass@share.descript.com/view/TXEDniZ8UEM", "https://share.descript.com/view/%54XEDniZ8UEM",
		"https://web.descript.com/project/TXEDniZ8UEM", "https://veed.io/edit/3bb96100-cec4-4051-aa66-0363e0336094",
		"https://api.riverside.fm/embeddable-components/embedded-assets/private/g8Ekqw_pE0Z_", "https://veed.io/view/bad-id",
	} {
		if resolveAudio(raw) != nil {
			t.Fatalf("accepted unsafe audio: %s", raw)
		}
		if target, _ := rssVideo(raw); target != "" {
			t.Fatalf("accepted unsafe video: %s", raw)
		}
	}
}
