package blog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
	"margin/backend/internal/contentcrypto"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Storage interface {
	Configured() bool
	Info() Row
	Health(context.Context) error
	Put(context.Context, string, []byte) error
	Get(context.Context, string) ([]byte, error)
	Remove(context.Context, string) error
}
type S3Storage struct {
	client                *s3.Client
	bucket, region, issue string
	encryption            *contentcrypto.Encryption
	db                    *Database
	limit                 int64
	writeMu               sync.Mutex
}

// AttachDatabase enables SQL-backed accounting for S3 object listings.
func (s *S3Storage) AttachDatabase(db *Database) { s.db = db }

func NewStorage(ctx context.Context) (*S3Storage, error) {
	region := env("S3_REGION", "us-east-1")
	opts := []func(*config.LoadOptions) error{config.WithRegion(region), config.WithRetryMaxAttempts(2)}
	if os.Getenv("S3_ACCESS_KEY_ID") != "" && os.Getenv("S3_SECRET_ACCESS_KEY") != "" {
		opts = append(opts, config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(os.Getenv("S3_ACCESS_KEY_ID"), os.Getenv("S3_SECRET_ACCESS_KEY"), os.Getenv("S3_SESSION_TOKEN"))))
	}
	cfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, err
	}
	result := &S3Storage{bucket: os.Getenv("S3_BUCKET"), region: region}
	result.limit, err = configuredStorageLimit()
	if err != nil {
		return nil, err
	}
	result.client = s3.NewFromConfig(cfg, func(o *s3.Options) {
		if ep := os.Getenv("S3_ENDPOINT"); ep != "" {
			o.BaseEndpoint = aws.String(ep)
		}
		o.UsePathStyle = os.Getenv("S3_FORCE_PATH_STYLE") == "true"
	})
	result.encryption, err = configuredContentEncryption()
	if err != nil {
		result.issue = err.Error()
	}
	if result.bucket == "" {
		result.issue = "Configure S3_BUCKET and S3 credentials before editing content."
	}
	return result, nil
}
func configuredStorageLimit() (int64, error) {
	raw := os.Getenv("S3_STORAGE_LIMIT_BYTES")
	if raw == "" || os.Getenv("MARGIN_STORAGE_MANAGED") != "true" {
		return 0, nil
	}
	limit, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || limit <= 0 {
		return 0, fmt.Errorf("S3_STORAGE_LIMIT_BYTES must be a positive byte count")
	}
	return limit, nil
}

func (s *S3Storage) Configured() bool { return s.issue == "" }
func (s *S3Storage) Info() Row {
	format := "not-configured"
	if s.encryption != nil {
		format = contentcrypto.Format
	}
	return Row{"configured": s.Configured(), "bucket": s.bucket, "region": s.region, "customEndpoint": os.Getenv("S3_ENDPOINT") != "", "encryption": format, "configurationError": s.issue}
}
func (s *S3Storage) require() error {
	if s.issue != "" {
		return &HTTPError{503, s.issue, ""}
	}
	return nil
}
func (s *S3Storage) Health(ctx context.Context) error {
	if err := s.require(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	return err
}
func (s *S3Storage) Put(ctx context.Context, key string, body []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.require(); err != nil {
		return err
	}
	encrypted, err := s.encryption.Encrypt(body, s.bucket, key)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := s.checkStorageLimit(ctx, key, int64(len(encrypted))); err != nil {
		return err
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key), Body: bytes.NewReader(encrypted), ContentType: aws.String("application/octet-stream"), Metadata: map[string]string{"margin-encryption": contentcrypto.Format}})
	return err
}

