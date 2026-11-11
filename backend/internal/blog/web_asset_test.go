package blog

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebAssetCompressionOnSubpath(t *testing.T) {
	t.Setenv("MARGIN_BASE_PATH", "/journal")
	data := mountedWebData("style.css", []byte(strings.Repeat("a{background:url("+runtimeWebBase+"/font.woff2)}", 100)))
	for _, tc := range []struct {
		encoding, span string
		compressed     bool
		status         int
	}{
		{"br, gzip", "", true, 200},
		{"gzip;q=0, br", "", false, 200},
		{"gzip", "bytes=0-13", false, 206},
	} {
		req := httptest.NewRequest("GET", "/journal/public-assets/style-xYz123aB.css", nil)
		req.Header.Set("Accept-Encoding", tc.encoding)
		req.Header.Set("Range", tc.span)
		w := httptest.NewRecorder()
		serveWebAsset(w, req, "public-assets/style-xYz123aB.css", data)
		if w.Code != tc.status || (w.Header().Get("Content-Encoding") == "gzip") != tc.compressed || !strings.Contains(w.Header().Get("Cache-Control"), "immutable") || w.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatalf("%+v: %d, %v", tc, w.Code, w.Header())
		}
		if tc.compressed {
			verifyMountedCSS(t, w.Body, data)
		}
	}
}

func TestWebManifestHead(t *testing.T) {
	w := httptest.NewRecorder()
	serveWebAsset(w, httptest.NewRequest(http.MethodHead, "/public-manifest.json", nil), "public-manifest.json", []byte("{}"))
	if w.Body.Len() != 0 || w.Header().Get("Cache-Control") != "" {
		t.Fatal("mutable manifest was cached or returned a HEAD body")
	}
}

func verifyMountedCSS(t *testing.T, body io.Reader, want []byte) {
	t.Helper()
	reader, err := gzip.NewReader(body)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	decoded, err := io.ReadAll(reader)
	if err != nil || string(decoded) != string(want) || !strings.Contains(string(decoded), "/journal/font") {
		t.Fatal("incorrect compressed stylesheet")
	}
}
