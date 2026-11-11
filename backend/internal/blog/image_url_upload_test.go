package blog

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestImageURLUploadValidationAndAuthorization(t *testing.T) {
	a, _ := coreFixture(t)
	for _, source := range []string{"file:///tmp/cover.png", "http://127.0.0.1/image.png", "http://169.254.169.254/latest", "http://[::1]/", "https://user:pass@example.com/image.png", "https://localhost/image.png"} {
		expectStatus(t, request(t, a, "POST", "/api/media/images", Row{"url": source}, true), 400)
	}
	reader := roleToken(t, a, "reader")
	expectStatus(t, tokenRequest(a, reader, "POST", "/api/media/images", Row{"url": "https://example.com/image.png"}), 403)
	expectStatus(t, request(t, a, "POST", "/api/media/images", Row{"url": "https://example.com/image.png"}, false), 401)
}

func TestImageURLDownloadLimitsAndBytes(t *testing.T) {
	data, _ := base64.StdEncoding.DecodeString(imageAPIInput().str("data"))
	status := 200
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Fatal("forwarded credentials")
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(data)), Header: http.Header{}, Request: r}, nil
	})}
	r := httptest.NewRequest("POST", "http://blog.test/api/media/images", nil)
	r.Header.Set("Authorization", "Bearer private")
	got := downloadImageUpload(r, client, "https://example.com/image.png")
	if !bytes.Equal(got, data) || imageType(got) != "image/png" {
		t.Fatal("image bytes changed")
	}
	status = 404
	assertImageDownloadError(t, r, client, 502)
	status = 200
	data = make([]byte, maxArticleImageBytes+1)
	assertImageDownloadError(t, r, client, 413)
}

func assertImageDownloadError(t *testing.T, r *http.Request, client *http.Client, status int) {
	t.Helper()
	defer func() {
		recovered := recover()
		if recovered == nil || responseError(recovered).Status != status {
			t.Fatalf("expected %d, got %v", status, recovered)
		}
	}()
	downloadImageUpload(r, client, "https://example.com/image.png")
}

func TestImageURLDownloadErrorsAreSpecific(t *testing.T) {
	data, _ := base64.StdEncoding.DecodeString(imageAPIInput().str("data"))
	status, body, kind := 200, data, ""
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("User-Agent") != "Margin-ImageImport/1.0" {
			t.Fatalf("unexpected user agent %q", r.Header.Get("User-Agent"))
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(body)), Header: http.Header{"Content-Type": {kind}}, Request: r}, nil
	})}
	r := httptest.NewRequest("POST", "http://blog.test/api/media/images", nil)
	downloadImageUpload(r, client, "https://example.com/image.png")
	for _, item := range []struct {
		status int
		body   []byte
		kind   string
		want   int
		code   string
		text   string
	}{
		{403, nil, "", 502, "IMAGE_URL_HTTP_ERROR", "HTTP 403. The site refused"},
		{404, nil, "", 502, "IMAGE_URL_HTTP_ERROR", "HTTP 404. Check that the link"},
		{500, nil, "", 502, "IMAGE_URL_HTTP_ERROR", "HTTP 500."},
		{200, []byte("<html></html>"), "text/html", 400, "IMAGE_URL_NOT_IMAGE", "returned text/html"},
	} {
		status, body, kind = item.status, item.body, item.kind
		assertImageError(t, item.want, item.code, item.text, func() { downloadImageUpload(r, client, "https://example.com/image.png") })
	}
	// A host that resolves to loopback is blocked at dial time, not reported as unreachable.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.Write(data) }))
	defer server.Close()
	assertImageError(t, 400, "IMAGE_URL_BLOCKED", "private or internal", func() { downloadImageUpload(r, previewHTTPClient(), server.URL+"/image.png") })
	for _, item := range []struct {
		err  error
		want int
		code string
	}{
		{&url.Error{Op: "Get", Err: errPreviewRedirectRefused}, 400, "IMAGE_URL_REDIRECT_REFUSED"},
		{&url.Error{Op: "Get", Err: &net.OpError{Op: "dial", Err: &net.DNSError{Err: "no such host", IsNotFound: true}}}, 502, "IMAGE_URL_UNREACHABLE"},
		{&url.Error{Op: "Get", Err: context.DeadlineExceeded}, 502, "IMAGE_URL_TIMEOUT"},
		{errors.New("connection reset"), 502, "IMAGE_URL_UNREACHABLE"},
	} {
		assertImageError(t, item.want, item.code, "", func() { failImageFetch(item.err) })
	}
}

func assertImageError(t *testing.T, status int, code, text string, call func()) {
	t.Helper()
	defer func() {
		e := responseError(recover())
		if e.Status != status || e.Code != code || !strings.Contains(e.Message, text) {
			t.Fatalf("expected %d %s %q, got %d %s %q", status, code, text, e.Status, e.Code, e.Message)
		}
	}()
	call()
}
