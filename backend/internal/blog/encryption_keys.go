package blog

import (
	"margin/backend/internal/contentcrypto"
	"os"
)

// Every encrypted store uses the same write key and optional read-only fallback.
func configuredContentEncryption() (*contentcrypto.Encryption, error) {
	return contentcrypto.NewWithPrevious(os.Getenv("CONTENT_ENCRYPTION_KEY"), os.Getenv("CONTENT_ENCRYPTION_KEY_PREVIOUS"))
}
