// Package contentcrypto implements Margin's authenticated S3 envelope.
package contentcrypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
)

const Format = "aes-256-gcm-v1"
const Overhead = 36
const magic = "MRGSEC01"

var (
	ErrKey            = errors.New("CONTENT_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters")
	ErrFormat         = errors.New("stored object is not a supported encrypted object")
	ErrAuthentication = errors.New("stored content could not be authenticated; check the encryption key and object integrity")
)

type Encryption struct {
	aead     cipher.AEAD
	previous *Encryption
}

// NewWithPrevious writes with the primary key and accepts either key on reads.
// The optional fallback is for the transition between encryption keys only.
func NewWithPrevious(encodedKey, previousKey string) (*Encryption, error) {
	primary, err := New(encodedKey)
	if err != nil || previousKey == "" {
		return primary, err
	}
	previous, err := New(previousKey)
	if err != nil {
		return nil, errors.New("CONTENT_ENCRYPTION_KEY_PREVIOUS must be 32 bytes encoded as 64 hexadecimal characters")
	}
	primary.previous = previous
	return primary, nil
}

// PrimaryOnly verifies that a value no longer needs a migration fallback key.
func (e *Encryption) PrimaryOnly() *Encryption { return &Encryption{aead: e.aead} }

func New(encodedKey string) (*Encryption, error) {
	if len(encodedKey) != 64 {
		return nil, ErrKey
	}
	key, err := hex.DecodeString(encodedKey)
	if err != nil {
		return nil, ErrKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Encryption{aead: aead}, nil
}

// The envelope authenticates a UTF-8 JSON array of format, bucket, and object key.
// The canonical encoding uses literal HTML characters and Unicode separators.
func context(bucket, objectKey string) []byte {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode([]string{Format, bucket, objectKey})
	encoded := bytes.TrimSuffix(buf.Bytes(), []byte("\n"))
	// Replace only actual JSON escapes, never the text in an escaped backslash.
	result := make([]byte, 0, len(encoded))
	for i := 0; i < len(encoded); i++ {
		if encoded[i] == '\\' && i+1 < len(encoded) {
			if i+6 <= len(encoded) && (string(encoded[i:i+6]) == `\u2028` || string(encoded[i:i+6]) == `\u2029`) {
				if encoded[i+5] == '8' {
					result = append(result, []byte("\u2028")...)
				} else {
					result = append(result, []byte("\u2029")...)
				}
				i += 5
				continue
			}
			result = append(result, encoded[i], encoded[i+1])
			i++
			continue
		}
		result = append(result, encoded[i])
	}
	return result
}

func (e *Encryption) Encrypt(plaintext []byte, bucket, objectKey string) ([]byte, error) {
	nonce := make([]byte, e.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	sealed := e.aead.Seal(nil, nonce, plaintext, context(bucket, objectKey))
	// Go appends the tag to the ciphertext; Margin stores the tag first.
	split := len(sealed) - e.aead.Overhead()
	envelope := make([]byte, 0, len(plaintext)+Overhead)
	envelope = append(envelope, magic...)
	envelope = append(envelope, nonce...)
	envelope = append(envelope, sealed[split:]...)
	envelope = append(envelope, sealed[:split]...)
	return envelope, nil
}

func (e *Encryption) Decrypt(envelope []byte, bucket, objectKey string) ([]byte, error) {
	if len(envelope) < Overhead || string(envelope[:8]) != magic {
		return nil, ErrFormat
	}
	sealed := make([]byte, 0, len(envelope)-20)
	sealed = append(sealed, envelope[36:]...)
	sealed = append(sealed, envelope[20:36]...)
	plaintext, err := e.aead.Open(nil, envelope[8:20], sealed, context(bucket, objectKey))
	if err != nil {
		if e.previous != nil {
			return e.previous.Decrypt(envelope, bucket, objectKey)
		}
		return nil, ErrAuthentication
	}
	return plaintext, nil
}
