package blog

// @title Margin authoring API
// @version 1.0
// @description Post authoring and token management. Authenticate with an API key using `Authorization: Bearer YOUR_TOKEN`. Reader tokens can read all posts including drafts; writers can create and edit drafts; publishers can also publish, archive, edit live posts and delete; owners can manage tokens and all administrative APIs. This specification covers posts (articles and guides), per-post SEO, image uploads, publication SEO, search, revisions and tokens. Other administration APIs are not yet included. Writers and publishers can upload article images; publication-wide SEO requires an owner token.
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization

// Documentation models describe the JSON emitted by the Row-based handlers.
// Response properties are optional because callers may select a subset with fields.
type APIPostSummary struct {
	ContentType     string   `json:"contentType" enums:"article,guide"`
	CoverMode       string   `json:"coverMode,omitempty" enums:"player,preview"`
	TableOfContents string   `json:"tableOfContents" enums:"off,top,left,right"`
	Featured        bool     `json:"featured"`
	ID              string   `json:"id" format:"uuid"`
	Title           string   `json:"title"`
	Slug            string   `json:"slug"`
	Excerpt         string   `json:"excerpt"`
	Status          string   `json:"status" enums:"draft,published,archived"`
	Tags            []string `json:"tags"`
	// Cover image URL, direct audio URL, Spotify link, or canonical uploaded audio URL.
	Cover     string `json:"cover"`
	SEO       APISEO `json:"seo"`
	CreatedAt string `json:"createdAt" format:"date-time"`
	UpdatedAt string `json:"updatedAt" format:"date-time"`
	Revision  string `json:"revision"`
}
type APIPost struct {
	PublicationState string   `json:"publicationState,omitempty" enums:"never_published,published,unpublished,archived"`
	Warnings         []string `json:"warnings,omitempty"`
	DraftURL         string   `json:"draftUrl,omitempty"`
	BaseRevision     string   `json:"baseRevision,omitempty"`
	APIPostSummary
	Content         string             `json:"content"`
	Recommendations APIRecommendations `json:"recommendations"`
	Author          APIAuthor          `json:"author"`
}
type APIPublicPost struct {
	ReviewedBy []string `json:"reviewedBy"`
	APIPostSummary
	Content      string           `json:"content"`
	RelatedPosts []APIPostSummary `json:"relatedPosts"`
}
type APISearchPost struct {
	APIPostSummary
	SearchSnippet string   `json:"searchSnippet"`
	SearchMatches []string `json:"searchMatches"`
}
type APIRevisionSummary struct {
	ContentType string    `json:"contentType" enums:"article,guide"`
	Revision    string    `json:"revision"`
	Version     int64     `json:"version"`
	SavedAt     string    `json:"savedAt" format:"date-time"`
	Author      APIAuthor `json:"author"`
	Title       string    `json:"title"`
	Status      string    `json:"status" enums:"draft,published,archived"`
}
type APIRevision struct {
	APIPost
	Version          int64   `json:"version"`
	SavedAt          string  `json:"savedAt" format:"date-time"`
	PreviousRevision *string `json:"previousRevision" extensions:"x-nullable"`
}
type APIAuthor struct {
	Kind string `json:"kind" enums:"api_token,owner,unknown"`
	Name string `json:"name"`
}
type APISEO struct {
	Title       string `json:"title" binding:"required" maxLength:"120"`
	Description string `json:"description" binding:"required" maxLength:"320"`
	Image       string `json:"image" binding:"required" maxLength:"2048"`
	Noindex     bool   `json:"noindex,omitempty"`
	Nofollow    bool   `json:"nofollow,omitempty"`
}
type APIRecommendations struct {
	Mode string `json:"mode" binding:"required" enums:"automatic,smart,manual"`
	// Only manual mode accepts IDs: at most two distinct, published posts other than this post.
	PostIDs []string `json:"postIds" binding:"required" maxItems:"2"`
}
type APIPostOptions struct {
	ContentType     string `json:"contentType,omitempty" enums:"article,guide"`
	CoverMode       string `json:"coverMode,omitempty" enums:"player,preview"`
	TableOfContents string `json:"tableOfContents,omitempty" enums:"off,top,left,right"`
	// Featured published articles stay above the paginated homepage list.
	Featured *bool    `json:"featured,omitempty"`
	Excerpt  string   `json:"excerpt,omitempty" maxLength:"2000"`
	Status   string   `json:"status,omitempty" enums:"draft,published,archived"`
	Tags     []string `json:"tags,omitempty" maxItems:"30"`
	// Cover image URL, direct audio URL, Spotify link, or canonical uploaded audio URL.
	Cover           string              `json:"cover,omitempty" maxLength:"2048"`
	SEO             *APISEO             `json:"seo,omitempty"`
	Recommendations *APIRecommendations `json:"recommendations,omitempty"`
}
type APICreatePost struct {
	APIPostOptions
	Title   string `json:"title" binding:"required" minLength:"1" maxLength:"240" example:"My first post"`
	Slug    string `json:"slug" binding:"required" minLength:"1" maxLength:"180" example:"my-first-post"`
	Content string `json:"content" binding:"required" maxLength:"2000000" example:"# Hello\nDraft content."`
}
type APIContentEdit struct {
	OldText string `json:"oldText" binding:"required" minLength:"1" maxLength:"2000000"`
	NewText string `json:"newText" binding:"required" maxLength:"2000000"`
}

type APIUpdatePost struct {
	// Sequential exact text replacements. Each oldText must match once. Mutually exclusive with content.
	Edits []APIContentEdit `json:"edits,omitempty" minItems:"1" maxItems:"100"`
	APIPostOptions
	Revision string `json:"revision" binding:"required"`
	Title    string `json:"title,omitempty" minLength:"1" maxLength:"240"`
	Slug     string `json:"slug,omitempty" minLength:"1" maxLength:"180"`
	Content  string `json:"content,omitempty" maxLength:"2000000"`
}
type APIDeletePost struct {
	Revision string `json:"revision" binding:"required"`
}
type APICreateToken struct {
	Name string `json:"name,omitempty" minLength:"1" maxLength:"100" default:"CLI"`
	Role string `json:"role,omitempty" enums:"reader,writer,publisher,owner" default:"reader"`
}
type APIUpdateToken struct {
	Role string `json:"role" binding:"required" enums:"reader,writer,publisher,owner"`
}
type APIToken struct {
	// Token identifier (SHA-256 hash), not the secret API key.
	ID        string `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role" enums:"reader,writer,publisher,owner"`
	CreatedAt string `json:"createdAt" format:"date-time"`
}
type APITokenSecret struct {
	// Secret is returned only once. Store it securely.
	Token string `json:"token"`
	Role  string `json:"role" enums:"reader,writer,publisher,owner"`
}
type APIOK struct {
	OK bool `json:"ok"`
}
type APIError struct {
	// Included when a post has no public link.
	Status           string `json:"status,omitempty"`
	PublicationState string `json:"publicationState,omitempty"`
	Error            string `json:"error"`
	Code             string `json:"code,omitempty"`
}

// APIWorkspacePostPage is a bounded result for workspace lists and search.
type APIWorkspacePostPage struct {
	Posts    []APISearchPost `json:"posts"`
	Total    int             `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"pageSize"`
	Pages    int             `json:"pages"`
}
