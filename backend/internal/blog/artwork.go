package blog

// Supply defaults for saved designs created before artwork was configurable.
func validArtwork(row Row) {
	for key, value := range (Row{"artworkType": "logo", "artworkEmoji": "✳", "artworkImage": ""}) {
		if _, exists := row[key]; !exists {
			row[key] = value
		}
	}
	enumField(row, "artworkType", "logo", "emoji", "image", "video")
	if _, exists := row["artworkVideo"]; exists {
		validHeroVideo(stringField(row, "artworkVideo", 0, 2048, false))
	}
	stringField(row, "artworkEmoji", 0, 32, false)
	image := stringField(row, "artworkImage", 0, 2048, false)
	if image != "" && !httpURL(image) && !logoRE.MatchString(image) {
		fail(400, "artworkImage: invalid URL")
	}
}

func publishedDesignImage(theme Row, url string) bool {
	if theme.str("logo") == url {
		return true
	}
	home := objectField(theme, "homepage")
	return home["showHero"] == true && home["showArtwork"] == true && home.str("artworkType") == "image" && home.str("artworkImage") == url
}
