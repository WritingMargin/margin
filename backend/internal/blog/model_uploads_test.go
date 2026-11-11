package blog

import (
	"bytes"
	"encoding/binary"
	"net/url"
	"os"
	"path"
	"strings"
	"testing"
)

const modelOBJ = "o Arm\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
const modelClip = `{"name":"Lift","duration":1,"tracks":[{"name":"Arm.position","type":"vector","times":[0,1],"values":[0,0,0,0,1,0]}]}`

func TestDiagramUploadFormats(t *testing.T) {
	a, _ := coreFixture(t)
	glb, err := os.ReadFile("../../../examples/heart-atlas/assets/heart.glb")
	if err != nil {
		t.Fatal(err)
	}
	stl := make([]byte, 134)
	binary.LittleEndian.PutUint32(stl[80:], 1)
	for format, data := range map[string][]byte{"glb": glb, "gltf": []byte(`{"asset":{"version":"2.0"},"buffers":[{"uri":"data:application/octet-stream;base64,AAAA"}]}`), "obj": []byte(modelOBJ), "stl": stl, "json": []byte(modelClip)} {
		route := "/api/media/models?format=" + format
		address := responseRow(t, uploadRequest(t, a, route, "application/octet-stream", data), 201).str("url")
		if !strings.HasSuffix(address, "."+format) {
			t.Fatal(address)
		}
		read := request(t, a, "GET", address, nil, true)
		expectStatus(t, read, 200)
		if !bytes.Equal(data, read.Body.Bytes()) || read.Header().Get("Content-Type") != modelContentTypes[format] {
			t.Fatal("incorrect delivered file", format)
		}
		expectStatus(t, uploadRequest(t, a, route, "application/octet-stream", []byte("<html>unsupported</html>")), 400)
	}
	expectStatus(t, uploadRequest(t, a, "/api/media/models?format=gltf", "application/octet-stream", []byte(`{"asset":{"version":"2.0"},"buffers":[{"uri":"part.bin"}]}`)), 400)
	expectStatus(t, uploadRequest(t, a, "/api/media/models?format=obj", "application/octet-stream", make([]byte, maxDiagramBytes+1)), 413)
	for role, allowed := range map[string]bool{"reader": false, "writer": true, "publisher": true} {
		if tokenRouteAllowed(role, "POST /api/media/models") != allowed {
			t.Fatal(role)
		}
	}
}

func TestUploadedDiagramAccessFollowsPostAndPreview(t *testing.T) {
	a, _, _ := publicFixture(t)
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	upload := func(kind, data string) string {
		return responseRow(t, uploadRequest(t, a, "/journal/api/media/models?format="+kind, "application/octet-stream", []byte(data)), 201).str("url")
	}
	model, clip, unused := upload("obj", modelOBJ), upload("json", modelClip), upload("obj", modelOBJ)
	input := draftInput("diagram")
	input["content"] = "[Scene]\n" + `{"title":"Arm","objects":[{"shape":"model","label":"Arm","src":"` + model + `","animationSrc":"` + clip + `"}]}` + "\n[/Scene]"
	post := responseRow(t, request(t, a, "POST", "/journal/api/posts", input, true), 201)
	postPath := "/journal/api/posts/" + post.str("id")
	preview := responseRow(t, request(t, a, "GET", postPath+"/preview", nil, true), 200)
	link, err := url.Parse(preview.str("previewUrl"))
	if err != nil {
		t.Fatal(err)
	}
	query := "?preview=" + path.Base(link.Path)
	for _, file := range []string{model, clip} {
		expectStatus(t, request(t, a, "GET", "/journal"+file, nil, false), 404)
		expectStatus(t, request(t, a, "GET", "/journal"+file+query, nil, false), 200)
	}
	expectStatus(t, request(t, a, "GET", "/journal"+unused+query, nil, false), 404)
	post = responseRow(t, request(t, a, "PUT", postPath, Row{"revision": post["revision"], "status": "published"}, true), 200)
	for _, file := range []string{model, clip} {
		expectStatus(t, request(t, a, "GET", "/journal"+file, nil, false), 200)
	}
	responseRow(t, request(t, a, "PUT", postPath, Row{"revision": post["revision"], "content": "Removed"}, true), 200)
	for _, file := range []string{model, clip} {
		expectStatus(t, request(t, a, "GET", "/journal"+file, nil, false), 404)
	}
}

func TestDiagramTagStaticReading(t *testing.T) {
	source := "[Model src=\"/assets/arm.obj\" title=\"Arm & gear\" description=\"Lift the arm.\"]\n\n[Figma url=\"https://www.figma.com/design/FileKey\" title=\"Drawing\"]"
	rendered := rssMarkdown(source, "https://example.com/post/arm")
	containsHTML(t, rendered, "Arm &amp; gear", "Lift the arm.", "Rotation and animation", "https://www.figma.com/design/FileKey", "Drawing")
	excludesHTML(t, rendered, "[Model ", "[Figma ", "<iframe")
}
