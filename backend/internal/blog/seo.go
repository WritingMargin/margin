package blog

import (
	"net/url"
)

func applyPublicSEO(page *publicPage) {
	seo := object(page.Theme["seo"])
	page.Robots = postRobots(seo, page.Post)
	if page.Action != "" {
		page.Robots = "noindex, nofollow"
	}
	page.Verification = seo.str("googleVerification")
	page.ShareImage = seo.str("image")
	if page.Post != nil {
		page.Title = postSearchTitle(page.Post, page.Theme)
		page.Description = postSearchDescription(page.Post, page.Post.str("content"))
		page.ShareImage = postShareImage(page.Post, seo)
		resolveShareImage(page)
		articleStructuredData(page)
		return
	}
	resolveShareImage(page)
	if page.Action == "" {
		applyHomeSEO(page, seo)
		homeStructuredData(page)
	}
}
func resolveShareImage(page *publicPage) {
	if page.ShareImage == "" {
		return
	}
	base, err := url.Parse(page.Canonical)
	must(err)
	image, err := url.Parse(mediaPath(page.ShareImage))
	must(err)
	page.ShareImage = base.ResolveReference(image).String()
}
func articleStructuredData(page *publicPage) {
	data := Row{"@context": "https://schema.org", "@type": contentSchemaType(page.Theme, page.Post), "headline": page.Post["title"], "description": page.Description, "url": page.Canonical, "mainEntityOfPage": page.Canonical, "datePublished": page.Post["createdAt"], "dateModified": page.Post["updatedAt"]}
	if page.ShareImage != "" {
		data["image"] = page.ShareImage
	}
	if author := profileStructuredData(page.Theme, page.Canonical); author != nil {
		data["author"] = author
	}
	page.Structured = publicJSON(data)
}
func applyHomeSEO(page *publicPage, seo Row) {
	if title := seo.str("title"); title != "" {
		page.Title = title
	}
	if description := seo.str("description"); description != "" {
		page.Description = description
	}
}

func homeStructuredData(page *publicPage) {
	website := Row{"@type": "WebSite", "@id": page.Canonical + "#website", "name": page.Theme["name"], "description": page.Description, "url": page.Canonical}
	homepage := Row{"@type": "CollectionPage", "@id": page.Canonical + "#webpage", "name": page.Title, "description": page.Description, "url": page.Canonical, "isPartOf": Row{"@id": website["@id"]}}
	if page.ShareImage != "" {
		website["image"], homepage["image"] = page.ShareImage, page.ShareImage
	}
	page.Structured = publicJSON(Row{"@context": "https://schema.org", "@graph": []Row{website, homepage}})
}

func contentSchemaType(theme, item Row) string {
	if kind := item.str("contentType"); kind == "guide" {
		return "Article"
	}
	return publicationCopy(theme).SchemaType
}

func profileStructuredData(theme Row, canonical string) Row {
	profile := object(theme["authorProfile"])
	if profile.str("name") == "" {
		return nil
	}
	author := Row{"@type": "Person", "name": profile["name"]}
	if website := profile.str("website"); website != "" {
		author["url"] = website
	}
	if profile.str("image") != "" {
		base, _ := url.Parse(canonical)
		image, err := url.Parse(mediaPath(profile.str("image")))
		if err == nil {
			author["image"] = base.ResolveReference(image).String()
		}
	}
	return author
}
