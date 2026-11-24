package blog

// Workspace Notes API and MCP models.
type APIWorkspaceNoteLink struct {
	URL   string `json:"url" binding:"required" format:"uri" minLength:"1" maxLength:"2048"`
	Title string `json:"title,omitempty" maxLength:"200"`
}

type APIWorkspaceNoteInput struct {
	Title    string                 `json:"title,omitempty" maxLength:"200"`
	Content  string                 `json:"content,omitempty" maxLength:"50000"`
	Links    []APIWorkspaceNoteLink `json:"links,omitempty" maxItems:"50"`
	IsPublic *bool                  `json:"isPublic,omitempty"`
}

type APIShareWorkspaceNoteInput struct {
	Enabled    bool  `json:"enabled" binding:"required"`
	Regenerate *bool `json:"regenerate,omitempty"`
}

type APIWorkspaceNote struct {
	ID          string                 `json:"id" format:"uuid"`
	AuthorID    string                 `json:"authorId"`
	AuthorName  string                 `json:"authorName"`
	AuthorEmail string                 `json:"authorEmail"`
	Title       string                 `json:"title"`
	Content     string                 `json:"content"`
	Links       []APIWorkspaceNoteLink `json:"links"`
	IsPublic    bool                   `json:"isPublic"`
	Shared      bool                   `json:"shared"`
	ShareURL    string                 `json:"shareUrl,omitempty"`
	ShareToken  string                 `json:"shareToken,omitempty"`
	CanEdit     bool                   `json:"canEdit"`
	CanDelete   bool                   `json:"canDelete"`
	CreatedAt   string                 `json:"createdAt" format:"date-time"`
	UpdatedAt   string                 `json:"updatedAt" format:"date-time"`
}
