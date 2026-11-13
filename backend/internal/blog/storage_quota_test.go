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

func TestOwnerStorageHasNoMarginPlanLimit(t *testing.T) {
	t.Setenv("AWS_EC2_METADATA_DISABLED", "true")
	t.Setenv("S3_STORAGE_LIMIT_BYTES", "100")
	t.Setenv("MARGIN_STORAGE_MANAGED", "false")
	storage, err := NewStorage(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if storage.limit != 0 {
		t.Fatal("owner bucket inherited a Margin quota")
	}
	if err := storage.checkStorageLimit(context.Background(), "large", 10000); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MARGIN_STORAGE_MANAGED", "true")
	storage, err = NewStorage(context.Background())
	if err != nil || storage.limit != 100 {
		t.Fatalf("managed quota missing: %v", err)
	}
}
func TestStorageQuotaStatusShowsUsedRemainingAndUnlimited(t *testing.T) {
	a, _ := coreFixture(t)
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>content</Key><Size>90</Size></Contents></ListBucketResult>`))}, nil
	})}
	storage := &S3Storage{bucket: "test", limit: 100, client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
	storage.AttachDatabase(a.DB)
	a.Storage = storage
	expectStatus(t, request(t, a, "GET", "/api/storage/usage", nil, false), 401)
	row := responseRow(t, request(t, a, "GET", "/api/storage/usage", nil, true), 200)
	if row["usedBytes"] != float64(90) || row["remainingBytes"] != float64(10) || row["quotaBytes"] != float64(100) {
		t.Fatal(row)
	}
	storage.limit = 80
	row = responseRow(t, request(t, a, "GET", "/api/storage/usage", nil, true), 200)
	if row["remainingBytes"] != float64(0) {
		t.Fatal(row)
	}
	storage.limit = 0
	row = responseRow(t, request(t, a, "GET", "/api/storage/usage", nil, true), 200)
	if row["quotaBytes"] != nil || row["remainingBytes"] != nil || row["usedBytes"] != float64(90) {
		t.Fatal(row)
	}
}

func TestStorageQuotaFailureNeverReportsZeroOrPartialUsage(t *testing.T) {
	for _, partial := range []bool{false, true} {
		t.Run(fmt.Sprintf("partial=%v", partial), func(t *testing.T) {
			a, _ := coreFixture(t)
			client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
				if partial && r.URL.Query().Get("continuation-token") == "" {
					return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken><Contents><Key>first</Key><Size>50</Size></Contents></ListBucketResult>`))}, nil
				}
				return &http.Response{StatusCode: 403, Header: http.Header{"Content-Type": []string{"application/xml"}}, Body: io.NopCloser(strings.NewReader(`<Error><Code>AccessDenied</Code><Message>Denied</Message></Error>`))}, nil
			})}
			storage := &S3Storage{bucket: "test", limit: 100, client: s3.New(s3.Options{Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true, Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""), HTTPClient: client})}
			storage.AttachDatabase(a.DB)
			a.Storage = storage
			row := responseRow(t, request(t, a, "GET", "/api/storage/usage", nil, true), 503)
			if row.str("code") != "STORAGE_UNAVAILABLE" {
				t.Fatal(row)
			}
			if _, present := row["usedBytes"]; present {
				t.Fatal("failed scan exposed misleading usage", row)
			}
			if len(a.DB.Must(context.Background(), "SELECT * FROM storage_usage_scan_objects")) != 0 {
				t.Fatal("failed scan retained partial objects")
			}
		})
	}
}
