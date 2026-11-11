package blog

import (
	_ "embed"
	"encoding/json"
	"net/http"
)

//go:embed publication-labels.json
var publicationLabelsJSON []byte

type PublicationCopy struct {
	Label, Singular, Plural, Heading, Navigation, Eyebrow, SchemaType string
}

var publicationLabels = func() map[string]PublicationCopy {
	var labels map[string]PublicationCopy
	must(json.Unmarshal(publicationLabelsJSON, &labels))
	return labels
}()

func publicationCopy(theme Row) PublicationCopy {
	return publicationLabels[theme.str("publicationType")]
}

func validPublication(input Row) string {
	strict(input, "type")
	return enumField(input, "type", "blog", "article", "research")
}

func (a *App) readPublication(w http.ResponseWriter, r *http.Request) {
	send(w, 200, Row{"type": a.settings(r.Context()).str("publicationType")})
}
func (a *App) savePublication(w http.ResponseWriter, r *http.Request) {
	kind := validPublication(body(w, r))
	initial := defaultTheme()
	initial["publicationType"] = kind
	query := "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=jsonb_set(settings.theme,'{publicationType}',to_jsonb($2::text))"
	if a.DB.Kind == "sqlite" {
		query = "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=json_set(settings.theme,'$.publicationType',$2)"
	}
	a.DB.Must(r.Context(), query, encode(initial), kind)
	send(w, 200, Row{"type": kind})
}
