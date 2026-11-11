package blog

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestS3StorageLimitCountsExistingObjectsAndOverwrites(t *testing.T) {
	a, _ := coreFixture(t)
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Query().Get("list-type") != "2" {
			t.Fatalf("unexpected S3 request: %s", r.URL)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>existing</Key><Size>90</Size></Contents></ListBucketResult>`))}, nil
	})}
	storage := &S3Storage{bucket: "test", limit: 100, client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	storage.AttachDatabase(a.DB)
	if err := storage.checkStorageLimit(context.Background(), "new", 11); err == nil {
		t.Fatal("accepted write above quota")
	}
	if err := storage.checkStorageLimit(context.Background(), "existing", 100); err != nil {
		t.Fatalf("rejected replacement at quota: %v", err)
	}
	used, err := storage.Usage(context.Background())
	if err != nil || used != 90 {
		t.Fatalf("usage: %d %v", used, err)
	}
	if rows := a.DB.Must(context.Background(), "SELECT * FROM storage_usage_scan_objects"); len(rows) != 0 {
		t.Fatal("usage scans were not cleaned up", rows)
	}
}

func TestS3StorageUsageReconcilesExternalObjects(t *testing.T) {
	a, _ := coreFixture(t)
	a.DB.Must(context.Background(), "INSERT INTO storage_usage_scan_objects(scan_id,key,size_bytes) VALUES('20000101000000-abandoned','stale',999)")
	objects := `<Contents><Key>first</Key><Size>50</Size></Contents>`
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>false</IsTruncated>` + objects + `</ListBucketResult>`))}, nil
	})}
	storage := &S3Storage{bucket: "test", client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	storage.AttachDatabase(a.DB)
	if used, err := storage.Usage(context.Background()); err != nil || used != 50 {
		t.Fatalf("first usage: %d %v", used, err)
	}
	if rows := a.DB.Must(context.Background(), "SELECT * FROM storage_usage_scan_objects"); len(rows) != 0 {
		t.Fatal("stale or finished usage scan retained", rows)
	}
	objects = `<Contents><Key>external</Key><Size>70</Size></Contents>`
	if used, err := storage.Usage(context.Background()); err != nil || used != 70 {
		t.Fatalf("reconciled usage: %d %v", used, err)
	}
}

func TestS3StorageUsageCleansPartialScanAfterListError(t *testing.T) {
	a, _ := coreFixture(t)
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Query().Get("continuation-token") != "" {
			return &http.Response{StatusCode: 403, Header: http.Header{"Content-Type": []string{"application/xml"}}, Body: io.NopCloser(strings.NewReader(`<Error><Code>AccessDenied</Code><Message>Denied</Message></Error>`))}, nil
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken><Contents><Key>first</Key><Size>50</Size></Contents></ListBucketResult>`))}, nil
	})}
	storage := &S3Storage{bucket: "test", client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	storage.AttachDatabase(a.DB)
	if _, err := storage.Usage(context.Background()); err == nil {
		t.Fatal("usage succeeded after a failed S3 page")
	}
	if rows := a.DB.Must(context.Background(), "SELECT * FROM storage_usage_scan_objects"); len(rows) != 0 {
		t.Fatal("partial usage scan was not cleaned up", rows)
	}
}

func TestS3StorageUsageBatchesLargePage(t *testing.T) {
	a, _ := coreFixture(t)
	var contents strings.Builder
	for index := range 251 {
		fmt.Fprintf(&contents, "<Contents><Key>object-%d</Key><Size>2</Size></Contents>", index)
	}
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>false</IsTruncated>` + contents.String() + `</ListBucketResult>`))}, nil
	})}
	storage := &S3Storage{bucket: "test", client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	storage.AttachDatabase(a.DB)
	if used, err := storage.Usage(context.Background()); err != nil || used != 502 {
		t.Fatalf("batched usage: %d %v", used, err)
	}
}

func TestCloudStorageUsageRequiresMachineCredential(t *testing.T) {
	a := cloudOwnerFixture(t)
	expectStatus(t, cloudMachineCall(a, "/api/cloud/bootstrap", cloudOwnerInput()), 201)
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>content</Key><Size>90</Size></Contents></ListBucketResult>`))}, nil
	})}
	a.Storage = &S3Storage{bucket: "test", client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	a.Storage.(*S3Storage).AttachDatabase(a.DB)
	request := httptest.NewRequest("GET", "https://notes.pages.example/api/cloud/storage-usage", nil)
	denied := httptest.NewRecorder()
	a.ServeHTTP(denied, request)
	expectStatus(t, denied, 403)
	request = httptest.NewRequest("GET", "https://notes.pages.example/api/cloud/storage-usage", nil)
	request.Header.Set("Authorization", "Bearer "+strings.Repeat("s", 32))
	allowed := httptest.NewRecorder()
	a.ServeHTTP(allowed, request)
	if response := responseRow(t, allowed, 200); response["bytes"] != float64(90) {
		t.Fatal(response)
	}
}
