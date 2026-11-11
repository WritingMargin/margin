package blog

// Empty strings are valid defaults; all fields must be sent on replacement.
type APISiteSEO struct {
	Title              string `json:"title" binding:"required" maxLength:"120"`
	Description        string `json:"description" binding:"required" maxLength:"320"`
	Image              string `json:"image" binding:"required" maxLength:"2048"`
	Indexing           bool   `json:"indexing" binding:"required"`
	GoogleVerification string `json:"googleVerification" binding:"required" maxLength:"256"`
}

type APIAuthorProfile struct {
	Name    string           `json:"name" maxLength:"120"`
	Image   string           `json:"image" maxLength:"2048"`
	Bio     string           `json:"bio" maxLength:"600"`
	Website string           `json:"website" maxLength:"2048"`
	Links   []APIProfileLink `json:"links" maxItems:"4"`
}

type APIProfileLink struct {
	Label string `json:"label" binding:"required" minLength:"1" maxLength:"40"`
	URL   string `json:"url" binding:"required" maxLength:"2048"`
}

type APIUploadImage struct {
	// Public HTTP(S) image URL; mutually exclusive with data. Local files use the binary REST cover upload.
	URL         string `json:"url,omitempty" minLength:"1" maxLength:"2048"`
	ContentType string `json:"contentType,omitempty" enums:"image/png,image/jpeg,image/webp,image/gif"`
	// Standard base64, without data: prefix. Decoded limit is 10 MiB.
	Data string `json:"data,omitempty" format:"byte" minLength:"1" maxLength:"13981016"`
}

type APIUploadedImage struct {
	// Canonical URL. Store unchanged in Markdown, cover or seo.image; apply the blog mount path only when fetching it directly.
	URL string `json:"url" binding:"required" example:"/api/public/covers/00000000-0000-4000-8000-000000000000"`
}

type APIUploadVideo struct {
	ContentType string `json:"contentType" binding:"required" enums:"video/mp4,video/webm"`
	Data        string `json:"data" binding:"required" format:"byte" minLength:"1" maxLength:"13981016"`
	Title       string `json:"title,omitempty" maxLength:"200"`
}
type APIUploadedVideo struct {
	URL         string `json:"url" binding:"required" example:"/api/public/videos/00000000-0000-4000-8000-000000000000"`
	ID          string `json:"id" binding:"required"`
	ContentType string `json:"contentType" binding:"required" enums:"video/mp4,video/webm"`
	Title       string `json:"title" binding:"required"`
	SizeBytes   int64  `json:"sizeBytes" binding:"required"`
}
type APIUploadAudio struct {
	ContentType string `json:"contentType" binding:"required" enums:"audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac"`
	Data        string `json:"data" binding:"required" format:"byte" minLength:"1" maxLength:"13981016"`
	Title       string `json:"title,omitempty" maxLength:"200"`
}
type APIUploadedAudio struct {
	URL         string `json:"url" binding:"required" example:"/api/public/audio/00000000-0000-4000-8000-000000000000"`
	ID          string `json:"id" binding:"required"`
	ContentType string `json:"contentType" binding:"required" enums:"audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac"`
	Title       string `json:"title" binding:"required"`
	SizeBytes   int64  `json:"sizeBytes" binding:"required"`
}
type APIMediaLibrary struct {
	Resources []APIMediaAsset `json:"resources" binding:"required"`
}
type APIMediaAsset struct {
	PublicID     string `json:"public_id" binding:"required"`
	SecureURL    string `json:"secure_url" binding:"required"`
	ResourceType string `json:"resource_type" binding:"required" enums:"image,video,audio"`
	Title        string `json:"title,omitempty"`
	ContentType  string `json:"contentType,omitempty"`
	SizeBytes    int64  `json:"sizeBytes,omitempty"`
	CreatedAt    string `json:"createdAt,omitempty" format:"date-time"`
	Format       string `json:"format,omitempty"`
	Width        int    `json:"width,omitempty"`
	Height       int    `json:"height,omitempty"`
}

type APILinkPreviewInput struct {
	URL string `json:"url" binding:"required" maxLength:"2048"`
}
type APILinkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
}
