package blog

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"time"
)

const maxDiagramBytes = 20 << 20
const modelFilePattern = `[a-f0-9-]{36}\.(?:glb|gltf|obj|stl|json)\b`
const modelAddress = "/api/public/models/"

var modelFileID = regexp.MustCompile("^" + modelFilePattern + "$")
var modelContentTypes = map[string]string{
	"glb": "model/gltf-binary", "gltf": "model/gltf+json", "obj": "model/obj",
	"stl": "model/stl", "json": "application/json",
}

// @Summary Upload a 3D model or Three.js animation clip
// @ID uploadDiagramAsset
// @Description Send up to 20 MiB of raw file bytes. For GLB or self-contained glTF 2.0, OBJ or STL, use the returned URL as a scene model's src. For a Three.js transform clip JSON file, use it as animationSrc. Unreferenced and draft-only files are private. Publishing a post that references the file grants readers access.
// @Tags Media
// @Security BearerAuth
// @Accept octet-stream
// @Produce json
// @Param format query string true "File extension" Enums(glb,gltf,obj,stl,json)
// @Param file body string true "Raw file bytes"
// @Success 201 {object} APIUploadedDiagramAsset
// @Failure 400 {object} APIError "Invalid format or file contents"
// @Failure 401 {object} APIError "Sign-in required"
// @Failure 403 {object} APIError "Role does not permit uploads"
// @Failure 413 {object} APIError "File exceeds 20 MiB"
// @Router /api/media/models [post]
func (a *App) uploadDiagramAsset(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	kind, ok := modelContentTypes[format]
	if !ok {
		fail(400, "Choose a GLB, glTF, OBJ, STL or Three.js clip JSON file.")
	}
	if r.Header.Get("Content-Type") != "application/octet-stream" {
		fail(400, "Send raw file bytes as application/octet-stream.")
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxDiagramBytes))
	if err != nil {
		fail(413, "Each model or animation file must be 20 MiB or smaller.")
	}
	if !validDiagramFile(format, data) {
		fail(400, "The file contents do not match the selected diagram format.")
	}

	id := uuid() + "." + format
	a.storeMediaObject(r.Context(), data, kind, "uploaded_models", "assets/models/"+id, id)
	send(w, 201, APIUploadedDiagramAsset{URL: modelAddress + id})
}

type APIUploadedDiagramAsset struct {
	URL string `json:"url" binding:"required" example:"/api/public/models/00000000-0000-4000-8000-000000000000.glb"`
}

var objVertex = regexp.MustCompile(`(?m)^[ \t]*v[ \t]+[+.0-9-]`)
var stlVertex = regexp.MustCompile(`(?m)\bvertex[ \t]+[+.0-9-]`)

// Check the container at upload. The scene renderer validates geometry and binds
// animation track targets once it has the model.
func validDiagramFile(format string, data []byte) bool {
	switch format {
	case "glb":
		return validUploadedGLB(data)
	case "gltf":
		return validUploadedGLTF(data, true)
	case "json":
		return validUploadedClip(data)
	case "obj":
		return objVertex.Match(data)
	case "stl":
		return validUploadedSTL(data)
	}
	return false
}

func validUploadedClip(data []byte) bool {
	var clip struct {
		Tracks []struct {
			Name, Type    string
			Times, Values []float64
		}
	}
	if json.Unmarshal(data, &clip) != nil || len(clip.Tracks) == 0 || len(clip.Tracks) > 1000 {
		return false
	}
	for _, track := range clip.Tracks {
		if track.Name == "" || track.Type == "" || len(track.Times) == 0 || len(track.Values) == 0 {
			return false
		}
	}
	return true
}

func validUploadedSTL(data []byte) bool {
	if len(data) < 84 {
		return false
	}
	faces := uint64(binary.LittleEndian.Uint32(data[80:84]))
	if faces > 0 && 84+50*faces == uint64(len(data)) {
		return true
	}
	return bytes.HasPrefix(bytes.TrimSpace(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})), []byte("solid")) && stlVertex.Match(data)
}

func validUploadedGLB(data []byte) bool {
	if len(data) < 20 || string(data[:4]) != "glTF" || binary.LittleEndian.Uint32(data[4:]) != 2 {
		return false
	}
	if int64(binary.LittleEndian.Uint32(data[8:])) != int64(len(data)) || string(data[16:20]) != "JSON" {
		return false
	}
	length := int64(binary.LittleEndian.Uint32(data[12:]))
	if length > int64(len(data)-20) {
		return false
	}
	return validUploadedGLTF(data[20:20+length], false)
}

type gltfResource struct{ URI *string }

var embeddedBuffer = regexp.MustCompile(`(?i)^data:application/(?:octet-stream|gltf-buffer);base64,`)
var embeddedImage = regexp.MustCompile(`(?i)^data:image/(?:png|jpeg|webp);base64,`)

func validUploadedGLTF(data []byte, jsonFormat bool) bool {
	var model struct {
		Asset              struct{ Version string }
		Buffers, Images    []gltfResource
		ExtensionsRequired []string
	}
	if json.Unmarshal(data, &model) != nil || model.Asset.Version != "2.0" || len(model.ExtensionsRequired) != 0 {
		return false
	}
	return embeddedResources(model.Buffers, embeddedBuffer, jsonFormat, jsonFormat) && embeddedResources(model.Images, embeddedImage, jsonFormat, false)
}
func embeddedResources(resources []gltfResource, pattern *regexp.Regexp, allowURI, requireURI bool) bool {
	for _, resource := range resources {
		if resource.URI == nil {
			if requireURI {
				return false
			}
		} else if !allowURI || !pattern.MatchString(*resource.URI) {
			return false
		}
	}
	return true
}

func (a *App) readDiagramAsset(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !modelFileID.MatchString(id) {
		fail(404, "Diagram asset not found.")
	}
	address := modelAddress + id
	private := a.privateMediaAllowed(r, "content:read")
	checkAccess := func() {
		if !private && !a.uploadInPublishedContent(r.Context(), address) {
			fail(404, "Diagram asset not found.")
		}
	}
	checkAccess()
	row := first(a.DB.Must(r.Context(), "SELECT object_key,content_type FROM uploaded_models WHERE id=$1", id))
	if row == nil {
		fail(404, "Diagram asset not found.")
	}
	data, err := a.Storage.Get(r.Context(), row.str("object_key"))
	must(err)
	a.recheckPreviewMedia(r)
	checkAccess()
	w.Header().Set("Content-Type", row.str("content_type"))
	w.Header().Set("Content-Disposition", "attachment")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, id, time.Time{}, bytes.NewReader(data))
}
