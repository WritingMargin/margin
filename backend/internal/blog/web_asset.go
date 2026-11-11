package blog

import (
	"bytes"
	"compress/gzip"
	"mime"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Vite changes the URL whenever an asset changes. Other public files can be
// replaced at the same URL, so leave their cache policy alone.
var fingerprintedAsset = regexp.MustCompile(`^(?:public-assets|assets)/[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$`)
var gzipWriters = sync.Pool{New: func() any {
	writer, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed)
	return writer
}}

func serveWebAsset(w http.ResponseWriter, r *http.Request, name string, data []byte) {
	ext := path.Ext(name)
	if fingerprintedAsset.MatchString(name) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	// Only compress static code. Personalized pages and user content use their own handlers.
	if len(data) >= 1024 && (ext == ".css" || ext == ".js" || ext == ".mjs") {
		w.Header().Add("Vary", "Accept-Encoding")
		if r.Header.Get("Range") == "" && acceptsGzip(r.Header.Get("Accept-Encoding")) {
			w.Header().Set("Content-Type", mime.TypeByExtension(ext))
			w.Header().Set("Content-Encoding", "gzip")
			if r.Method != http.MethodHead {
				writer := gzipWriters.Get().(*gzip.Writer)
				writer.Reset(w)
				_, _ = writer.Write(data)
				_ = writer.Close()
				writer.Reset(nil)
				gzipWriters.Put(writer)
			}
			return
		}
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		encoding, options, _ := strings.Cut(part, ";")
		if !strings.EqualFold(strings.TrimSpace(encoding), "gzip") {
			continue
		}
		if options == "" {
			return true
		}
		key, value, _ := strings.Cut(strings.TrimSpace(options), "=")
		quality, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return strings.EqualFold(strings.TrimSpace(key), "q") && err == nil && quality > 0 && quality <= 1
	}
	return false
}
