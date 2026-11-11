package blog

import (
	"bytes"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strings"
)

var mountPathRE = regexp.MustCompile(`^(?:/[A-Za-z0-9_-]+)*$`)

// The build uses this marker for router, module, stylesheet and font URLs.
// Resolve only bundled text assets; stored content and binary assets are untouched.
const runtimeWebBase = "/__margin_runtime_base__"

// BasePath is selected at runtime, independently of the frontend build.
func BasePath() string {
	value, explicit := os.LookupEnv("MARGIN_BASE_PATH")
	if !explicit {
		value = publicURLPath()
	}
	if len(value) > 200 || !mountPathRE.MatchString(value) {
		panic("MARGIN_BASE_PATH must be empty or a path such as /blog without a trailing slash")
	}
	return value
}

func publicURLPath() string {
	u, err := url.Parse(os.Getenv("PUBLIC_URL"))
	if err != nil {
		panic("PUBLIC_URL is invalid")
	}
	return strings.TrimSuffix(u.EscapedPath(), "/")
}

func mountedWebData(name string, data []byte) []byte {
	switch path.Ext(name) {
	case ".html", ".js", ".mjs", ".css", ".json":
		base := BasePath()
		if base == "" {
			data = bytes.ReplaceAll(data, []byte(`"basename":"`+runtimeWebBase+`"`), []byte(`"basename":"/"`))
		}
		return bytes.ReplaceAll(data, []byte(runtimeWebBase), []byte(base))
	default:
		return data
	}
}
func sitePath(path string) string { return BasePath() + path }
func mediaPath(value string) string {
	if strings.HasPrefix(value, "/api/") {
		return sitePath(value)
	}
	return value
}
func mountedRequest(w http.ResponseWriter, r *http.Request) *http.Request {
	base := BasePath()
	if base == "" {
		return r
	}
	if r.URL.Path == base {
		target := sitePath("/")
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, target, http.StatusPermanentRedirect) // #nosec G710 -- BasePath is validated against mountPathRE; the absolute local path precedes the query so a request cannot change the redirect authority.
		return nil
	}
	if !strings.HasPrefix(r.URL.Path, base+"/") {
		http.NotFound(w, r)
		return nil
	}
	result := r.Clone(r.Context())
	result.URL.Path = strings.TrimPrefix(r.URL.Path, base)
	result.URL.RawPath = strings.TrimPrefix(r.URL.EscapedPath(), base)
	return result
}

func validateWebBase(web fs.FS) {
	base := BasePath()
	if web == nil {
		return
	}
	data, err := fs.ReadFile(web, "margin-base-path.txt")
	if err == nil && string(data) == runtimeWebBase {
		return
	}
	if err != nil && base == "" {
		return
	}
	if err != nil || string(data) != base {
		panic("This legacy frontend was built for another base path; upgrade to a runtime-path frontend")
	}
}