func (s *S3Storage) checkStorageLimit(ctx context.Context, key string, newSize int64) error {
	if s.limit == 0 {
		return nil
	}
	used, previous, err := s.storageUsage(ctx, key)
	if err != nil {
		return err
	}
	if used-previous+newSize > s.limit {
		return &HTTPError{413, "Your publication storage is full. Remove old content or contact support to upgrade.", "STORAGE_LIMIT"}
	}
	return nil
}
func (s *S3Storage) Usage(ctx context.Context) (int64, error) {
	if err := s.require(); err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	used, _, err := s.storageUsage(ctx, "")
	return used, err
}
func (s *S3Storage) storageUsage(ctx context.Context, key string) (used, previous int64, err error) {
	if s.db == nil {
		return 0, 0, errors.New("storage usage database is unavailable")
	}
	now := time.Now().UTC()
	scanID := now.Format("20060102150405") + "-" + uuid()
	// A process may exit before its deferred cleanup; old scan rows never count
	// toward current usage and can be removed without touching active scans.
	if _, err := s.db.Query(ctx, "DELETE FROM storage_usage_scan_objects WHERE scan_id<$1", now.Add(-24*time.Hour).Format("20060102150405")); err != nil {
		return 0, 0, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_, cleanupErr := s.db.Query(cleanup, "DELETE FROM storage_usage_scan_objects WHERE scan_id=$1", scanID)
		if cleanupErr != nil {
			used, previous = 0, 0
			err = errors.Join(err, fmt.Errorf("clear storage usage scan: %w", cleanupErr))
		}
	}()
	pager := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{Bucket: aws.String(s.bucket)})
	for pager.HasMorePages() {
		page, pageErr := pager.NextPage(ctx)
		if pageErr != nil {
			return 0, 0, pageErr
		}
		for start := 0; start < len(page.Contents); start += 250 {
			end := min(start+250, len(page.Contents))
			values := make([]string, 0, end-start)
			args := make([]any, 0, 3*(end-start))
			for _, object := range page.Contents[start:end] {
				args = append(args, scanID, aws.ToString(object.Key), aws.ToInt64(object.Size))
				values = append(values, fmt.Sprintf("($%d,$%d,$%d)", len(args)-2, len(args)-1, len(args)))
			}
			_, err = s.db.Query(ctx, `INSERT INTO storage_usage_scan_objects(scan_id,key,size_bytes) VALUES `+strings.Join(values, ",")+`
 ON CONFLICT(scan_id,key) DO UPDATE SET size_bytes=excluded.size_bytes`, args...)
			if err != nil {
				return 0, 0, err
			}
		}
	}
	rows, err := s.db.Query(ctx, `SELECT CAST(COALESCE(SUM(size_bytes),0) AS BIGINT) AS used,
 CAST(COALESCE(MAX(CASE WHEN key=$2 THEN size_bytes ELSE 0 END),0) AS BIGINT) AS previous
 FROM storage_usage_scan_objects WHERE scan_id=$1`, scanID, key)
	if err != nil {
		return 0, 0, err
	}
	result := first(rows)
	return result["used"].(int64), result["previous"].(int64), nil
}
func (s *S3Storage) Get(ctx context.Context, key string) ([]byte, error) {
	if err := s.require(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, err
	}
	defer result.Body.Close()
	body, err := readStoredObject(result.Body, key)
	if err != nil {
		return nil, err
	}
	plain, err := s.encryption.Decrypt(body, s.bucket, key)
	if err != nil {
		return nil, &HTTPError{503, err.Error(), ""}
	}
	return plain, nil
}

func readStoredObject(reader io.Reader, key string) ([]byte, error) {
	limit := 40 << 20
	if strings.HasPrefix(key, "assets/videos/") {
		limit = maxVideoBytes + contentcrypto.Overhead
	}
	body, err := io.ReadAll(io.LimitReader(reader, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(body) > limit {
		return nil, &HTTPError{503, "Stored object exceeds its size limit.", ""}
	}
	return body, nil
}
func (s *S3Storage) Remove(ctx context.Context, key string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.require(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	return err
}
func (s *S3Storage) CreateBucket(ctx context.Context) error {
	if s.bucket == "" {
		return fmt.Errorf("S3_BUCKET is required")
	}
	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	if err == nil {
		return nil
	}
	var response interface{ HTTPStatusCode() int }
	if !errors.As(err, &response) || response.HTTPStatusCode() != 404 {
		return err
	}
	_, err = s.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(s.bucket)})
	return err
}
