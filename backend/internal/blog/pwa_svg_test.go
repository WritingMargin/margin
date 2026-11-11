package blog

import (
	"context"
	"image/color"
	"strconv"
	"strings"
	"testing"
)

const pwaSVGLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 80 40"><path d="M10 20H90V60H10Z" fill="#ff0000"/></svg>`

func TestPWAIconsRenderSavedSVGLogo(t *testing.T) {
	app, storage := coreFixture(t)
	// Seed stored logo bytes without widening the raster-only PWA upload API.
	upload := responseRow(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/png", pwaTestPNG(t, 1, 1, color.Black)), 201)
	id := strings.TrimPrefix(upload.str("url"), "/api/public/logos/")
	row := first(app.DB.Must(context.Background(), "SELECT object_key FROM blog_logos WHERE id=$1", id))
	if err := storage.Put(context.Background(), row.str("object_key"), []byte(pwaSVGLogo)); err != nil {
		t.Fatal(err)
	}
	theme := defaultTheme()
	theme["logo"], theme["background"] = upload.str("url"), "#ffffff"
	expectStatus(t, request(t, app, "PUT", "/api/settings", theme, true), 200)
	for _, size := range []int{180, 192, 512} {
		img := pwaPNG(t, request(t, app, "GET", "/pwa/icon/"+strconv.Itoa(size)+".png", nil, false), size)
		if color.NRGBAModel.Convert(img.At(size/2, size/2)) != (color.NRGBA{R: 255, A: 255}) {
			t.Fatal("SVG logo was replaced by the fallback mark")
		}
		if color.NRGBAModel.Convert(img.At(size/2, size/4)) != (color.NRGBA{R: 255, G: 255, B: 255, A: 255}) {
			t.Fatal("SVG aspect ratio or background was not preserved")
		}
	}
}

func TestPWASVGRejectsUnsupportedAndInvalidLogos(t *testing.T) {
	for name, source := range map[string]string{
		"malformed":            `<svg><path`,
		"missing dimensions":   `<svg><path d="M0 0H10V10Z"/></svg>`,
		"zero dimensions":      `<svg viewBox="0 0 0 1"><path d="M0 0H10V10Z"/></svg>`,
		"nonfinite dimensions": `<svg viewBox="0 0 NaN 1"><path d="M0 0H10V10Z"/></svg>`,
		"empty":                `<svg viewBox="0 0 10 10"/>`,
		"external image":       `<svg viewBox="0 0 10 10"><image href="https://example.com/image.png"/></svg>`,
		"recursive reference":  `<svg viewBox="0 0 10 10"><defs><g id="a"><use href="#a"/></g></defs><use href="#a"/></svg>`,
		"script":               `<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
		"multiple roots":       pwaSVGLogo + pwaSVGLogo,
		"deep nesting":         `<svg>` + strings.Repeat(`<g>`, 65) + strings.Repeat(`</g>`, 65) + `</svg>`,
		"oversize":             strings.Repeat(" ", (2<<20)+1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodePWALogo([]byte(source)); err == nil {
				t.Fatal("accepted invalid or unsupported logo")
			}
		})
	}
}

func TestPWASVGOutputIsBoundedAndUploadsStayRasterOnly(t *testing.T) {
	img, err := decodePWALogo([]byte(`<svg viewBox="0 0 100000 50000"><path d="M0 0H100000V50000H0Z"/></svg>`))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 512 || img.Bounds().Dy() != 256 {
		t.Fatal(img.Bounds())
	}
	app, _ := coreFixture(t)
	expectStatus(t, uploadRequest(t, app, "/api/settings/pwa/icon", "image/svg+xml", []byte(pwaSVGLogo)), 400)
}
