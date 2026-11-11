package blog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"margin/backend/internal/contentcrypto"
	"time"
)

type rotationObject struct {
	key, etag string
	current   bool
}

func (r keyRotation) prepareObjects(ctx context.Context, storage *S3Storage, keys []string) ([]rotationObject, error) {
	objects := make([]rotationObject, 0, len(keys))
	for _, key := range keys {
		data, etag, err := readRotationObject(ctx, storage, key)
		if err != nil {
			return nil, fmt.Errorf("preflight %s: %w", key, err)
		}
		_, current, err := r.plaintext(data, storage.bucket, key)
		if err != nil {
			return nil, fmt.Errorf("preflight %s: %w", key, err)
		}
		objects = append(objects, rotationObject{key: key, etag: etag, current: current})
	}
	return objects, nil
}

func readRotationObject(ctx context.Context, storage *S3Storage, key string) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	object, err := storage.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(storage.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, "", err
	}
	defer object.Body.Close()
	if aws.ToString(object.ETag) == "" {
		return nil, "", errors.New("S3 did not return an ETag; conditional re-encryption requires ETags")
	}
	data, err := readStoredObject(object.Body, key)
	return data, aws.ToString(object.ETag), err
}

func (r keyRotation) writeObject(ctx context.Context, storage *S3Storage, object rotationObject) error {
	data, etag, err := readRotationObject(ctx, storage, object.key)
	if err != nil {
		return err
	}
	if etag != object.etag {
		return errors.New("object changed during re-encryption; the concurrent edit was preserved; keep the previous-key fallback enabled and retry")
	}
	plain, _, err := r.plaintext(data, storage.bucket, object.key)
	if err != nil {
		return err
	}
	encrypted, err := r.target.Encrypt(plain, storage.bucket, object.key)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	_, err = storage.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(storage.bucket), Key: aws.String(object.key), IfMatch: aws.String(etag),
		Body: bytes.NewReader(encrypted), ContentType: aws.String("application/octet-stream"),
		Metadata: map[string]string{"margin-encryption": contentcrypto.Format},
	})
	return err
}
