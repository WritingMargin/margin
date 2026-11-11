package blog

import (
	"bytes"
	_ "embed"
	"html/template"
	"strings"
)

//go:embed newsletter_confirmation.html
var newsletterConfirmationSource string

var newsletterConfirmationTemplate = template.Must(template.New("newsletter-confirmation").Parse(newsletterConfirmationSource))

func newsletterConfirmationForPublication(name, origin, confirmation, unsubscribe string) string {
	if strings.TrimSpace(name) == "" {
		name = "The journal"
	}
	origin = strings.TrimRight(origin, "/")
	var out bytes.Buffer
	must(newsletterConfirmationTemplate.Execute(&out, struct {
		Name, PublicationURL, ConfirmationURL, UnsubscribeURL string
		Preview                                               bool
	}{name, origin, origin + "/newsletter/confirm#" + confirmation, origin + "/newsletter/unsubscribe#" + unsubscribe, false}))
	return out.String()
}
