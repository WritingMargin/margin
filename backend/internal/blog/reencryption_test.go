package blog

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
	"margin/backend/internal/contentcrypto"
	"net/http"
	"strings"
	"testing"
)

const rotationOldKey = "1111111111111111111111111111111111111111111111111111111111111111"
const rotationNewKey = "2222222222222222222222222222222222222222222222222222222222222222"

type rotationFixture struct {
	db          *Database
	storage     *S3Storage
	objects     map[string][]byte
	writes      int
	failKey     string
	mutateKey   string
	mutateOnPut bool
	gets        map[string]int
	onGet       func()
	afterPut    func(string)
}

func rotationETag(data []byte) string { return fmt.Sprintf(`"%x"`, sha256.Sum256(data)) }

func (f *rotationFixture) transport(req *http.Request) (*http.Response, error) {
	key := strings.TrimPrefix(req.URL.Path, "/test/")
	status := 200
	data := f.objects[key]
	switch req.Method {
	case "GET":
		f.gets[key]++
		if f.onGet != nil {
			callback := f.onGet
			f.onGet = nil
			callback()
		}
		if f.mutateKey == key && f.gets[key] == 2 && !f.mutateOnPut {
			previous, _ := contentcrypto.New(rotationOldKey)
			data, _ = previous.Encrypt([]byte("concurrently edited"), "test", key)
			f.objects[key] = data
		}
	case "PUT":
		status = f.put(req, key)
		data = nil
	}
	return &http.Response{StatusCode: status, Header: http.Header{"Etag": {rotationETag(f.objects[key])}}, Body: io.NopCloser(bytes.NewReader(data))}, nil
}

func (f *rotationFixture) put(req *http.Request, key string) int {
	if f.mutateOnPut && key == f.mutateKey {
		previous, _ := contentcrypto.New(rotationOldKey)
		f.objects[key], _ = previous.Encrypt([]byte("concurrently edited"), "test", key)
	}
	if key == f.failKey {
		return 403
	}
	if f.objects[key] != nil && req.Header.Get("If-Match") != rotationETag(f.objects[key]) {
		return 412
	}
	data, err := io.ReadAll(req.Body)
	if err != nil {
		return 500
	}
	f.objects[key] = data
	f.writes++
	if f.afterPut != nil {
		callback := f.afterPut
		f.afterPut = nil
		callback(key)
	}
	return 200
}

func newRotationFixture(t *testing.T) *rotationFixture {
	t.Helper()
	db, err := OpenDatabase("", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.SQL.Close() })
	return rotationFixtureForDatabase(t, db)
}

func rotationFixtureForDatabase(t *testing.T, db *Database) *rotationFixture {
	t.Helper()
	f := &rotationFixture{db: db, objects: map[string][]byte{}, gets: map[string]int{}}
	target, _ := contentcrypto.New(rotationNewKey)
	f.storage = &S3Storage{bucket: "test", encryption: target, client: s3.New(s3.Options{
		Region: "us-east-1", BaseEndpoint: aws.String("https://storage.test"), UsePathStyle: true,
		Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""),
		HTTPClient:  &http.Client{Transport: testTransport(f.transport)}, RetryMaxAttempts: 1,
	})}
	seedRotationContent(t, f)
	seedRotationSettings(t, f)
	return f
}

