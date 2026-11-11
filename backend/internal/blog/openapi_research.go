package blog

// Research tool arguments and returned private draft records.
type APIResearchSource struct {
	URL   string `json:"url" binding:"required" format:"uri" minLength:"1" maxLength:"2048"`
	Title string `json:"title" binding:"required" minLength:"1" maxLength:"500"`
	// Abstract or source excerpt. Omit or send an empty string to retain an existing excerpt.
	Excerpt string `json:"excerpt,omitempty" maxLength:"4000"`
}
type APISavedResearchSource struct {
	APIResearchSource
	ID string `json:"id" format:"uuid"`
}
type APIThinkingNote struct {
	Body           string `json:"body" binding:"required" minLength:"1" maxLength:"4000"`
	Title          string `json:"title,omitempty" maxLength:"80"`
	Reason         string `json:"reason,omitempty" maxLength:"2000"`
	Brief          string `json:"brief,omitempty" maxLength:"4000"`
	Audience       string `json:"audience,omitempty" maxLength:"500"`
	Passage        string `json:"passage,omitempty" maxLength:"12000"`
	IncludedDraft  bool   `json:"includedDraft,omitempty"`
	SourceRevision string `json:"sourceRevision,omitempty" maxLength:"300"`
	Feedback       string `json:"feedback,omitempty" maxLength:"4000"`
}
type APISavedThinkingNote struct {
	ID        string          `json:"id" format:"uuid"`
	PostID    string          `json:"postId" format:"uuid"`
	Note      APIThinkingNote `json:"note"`
	CreatedAt string          `json:"createdAt" format:"date-time"`
}
