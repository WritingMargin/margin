package blog

import (
	"encoding/json"
	"testing"
)

func TestOpenAPIAuthoringOperationIDs(t *testing.T) {
	var spec Row
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	paths := object(spec["paths"])
	expected := map[string]string{"GET /api/media/images": "listImages", "GET /api/media/videos": "listVideos", "POST /api/media/videos": "uploadVideo", "POST /api/media/images": "uploadImage", "POST /api/media/covers": "uploadImageBinary", "GET /api/settings/seo": "getSiteSEO", "PUT /api/settings/seo": "updateSiteSEO", "PUT /api/posts/{id}": "updatePost"}
	seen := map[string]bool{}
	for path, raw := range paths {
		for method, value := range object(raw) {
			operation := object(value)
			id := operation.str("operationId")
			if id == "" || seen[id] {
				t.Fatal("operation IDs must be unique", id)
			}
			seen[id] = true
			pattern := map[string]string{"get": "GET", "post": "POST", "put": "PUT", "patch": "PATCH", "delete": "DELETE"}[method] + " " + path
			if want, exists := expected[pattern]; exists {
				if id != want {
					t.Fatal("unexpected operation ID", pattern, id)
				}
				delete(expected, pattern)
			}
		}
	}
	if len(expected) != 0 {
		t.Fatal("missing authoring operations", expected)
	}
}

func TestOpenAPIMediaRequestBodies(t *testing.T) {
	var spec Row
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	paths := object(spec["paths"])
	binary := object(object(object(object(paths["/api/media/covers"])["post"])["requestBody"])["content"])
	for _, kind := range []string{"image/png", "image/jpeg", "image/webp", "image/gif"} {
		schema := object(object(binary[kind])["schema"])
		if schema.str("type") != "string" || schema.str("format") != "binary" {
			t.Fatal("binary upload schema drift", kind)
		}
	}
	schemas := object(object(spec["components"])["schemas"])
	data := object(object(object(schemas["blog.APIUploadImage"])["properties"])["data"])
	if data.str("format") != "byte" || data["maxLength"] != float64(13981016) {
		t.Fatal("JSON upload schema drift", data)
	}
}

func TestOpenAPIUpdateDoesNotDefaultContentType(t *testing.T) {
	var spec Row
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatal(err)
	}
	schemas := object(object(spec["components"])["schemas"])
	update := object(object(object(schemas["blog.APIUpdatePost"])["properties"])["contentType"])
	if _, exists := update["default"]; exists {
		t.Fatal("generated clients must preserve the current content type on partial edits")
	}
	create := object(object(object(schemas["blog.APICreatePost"])["properties"])["contentType"])
	if create.str("default") != "article" {
		t.Fatal("create default missing")
	}
}
