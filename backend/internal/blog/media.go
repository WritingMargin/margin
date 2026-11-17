package blog

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"time"
)

var mediaFolderRE = regexp.MustCompile(`^[a-zA-Z0-9_/-]+$`)

func (a *App) mediaRoutes() {
	a.videoRoutes()
	a.audioRoutes()
	a.mux.HandleFunc("POST /api/media/preview", a.previewLink)
	a.mux.HandleFunc("GET /api/media", a.listMedia)
	a.mux.HandleFunc("GET /api/media/images", a.listImages)
	a.mux.HandleFunc("POST /api/media/sign", a.signMedia)
}

// @Summary List reusable images
// @ID listImages
// @Description Returns uploaded and generated images, including private draft images, with reusable canonical secure_url values. Store these unchanged in post content, cover or seo.image. source=cloudinary also appends up to 100 Cloudinary images and requires the Cloudinary integration. The default uploads library needs no provider connection.
// @Tags Media
// @Security BearerAuth
// @Produce json
// @Param source query string false "Library source" Enums(uploads,cloudinary) default(uploads)
// @Success 200 {object} APIMediaLibrary
// @Failure 400 {object} APIError "Invalid source"
// @Failure 401 {object} APIError "Missing or invalid API key"
// @Failure 503 {object} APIError "Cloudinary is not configured"
// @Router /api/media/images [get]
func (a *App) listImages(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	if source != "" && source != "uploads" && source != "cloudinary" {
		fail(400, "source: choose uploads or cloudinary")
	}
	result := []Row{}
	for _, item := range a.DB.Must(r.Context(), "SELECT id FROM uploaded_covers ORDER BY id") {
		result = append(result, Row{"public_id": item["id"], "secure_url": "/api/public/covers/" + item.str("id"), "resource_type": "image"})
	}
	for _, item := range a.DB.Must(r.Context(), "SELECT id,prompt FROM generated_assets ORDER BY created_at DESC") {
		result = append(result, Row{"public_id": item["id"], "title": generatedImageTitle(item.str("prompt")), "secure_url": "/api/assets/" + item.str("id") + ".png", "resource_type": "image"})
	}
	if r.URL.Query().Get("source") == "cloudinary" {
		config := cloudinary()
		if config == nil {
			fail(503, "Configure Cloudinary before opening its library.")
		}
		result = append(result, a.mediaResources(r.Context(), config, "image")...)
	}
	send(w, 200, Row{"resources": result})
}
func cloudinary() Row {
	cloud, key, secret := os.Getenv("CLOUDINARY_CLOUD_NAME"), os.Getenv("CLOUDINARY_API_KEY"), os.Getenv("CLOUDINARY_API_SECRET")
	if !keyRE.MatchString(cloud) || key == "" || secret == "" {
		return nil
	}
	return Row{"cloudName": cloud, "apiKey": key, "secret": secret}
}
func (a *App) listMedia(w http.ResponseWriter, r *http.Request) {
	config := cloudinary()
	result := []Row{}
	if config != nil {
		for _, kind := range []string{"image", "video"} {
			result = append(result, a.mediaResources(r.Context(), config, kind)...)
		}
	}
	send(w, 200, Row{"configured": config != nil, "resources": result})
}
func (a *App) mediaResources(ctx context.Context, config Row, kind string) []Row {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, "GET", "https://api.cloudinary.com/v1_1/"+config.str("cloudName")+"/resources/"+kind+"/upload?max_results=100", nil)
	must(err)
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(config.str("apiKey")+":"+config.str("secret"))))
	response, err := a.Client.Do(request)
	must(err)
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		fail(502, "Cloudinary could not list your assets. Check its credentials.")
	}
	var payload struct {
		Resources []Row `json:"resources"`
	}
	must(json.NewDecoder(response.Body).Decode(&payload))
	result := []Row{}
	for _, item := range payload.Resources {
		entry := Row{}
		for _, field := range []string{"public_id", "secure_url", "resource_type", "format", "width", "height"} {
			if value, ok := item[field]; ok {
				entry[field] = value
			}
		}
		result = append(result, entry)
	}
	return result
}
func (a *App) signMedia(w http.ResponseWriter, r *http.Request) {
	config := cloudinary()
	if config == nil {
		fail(503, "Configure Cloudinary before uploading media.")
	}
	input := optionalBody(w, r)
	folder := "margin"
	if _, ok := input["folder"]; ok {
		folder = stringField(input, "folder", 0, 100, false)
	}
	if !mediaFolderRE.MatchString(folder) {
		fail(400, "folder: invalid folder")
	}
	timestamp := time.Now().Unix()
	digest := sha256.Sum256([]byte(fmt.Sprintf("folder=%s&timestamp=%d%s", folder, timestamp, config.str("secret"))))
	send(w, 200, Row{"signature": hex.EncodeToString(digest[:]), "timestamp": timestamp, "apiKey": config["apiKey"], "cloudName": config["cloudName"], "folder": folder})
}