func seedRotationContent(t *testing.T, f *rotationFixture) {
	t.Helper()
	ctx := context.Background()
	f.db.Must(ctx, `INSERT INTO posts(id,title,slug,excerpt,status,content_key,revision) VALUES('post','Article','article','','published','posts/live.md','live')`)
	snapshot := `{"content_key":"posts/history.md"}`
	f.db.Must(ctx, `INSERT INTO post_revisions(post_id,revision,version,snapshot,saved_at) VALUES('post','old',1,$1,NOW())`, snapshot)
	f.db.Must(ctx, `INSERT INTO post_drafts(post_id,slug,revision,base_revision,snapshot) VALUES('post','staged','draft','live',$1)`, `{"content_key":"posts/draft.md"}`)
	for _, table := range []string{"blog_logos", "uploaded_covers"} {
		f.db.Must(ctx, "INSERT INTO "+table+"(id,object_key,content_type) VALUES('asset',$1,'image/png')", "assets/"+table)
	}
	f.db.Must(ctx, `INSERT INTO uploaded_videos(id,object_key,content_type,size_bytes) VALUES('video','assets/videos/video','video/mp4',10)`)
	f.db.Must(ctx, `INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES('image','post','assets/generated','prompt','style','size','hash')`)
	f.db.Must(ctx, `INSERT INTO source_documents(id,object_key,title) VALUES('doc','documents/source','Document')`)
	previous, _ := contentcrypto.New(rotationOldKey)
	for _, key := range []string{"posts/live.md", "posts/history.md", "posts/draft.md", "assets/blog_logos", "assets/uploaded_covers", "assets/videos/video", "assets/generated", "documents/source"} {
		f.objects[key], _ = previous.Encrypt([]byte("content of "+key), "test", key)
	}
}

func seedRotationSettings(t *testing.T, f *rotationFixture) {
	t.Helper()
	previous, _ := contentcrypto.New(rotationOldKey)
	for _, entry := range []struct{ table, column, key string }{
		{"turnstile_settings", "encrypted_configuration", "turnstile"},
		{"newsletter_smtp", "encrypted_configuration", "newsletter-smtp"},
		{"central_connection", "encrypted_token", "central-account:https://account.test"},
	} {
		data, err := previous.Encrypt([]byte("secret for "+entry.key), "settings", entry.key)
		if err != nil {
			t.Fatal(err)
		}
		query := "INSERT INTO " + entry.table + "(id," + entry.column + ") VALUES(1,$1)"
		if entry.table == "central_connection" {
			query = "INSERT INTO central_connection(id,service_url,encrypted_token,registration) VALUES(1,'https://account.test',$1,'{}')"
		}
		f.db.Must(context.Background(), query, base64.StdEncoding.EncodeToString(data))
	}
}

func assertRotatedContent(t *testing.T, f *rotationFixture) {
	t.Helper()
	for key, data := range f.objects {
		plain, err := f.storage.encryption.PrimaryOnly().Decrypt(data, "test", key)
		if err != nil || string(plain) != "content of "+key {
			t.Fatalf("%s: %q %v", key, plain, err)
		}
	}
	tx, err := f.db.SQL.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	previous, _ := contentcrypto.New(rotationOldKey)
	settings, err := (keyRotation{previous: previous, target: f.storage.encryption}).prepareSettings(context.Background(), tx)
	if err != nil {
		t.Fatal(err)
	}
	for _, setting := range settings {
		if setting.after != "" {
			t.Fatalf("setting still uses old key: %s", setting.table)
		}
		data, _ := base64.StdEncoding.DecodeString(setting.before)
		plain, err := f.storage.encryption.Decrypt(data, "settings", setting.context)
		if err != nil || string(plain) != "secret for "+setting.context {
			t.Fatalf("changed settings: %s: %v", setting.table, err)
		}
	}
}

func TestReencryptAllContentAndCredentials(t *testing.T) {
	f := newRotationFixture(t)
	result, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err != nil {
		t.Fatal(err)
	}
	if result.Objects != 8 || result.Settings != 3 || result.AlreadyCurrent != 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	assertRotatedContent(t, f)
	result, err = Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err != nil || result.Objects != 0 || result.Settings != 0 || result.AlreadyCurrent != 11 {
		t.Fatalf("retry: %+v %v", result, err)
	}
	if f.writes != 8 {
		t.Fatalf("already migrated objects rewritten: %d", f.writes)
	}
}

