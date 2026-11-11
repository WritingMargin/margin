package blog

import "net/http"

func robotsDirective(noindex, nofollow bool) string {
	if !noindex && !nofollow {
		return ""
	}
	index, follow := "index", "follow"
	if noindex {
		index = "noindex"
	}
	if nofollow {
		follow = "nofollow"
	}
	return index + ", " + follow
}

func postRobots(site, item Row) string {
	disabled := site["indexing"] == false
	seo := object(item["seo"])
	return robotsDirective(disabled || seo.yes("noindex"), disabled || seo.yes("nofollow"))
}

func (a *App) postIndexingHeader(w http.ResponseWriter, r *http.Request, item Row) {
	if directives := postRobots(a.seoSettings(r.Context()), item); directives != "" {
		w.Header().Set("X-Robots-Tag", directives)
	}
}

// Aggregated copies must not make a noindex article searchable through a feed.
func (a *App) collectionIndexingHeader(w http.ResponseWriter, r *http.Request, items []Row) {
	disabled := !a.seoSettings(r.Context()).yes("indexing")
	noindex, nofollow := disabled, disabled
	for _, item := range items {
		seo := object(item["seo"])
		noindex = noindex || seo.yes("noindex")
		nofollow = nofollow || seo.yes("nofollow")
	}
	if directives := robotsDirective(noindex, nofollow); directives != "" {
		w.Header().Set("X-Robots-Tag", directives)
	}
}
