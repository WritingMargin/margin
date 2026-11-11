package assets

import "embed"

// Files contains the frontend in release builds.
//
//go:embed web
var Files embed.FS
