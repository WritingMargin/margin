package blog

import (
	"context"
	_ "embed"
	"net/http"
	"net/url"
)

//go:embed post-byline.html
var postBylineTemplate string

func emptyAuthorProfile() Row {
	return Row{"name": "", "image": "", "bio": "", "website": "", "links": []Row{}}
}

func validAuthorProfile(input Row) Row {
	strict(input, "name", "image", "bio", "website", "links")
	result := emptyAuthorProfile()
	for key, value := range input {
		result[key] = value
	}
	return Row{"name": stringField(result, "name", 0, 120, true), "image": seoImageField(result, "image"),
		"bio": stringField(result, "bio", 0, 600, true), "website": profileURL(result, "website"), "links": validProfileLinks(result["links"])}
}

func (a *App) authorProfile(ctx context.Context) Row {
	return a.siteSetting(ctx, "author_profile", emptyAuthorProfile(), validAuthorProfile)
}

// @Summary Read the publication author profile
// @ID getAuthorProfile
// @Description Read the shared publication byline, profile website, image, bio and links.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Success 200 {object} APIAuthorProfile
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Owner role required"
// @Router /api/settings/profile [get]
func (a *App) readAuthorProfile(w http.ResponseWriter, r *http.Request) {
	send(w, 200, a.authorProfile(r.Context()))
}

// @Summary Replace the publication author profile
// @ID updateAuthorProfile
// @Description Read getAuthorProfile first and preserve the other fields. This replaces the profile across all articles. Set name to the public author name and website to their HTTPS profile URL. An empty name hides the byline. Omitted fields reset to their defaults.
// @Tags SEO
// @Security BearerAuth
// @Produce json
// @Accept json
// @Param input body APIAuthorProfile true "Replacement publication author profile"
// @Failure 400 {object} APIError "Invalid profile"
// @Success 200 {object} APIAuthorProfile
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Owner role required"
// @Router /api/settings/profile [put]
func (a *App) saveAuthorProfile(w http.ResponseWriter, r *http.Request) {
	profile := validAuthorProfile(body(w, r))
	a.saveSiteSetting(r.Context(), "author_profile", profile)
	send(w, 200, profile)
}

func (a *App) publicAuthorProfile(ctx context.Context) Row {
	profile := a.authorProfile(ctx)
	if profile.str("name") == "" {
		return emptyAuthorProfile()
	}
	return profile
}

func profileURL(row Row, key string) string {
	value := stringField(row, key, 0, 2048, true)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || !rssPublicURL(parsed) || parsed.Scheme != "https" {
		fail(400, key+": use an HTTPS URL without credentials")
	}
	return value
}

func validProfileLinks(value any) []Row {
	links := []Row{}
	// Stored defaults and JSON input use different slice types.
	switch items := value.(type) {
	case []Row:
		links = items
	case []any:
		for _, item := range items {
			links = append(links, object(item))
		}
	default:
		fail(400, "links: expected a list")
	}
	if len(links) > 4 {
		fail(400, "Add at most four profile links")
	}
	result := []Row{}
	for _, item := range links {
		strict(item, "label", "url")
		link := Row{"label": stringField(item, "label", 1, 40, true), "url": profileURL(item, "url")}
		if link.str("url") == "" {
			fail(400, "url: required for a profile link")
		}
		result = append(result, link)
	}
	return result
}
