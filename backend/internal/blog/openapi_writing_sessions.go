package blog

type APIWritingChatsInput struct {
	Chats            map[string]any `json:"chats" binding:"required"`
	PostID           string         `json:"postId,omitempty"`
	PreviousDraftKey string         `json:"previousDraftKey,omitempty"`
}

type APIWritingChatSession struct {
	Chats     map[string]any `json:"chats"`
	ExpiresAt string         `json:"expiresAt,omitempty" format:"date-time"`
}

type APIWritingChatExpiry struct {
	ExpiresAt string `json:"expiresAt" format:"date-time"`
}
