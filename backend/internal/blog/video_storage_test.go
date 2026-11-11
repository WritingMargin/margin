package blog

import (
	"bytes"
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
	"margin/backend/internal/contentcrypto"
	"net/http"
	"strings"
	"testing"
)

func TestEncryptedStorageReadsMaximumVideo(t *testing.T) {
	encryption, err := contentcrypto.New(strings.Repeat("12", 32))
	if err != nil {
		t.Fatal(err)
	}
	data := make([]byte, maxVideoBytes)
	copy(data, videoFixtureBytes("video/mp4"))
	data[len(data)-1] = 99
	key := "assets/videos/" + uuid()
	sealed, err := encryption.Encrypt(data, "test", key)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(sealed))}, nil
	})}
	storage := &S3Storage{bucket: "test", encryption: encryption, client: s3.New(s3.Options{
		Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true,
		Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client,
	})}
	got, err := storage.Get(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, data) {
		t.Fatal("maximum-size video was truncated in storage")
	}
}

func TestStoredObjectLimitRejectsOversizedVideo(t *testing.T) {
	_, err := readStoredObject(bytes.NewReader(make([]byte, maxVideoBytes+contentcrypto.Overhead+1)), "assets/videos/test")
	if err == nil {
		t.Fatal("oversized stored video accepted")
	}
}
