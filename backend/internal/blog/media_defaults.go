package blog

import "net/http"

func defaultMediaSettings() Row {
	return Row{
		"audio": Row{"mode": "player"}, "link": Row{"mode": "preview"},
		"image": Row{"frame": "auto", "width": "full", "align": "center"},
		"video": Row{"frame": "auto", "width": "full", "align": "center", "ratio": "auto", "wrap": "false"},
	}
}
func validMediaDefaults(input Row) Row {
	strict(input, "image", "video", "audio", "link")
	return Row{"audio": validEmbedDefault(input, "audio", "player"), "link": validEmbedDefault(input, "link", "preview"), "image": validMediaLayout(object(input["image"]), false), "video": validMediaLayout(object(input["video"]), true)}
}
func validMediaLayout(input Row, video bool) Row {
	keys := []string{"frame", "width", "align"}
	widths := []string{"full", "wide", "small"}
	if video {
		keys = append(keys, "ratio", "wrap")
		widths = append(widths, "two-thirds", "half", "third", "75%", "40%")
	}
	strict(input, keys...)
	result := Row{"frame": enumField(input, "frame", "auto", "plain", "border", "polaroid"), "width": enumField(input, "width", widths...), "align": enumField(input, "align", "left", "center", "right")}
	if video {
		result["ratio"] = enumField(input, "ratio", "auto", "16:9", "4:3", "1:1", "9:16", "21:9")
		result["wrap"] = enumField(input, "wrap", "true", "false")
	}
	return result
}
func (a *App) mediaDefaultsRoutes() {
	a.mux.HandleFunc("GET /api/settings/media", func(w http.ResponseWriter, r *http.Request) {
		send(w, 200, a.siteSetting(r.Context(), "media", defaultMediaSettings(), validMediaDefaults))
	})
	a.mux.HandleFunc("PUT /api/settings/media", func(w http.ResponseWriter, r *http.Request) {
		settings := validMediaDefaults(body(w, r))
		a.saveSiteSetting(r.Context(), "media", settings)
		send(w, 200, settings)
	})
}

func validEmbedDefault(input Row, key, fallback string) Row {
	if _, exists := input[key]; !exists {
		return Row{"mode": fallback}
	}
	settings := objectField(input, key)
	strict(settings, "mode")
	compact := "player"
	if key == "link" {
		compact = "link"
	}
	return Row{"mode": enumField(settings, "mode", compact, "preview")}
}
