package blog

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
)

const maxArticleImageBytes = 10 << 20

// Large JSON uploads are decoded only after authorization, unlike small API bodies.
func isJSONMediaUpload(r *http.Request) bool {
	return r.Method == "POST" && (r.URL.Path == "/api/media/images" || r.URL.Path == "/api/media/videos" || r.URL.Path == "/api/media/audio")
}

// @Summary Upload an article image using JSON
// @ID uploadImage
// @Description Supply url to import a public HTTP(S) image (bounded redirects and size; internal addresses are blocked), or send standard base64-encoded PNG, JPEG, WebP or GIF bytes (up to 10 MiB decoded), without a data-URL prefix. Content-Type must be application/json. contentType is required for data and optional for url; when supplied it must match the file. Returns a canonical image URL for Markdown content, cover, or seo.image. Uploading alone does not attach the image or change a post. Read the post, insert ![Alt text](returned URL) into its content, then call updatePost with the latest revision. Unused and draft-only uploads are private; images become public when referenced by a published post or site-wide SEO. Store the returned URL unchanged, including when Margin is mounted under a base path.
// @Tags Media
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param input body APIUploadImage true "Base64 image"
// @Success 201 {object} APIUploadedImage
// @Failure 400 {object} APIError "Invalid JSON, base64 or image type"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 403 {object} APIError "Role does not permit uploads"
// @Failure 413 {object} APIError "Image exceeds 10 MiB or JSON request exceeds the encoded limit"
// @Router /api/media/images [post]
func (a *App) uploadImageJSON(w http.ResponseWriter, r *http.Request) {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		fail(400, "Use application/json for base64 image uploads.")
	}
	limit := base64.StdEncoding.EncodedLen(maxArticleImageBytes)
	r = parseJSONRequestBody(w, r, int64(limit+1024))
	input := body(w, r)
	strict(input, "contentType", "data", "url")
	data := imageUploadBytes(r, input, limit)
	kind := imageType(data)
	if kind == "" {
		fail(400, "Use PNG, JPEG, WebP or GIF image bytes.")
	}
	if _, exists := input["contentType"]; exists {
		declared := enumField(input, "contentType", "image/png", "image/jpeg", "image/webp", "image/gif")
		if declared != kind {
			fail(400, "Image bytes must match contentType (PNG, JPEG, WebP or GIF).")
		}
	}

	url := a.storeUploadedImage(r.Context(), data, kind, "uploaded_covers", "assets/covers/", "/api/public/covers/")
	send(w, 201, Row{"url": url})
}

func imageUploadBytes(r *http.Request, input Row, limit int) []byte {
	_, hasURL := input["url"]
	_, hasData := input["data"]
	if hasURL == hasData {
		fail(400, "Supply exactly one of url or data.")
	}
	if hasURL {
		return fetchImageUpload(r, stringField(input, "url", 1, 2048, true))
	}
	enumField(input, "contentType", "image/png", "image/jpeg", "image/webp", "image/gif")
	encoded := stringField(input, "data", 1, limit+1024, false)
	if len(encoded) > limit {
		fail(413, "Image exceeds the base64 size limit.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil {
		fail(400, "data: use standard base64 image bytes without a data-URL prefix.")
	}
	if len(data) > maxArticleImageBytes {
		fail(413, "Image exceeds 10 MiB.")
	}
	return data
}

func fetchImageUpload(r *http.Request, source string) []byte {
	if !validLinkPreviewURL(source) {
		fail(400, "Use a public HTTP or HTTPS image URL without credentials.")
	}
	client := previewHTTPClient()
	defer client.CloseIdleConnections()
	return downloadImageUpload(r, client, source)
}

// Import errors carry a code so callers can tell a blocked or mistyped URL from a
// site that refused, timed out or returned something other than an image.
func downloadImageUpload(r *http.Request, client *http.Client, source string) []byte {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, source, nil)
	must(err)
	req.Header.Set("Accept", "image/png,image/jpeg,image/webp,image/gif")
	// Some hosts, including Wikimedia, refuse the default Go client user agent.
	req.Header.Set("User-Agent", "Margin-ImageImport/1.0")
	response, err := client.Do(req)
	if err != nil {
		failImageFetch(err)
	}
	defer response.Body.Close()
	checkImageHTTPStatus(response.StatusCode)
	data, err := io.ReadAll(io.LimitReader(response.Body, maxArticleImageBytes+1))
	if err != nil {
		failImageFetch(err)
	}
	if len(data) > maxArticleImageBytes {
		coded(413, "Image exceeds 10 MiB.", "IMAGE_TOO_LARGE")
	}
	if imageType(data) == "" {
		received := response.Header.Get("Content-Type")
		if received == "" {
			received = "an unknown type"
		}
		coded(400, "The image URL returned "+received+", not a PNG, JPEG, WebP or GIF image. Link to the image file, not the page that shows it.", "IMAGE_URL_NOT_IMAGE")
	}
	return data
}

func failImageFetch(err error) {
	var dns *net.DNSError
	var timeout interface{ Timeout() bool }
	switch {
	case errors.Is(err, errNonPublicHost):
		coded(400, "The image host resolves to a private or internal address, which Margin does not fetch.", "IMAGE_URL_BLOCKED")
	case errors.Is(err, errPreviewRedirectRefused):
		coded(400, "The image URL redirected more than 3 times or to a private, internal or non-HTTP(S) address.", "IMAGE_URL_REDIRECT_REFUSED")
	case errors.As(err, &dns) && dns.IsNotFound:
		coded(502, "The image host name could not be found.", "IMAGE_URL_UNREACHABLE")
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()):
		coded(502, "The image host did not respond in time.", "IMAGE_URL_TIMEOUT")
	}
	coded(502, "The image URL could not be fetched.", "IMAGE_URL_UNREACHABLE")
}

func checkImageHTTPStatus(status int) {
	if status != http.StatusOK {
		message := fmt.Sprintf("The image URL returned HTTP %d.", status)
		switch {
		case status == 401 || status == 403 || status == 429:
			message += " The site refused or rate-limited the download; upload the image as base64 data instead."
		case status == 404 || status == 410:
			message += " Check that the link points to the image file itself."
		}
		coded(502, message, "IMAGE_URL_HTTP_ERROR")
	}
}
