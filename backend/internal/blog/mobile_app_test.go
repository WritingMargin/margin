package blog

import (
	"context"
	"testing"
)

func TestMobileDiscovery(t *testing.T) {
	for _, mount := range []string{"", "/journal"} {
		t.Run(mount, func(t *testing.T) {
			a, _ := coreFixture(t)
			t.Setenv("MARGIN_BASE_PATH", mount)
			theme := a.settings(context.Background())
			theme["name"] = "My research"
			theme["accent"] = "#8c482b"
			theme["logo"] = "/api/public/logos/12345678-1234-1234-1234-123456789abc"
			a.DB.Must(context.Background(), "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", encode(theme))
			got := responseRow(t, request(t, a, "GET", mount+"/api/public/app", nil, false), 200)
			if got.str("accent") != "#8c482b" || got.str("application") != "margin" || got.str("name") != "My research" || got.str("homePath") != mount+"/" || got.str("adminPath") != mount+"/admin" || got.str("logo") != mount+theme.str("logo") {
				t.Fatalf("Unexpected discovery: %#v", got)
			}
			if len(got) != 8 {
				t.Fatalf("Discovery must expose only public metadata: %#v", got)
			}
		})
	}
}
