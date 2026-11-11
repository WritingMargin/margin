package blog

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// Keep only the current branding in memory; arbitrary query strings cannot grow the cache.
type pwaIconCache struct {
	mu      sync.Mutex
	key     string
	expires time.Time
	images  map[int][]byte
}

func decodePWAImage(data []byte) (image.Image, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 16_000_000 {
		return nil, errors.New("image dimensions exceed the limit")
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	return img, err
}
func (a *App) uploadPWAIcon(w http.ResponseWriter, r *http.Request) {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if err != nil {
		fail(413, "Choose an icon up to 2 MB.")
	}
	if _, err := decodePWAImage(data); err != nil {
		fail(400, "Choose a valid PNG, JPEG, WebP, or GIF icon up to 16 megapixels.")
	}
	r.Body = io.NopCloser(bytes.NewReader(data))
	a.uploadImage(w, r, 2<<20, "blog_logos", "logos/", "/api/public/logos/", "Choose a PNG, JPEG, WebP, or GIF icon up to 2 MB.")
}
func (a *App) pwaLogoData(ctx context.Context, source string) ([]byte, error) {
	if !logoRE.MatchString(source) {
		return fetchPWALogo(ctx, source)
	}
	id := strings.TrimPrefix(source, "/api/public/logos/")
	row := first(a.DB.Must(ctx, "SELECT object_key FROM blog_logos WHERE id=$1", id))
	if row == nil {
		return nil, errors.New("logo not found")
	}
	return a.Storage.Get(ctx, row.str("object_key"))
}
func (a *App) pwaIcon(w http.ResponseWriter, r *http.Request) {
	size, _ := strconv.Atoi(strings.TrimSuffix(r.PathValue("size"), ".png"))
	if size != 180 && size != 192 && size != 512 {
		fail(404, "Icon not found.")
	}
	brand := effectivePWA(a.settings(r.Context()), a.pwaSettings(r.Context()))
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-cache")
	if r.Method != "HEAD" {
		_, _ = w.Write(a.pwaIconBytes(r.Context(), brand, size))
	}
}
func (a *App) pwaIconBytes(ctx context.Context, brand Row, size int) []byte {
	cache := &a.pwaIcons
	cache.mu.Lock()
	defer cache.mu.Unlock()
	key := pwaIconVersion(brand)
	if cache.key != key || time.Now().After(cache.expires) {
		var source image.Image
		if data, err := a.pwaLogoData(ctx, brand.str("icon")); err == nil {
			source, _ = decodePWALogo(data)
		}
		if source == nil {
			source = pwaFallbackMark(brand.str("themeColor"))
		}
		images := map[int][]byte{}
		for _, dimension := range []int{180, 192, 512} {
			images[dimension] = renderPWAIcon(source, brand.str("backgroundColor"), dimension)
		}
		cache.key, cache.images, cache.expires = key, images, time.Now().Add(5*time.Minute)
	}
	return cache.images[size]
}
func pwaColor(value string) color.NRGBA {
	rgb, _ := strconv.ParseUint(strings.TrimPrefix(value, "#"), 16, 32)
	return color.NRGBA{R: uint8((rgb >> 16) & 0xff), G: uint8((rgb >> 8) & 0xff), B: uint8(rgb & 0xff), A: 255}
}
func renderPWAIcon(source image.Image, background string, size int) []byte {
	canvas := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.Draw(canvas, canvas.Bounds(), image.NewUniform(pwaColor(background)), image.Point{}, draw.Src)
	// A centered 56% square fits entirely inside the maskable icon's 80% safe circle.
	bounds := source.Bounds()
	edge := size * 56 / 100
	width, height := edge, edge
	if bounds.Dx() > bounds.Dy() {
		height = max(1, edge*bounds.Dy()/bounds.Dx())
	} else {
		width = max(1, edge*bounds.Dx()/bounds.Dy())
	}
	rect := image.Rect((size-width)/2, (size-height)/2, (size+width)/2, (size+height)/2)
	draw.CatmullRom.Scale(canvas, rect, source, bounds, draw.Over, nil)
	var output bytes.Buffer
	must(png.Encode(&output, canvas))
	return output.Bytes()
}
func pwaFallbackMark(accent string) image.Image {
	// The folded-page Margin mark, tinted with the publication's accent color.
	mark := image.NewNRGBA(image.Rect(0, 0, 32, 32))
	ink := image.NewUniform(pwaColor(accent))
	draw.Draw(mark, image.Rect(5, 3, 26, 18), ink, image.Point{}, draw.Src)
	draw.Draw(mark, image.Rect(5, 18, 13, 29), ink, image.Point{}, draw.Src)
	for y := 20; y < 29; y++ {
		draw.Draw(mark, image.Rect(15, y, 26-(y-20), y+1), ink, image.Point{}, draw.Src)
	}
	return mark
}
