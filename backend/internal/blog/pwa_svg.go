package blog

import (
	"bytes"
	"encoding/xml"
	"errors"
	"image"
	"io"
	"math"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
)

// Uploads remain raster-only. Inherited blog logos may also be standalone SVGs.
func decodePWALogo(data []byte) (image.Image, error) {
	if img, err := decodePWAImage(data); err == nil {
		return img, nil
	}
	return decodePWASVG(data)
}

func decodePWASVG(data []byte) (img image.Image, err error) {
	// Malformed SVG styles can panic inside the renderer. Treat them like any
	// other unsupported logo rather than failing the public icon endpoint.
	defer func() {
		if recover() != nil {
			img, err = nil, errors.New("invalid SVG logo")
		}
	}()
	if err = validatePWASVG(data); err != nil {
		return nil, err
	}
	icon, err := oksvg.ReadIconStream(bytes.NewReader(data), oksvg.StrictErrorMode)
	if err != nil {
		return nil, err
	}
	box := icon.ViewBox
	if !validPWAViewBox(box.X, box.Y, box.W, box.H) || len(icon.SVGPaths) == 0 {
		return nil, errors.New("invalid SVG dimensions or empty logo")
	}
	// Allocate at most 512x512 regardless of the SVG's declared dimensions.
	scale := 512 / math.Max(box.W, box.H)
	width, height := max(1, int(math.Round(box.W*scale))), max(1, int(math.Round(box.H*scale)))
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	icon.Transform = rasterx.Identity.Scale(scale, scale).Translate(-box.X, -box.Y)
	scanner := rasterx.NewScannerGV(width, height, canvas, canvas.Bounds())
	icon.Draw(rasterx.NewDasher(width, height, scanner), 1)
	return canvas, nil
}

func validPWAViewBox(x, y, width, height float64) bool {
	for _, value := range []float64{x, y, width, height} {
		if math.IsNaN(value) || math.IsInf(value, 0) || math.Abs(value) > 1e6 {
			return false
		}
	}
	return width > 0 && height > 0
}

func validatePWASVG(data []byte) error {
	if len(data) > 2<<20 {
		return errors.New("SVG exceeds the size limit")
	}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	depth, elements := 0, 0
	for {
		token, err := decoder.Token()
		if err == io.EOF && elements > 0 && depth == 0 {
			return nil
		}
		if err != nil {
			return err
		}
		switch element := token.(type) {
		case xml.StartElement:
			depth++
			elements++
			if err := validatePWASVGElement(element, depth, elements); err != nil {
				return err
			}
		case xml.EndElement:
			depth--
		}
	}
}

func validatePWASVGElement(element xml.StartElement, depth, count int) error {
	if depth > 64 || count > 4096 {
		return errors.New("SVG exceeds the complexity limit")
	}
	if depth == 1 && (element.Name.Local != "svg" || count != 1) {
		return errors.New("expected one SVG root")
	}
	// No scripts, external images, embedded documents, or recursive <use>
	// references. The renderer only receives self-contained vector geometry.
	switch element.Name.Local {
	case "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "linearGradient", "radialGradient", "stop":
		return nil
	default:
		return errors.New("unsupported SVG element")
	}
}