func TestReencryptPartialFailureResumes(t *testing.T) {
	f := newRotationFixture(t)
	f.failKey = "posts/draft.md"
	result, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err == nil || result.Objects != 5 {
		t.Fatalf("expected partial failure: %+v %v", result, err)
	}
	f.failKey = ""
	result, err = Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err != nil || result.Objects != 3 || result.AlreadyCurrent != 5 || result.Settings != 3 {
		t.Fatalf("resume: %+v %v", result, err)
	}
	assertRotatedContent(t, f)
}

func TestReencryptPreflightRejectsWrongKeyAndCorruption(t *testing.T) {
	for _, scenario := range []string{"wrong previous key", "corrupt object", "corrupt settings"} {
		t.Run(scenario, func(t *testing.T) {
			f := newRotationFixture(t)
			previous := rotationOldKey
			switch scenario {
			case "wrong previous key":
				previous = strings.Repeat("aa", 32)
			case "corrupt object":
				f.objects["posts/live.md"] = []byte("plaintext or damaged envelope")
			case "corrupt settings":
				f.db.Must(context.Background(), "UPDATE newsletter_smtp SET encrypted_configuration='invalid'")
			}
			if _, err := Reencrypt(context.Background(), f.db, f.storage, previous); err == nil {
				t.Fatal("unauthenticated input accepted")
			}
			if f.writes != 0 {
				t.Fatal("preflight failure changed objects")
			}
		})
	}
}

func TestReencryptRejectsConcurrentObjectChanges(t *testing.T) {
	f := newRotationFixture(t)
	f.mutateKey = "assets/blog_logos"
	_, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err == nil || !strings.Contains(err.Error(), "object changed") {
		t.Fatalf("concurrent change accepted: %v", err)
	}
	if f.writes != 0 {
		t.Fatal("concurrent change overwritten")
	}
	previous, _ := contentcrypto.New(rotationOldKey)
	plain, _ := previous.Decrypt(f.objects[f.mutateKey], "test", f.mutateKey)
	if string(plain) != "concurrently edited" {
		t.Fatal("lost concurrent change")
	}
}

func TestPostgreSQLReencryptAllContentAndCredentials(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	f := rotationFixtureForDatabase(t, db)
	result, err := Reencrypt(context.Background(), db, f.storage, rotationOldKey)
	if err != nil || result.Objects != 8 || result.Settings != 3 {
		t.Fatalf("rotation: %+v %v", result, err)
	}
	assertRotatedContent(t, f)
}

func TestReencryptConditionalWriteProtectsChangesAfterRead(t *testing.T) {
	f := newRotationFixture(t)
	f.mutateKey = "assets/blog_logos"
	f.mutateOnPut = true
	_, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err == nil {
		t.Fatal("conditional write failure ignored")
	}
	if f.writes != 0 {
		t.Fatal("concurrent change overwritten")
	}
	previous, _ := contentcrypto.New(rotationOldKey)
	plain, _ := previous.Decrypt(f.objects[f.mutateKey], "test", f.mutateKey)
	if string(plain) != "concurrently edited" {
		t.Fatal("lost concurrent change")
	}
}

func TestReencryptSettingsWithoutConfiguredS3(t *testing.T) {
	f := newRotationFixture(t)
	for _, table := range []string{"posts", "blog_logos", "uploaded_covers", "uploaded_videos", "source_documents"} {
		f.db.Must(context.Background(), "DELETE FROM "+table)
	}
	f.storage.bucket = ""
	f.storage.issue = "Configure S3_BUCKET and S3 credentials before editing content."
	result, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey)
	if err != nil || result.Objects != 0 || result.Settings != 3 {
		t.Fatalf("settings rotation requires S3: %+v %v", result, err)
	}
	if f.writes != 0 {
		t.Fatal("settings-only migration contacted storage")
	}
	f.storage.encryption = nil
	if _, err := Reencrypt(context.Background(), f.db, f.storage, rotationOldKey); err == nil {
		t.Fatal("missing target key accepted")
	}
}
