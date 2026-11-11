package blog

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/maxmind/mmdbwriter/v2"
	"github.com/maxmind/mmdbwriter/v2/mmdbtype"
)

func countryFixture(t *testing.T) *App {
	t.Helper()
	t.Setenv("SQLITE_PATH", filepath.Join(t.TempDir(), "margin.db"))
	a, _ := coreFixture(t)
	return a
}

func TestCountryDatabaseRequiresOwnerConfirmation(t *testing.T) {
	a := countryFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, nil
	})
	expectStatus(t, request(t, a, "GET", "/api/settings/country-database", nil, false), 401)
	status := responseRow(t, request(t, a, "GET", "/api/settings/country-database", nil, true), 200)
	if status.yes("installed") || !status.yes("storageConfigured") || status.str("version") != countryDatabaseVersion || calls != 0 {
		t.Fatalf("unexpected initial status: %+v, network calls: %d", status, calls)
	}
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{"confirm": true}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{}, true), 400)
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{"confirm": false}, true), 400)
	if calls != 0 {
		t.Fatalf("download made %d network calls without owner confirmation", calls)
	}
}

func TestCountryDatabaseRequiresConfiguredS3(t *testing.T) {
	a := countryFixture(t)
	a.Storage = &S3Storage{issue: "S3 is not configured"}
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("country download started without S3 storage")
		return nil, nil
	})
	status := responseRow(t, request(t, a, "GET", "/api/settings/country-database", nil, true), 200)
	if status.yes("storageConfigured") || status.yes("installed") {
		t.Fatal("country lookup reported available without S3")
	}
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{"confirm": true}, true), 503)
}

func TestCountryDatabaseRejectsUnverifiedArchive(t *testing.T) {
	a := countryFixture(t)
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != countryDatabaseURL || r.Method != http.MethodGet {
			t.Fatalf("unexpected download request: %s %s", r.Method, r.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("unverified"))}, nil
	})
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{"confirm": true}, true), 502)
	if len(a.DB.Must(t.Context(), "SELECT id FROM analytics_country_database")) != 0 {
		t.Fatal("unverified database was installed")
	}
	if data, _ := a.Storage.Get(t.Context(), countryObjectKey); len(data) != 0 {
		t.Fatal("unverified database was stored in S3")
	}
}

func TestCountryDatabaseRejectsExternalRedirect(t *testing.T) {
	a := countryFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://other.example/db.mmdb.gz"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	expectStatus(t, request(t, a, "POST", "/api/settings/country-database", Row{"confirm": true}, true), 502)
	if calls != 1 {
		t.Fatalf("download followed an external redirect: %d requests", calls)
	}
}

func TestAnalyticsLocationDiscardsIPUntilOwnerInstallsDatabase(t *testing.T) {
	a := countryFixture(t)
	// Linking a Central account must not trigger a lookup or a download.
	t.Setenv("AI_SERVICE_TOKEN", "linked-account")
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("country lookup contacted a remote service")
		return nil, nil
	})
	payload := analyticsPayload(nil)
	r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", strings.NewReader(encode(payload)))
	r.RemoteAddr = "8.8.8.8:1234"
	r.Header.Set("Content-Type", "application/json")
	if got := a.analyticsLocation(r); got != "Unknown" || a.analyticsLocationSource() != "none" {
		t.Fatalf("location = %q, source = %q", got, a.analyticsLocationSource())
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	expectStatus(t, w, 204)
	stored := first(a.DB.Must(context.Background(), "SELECT country FROM analytics_visits WHERE id=$1", payload.str("viewId")))
	if stored.str("country") != "Unknown" {
		t.Fatalf("stored location = %q", stored.str("country"))
	}
	reportResponse := request(t, a, "GET", "/api/analytics", nil, true)
	report := responseRow(t, reportResponse, 200)
	if strings.Contains(reportResponse.Body.String(), "8.8.8.8") || report.str("countrySource") != "none" || object(report["countries"].([]any)[0]).str("country") != "Unknown" {
		t.Fatalf("report exposed visitor IP or incorrect location: %s", reportResponse.Body.String())
	}
	if storedObjects := a.Storage.(*testStorage).objects; len(storedObjects) != 0 {
		t.Fatalf("analytics wrote S3 objects: %d", len(storedObjects))
	}
}

func TestAnalyticsLegacyVisitorIPsAreRemovedOnStart(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "margin.db")
	db := databaseFixture(t, filename)
	db.Must(t.Context(), "INSERT INTO api_tokens(token_hash,name) VALUES($1,$2)", hash("owner"), "Test")
	storage := &testStorage{objects: map[string][]byte{}}
	a := NewApp(db, storage, nil, nil)
	payload := analyticsPayload(nil)
	analyticsSubmit(t, a, payload)
	a.DB.Must(t.Context(), "UPDATE analytics_visits SET country='ip:8.8.8.8'")
	reopened := databaseFixture(t, filename)
	fresh := NewApp(reopened, storage, nil, nil)
	row := first(reopened.Must(t.Context(), "SELECT country FROM analytics_visits WHERE id=$1", payload.str("viewId")))
	if row.str("country") != "Unknown" {
		t.Fatalf("startup migration kept visitor IP: %+v", row)
	}
	reopened.Must(t.Context(), "UPDATE analytics_visits SET country='ip:1.1.1.1'")
	reportResponse := request(t, fresh, "GET", "/api/analytics", nil, true)
	report := responseRow(t, reportResponse, 200)
	if strings.Contains(reportResponse.Body.String(), "1.1.1.1") || object(report["countries"].([]any)[0]).str("country") != "Unknown" {
		t.Fatalf("report exposed legacy visitor IP: %s", reportResponse.Body.String())
	}
	analyticsSubmit(t, fresh, payload)
	row = first(reopened.Must(t.Context(), "SELECT country FROM analytics_visits WHERE id=$1", payload.str("viewId")))
	if row.str("country") != "Unknown" {
		t.Fatalf("visit retry kept visitor IP: %+v", row)
	}
}

func syntheticCountryArchive(t *testing.T) ([]byte, []byte) {
	// Generate a tiny synthetic MMDB in memory; no DB-IP data is in the repo.
	t.Helper()
	writer, err := mmdbwriter.New(mmdbwriter.Options{DatabaseType: "Margin-Test-Country", Description: map[string]string{"en": "Synthetic country fixture"}})
	if err != nil {
		t.Fatal(err)
	}
	if err = writer.Insert(netip.MustParsePrefix("8.8.8.0/24"), mmdbtype.Map{"country": mmdbtype.Map{"iso_code": mmdbtype.String("US")}}); err != nil {
		t.Fatal(err)
	}
	var database bytes.Buffer
	if _, err = writer.WriteTo(&database); err != nil {
		t.Fatal(err)
	}
	data := database.Bytes()
	var archive bytes.Buffer
	compressor := gzip.NewWriter(&archive)
	if _, err = compressor.Write(data); err != nil {
		t.Fatal(err)
	}
	if err = compressor.Close(); err != nil {
		t.Fatal(err)
	}
	return archive.Bytes(), data
}

func TestCountryDatabaseInstallsOneVerifiedS3Copy(t *testing.T) {
	archiveBytes, data := syntheticCountryArchive(t)
	a := countryFixture(t)
	calls := 0
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(archiveBytes))}, nil
	})
	spec := countryDownloadSpec{countryDatabaseURL, countryDigest(archiveBytes), countryDigest(data)}
	if err := a.installCountryDatabaseFrom(context.Background(), spec); err != nil {
		t.Fatal(err)
	}
	if err := a.installCountryDatabaseFrom(context.Background(), spec); err != nil {
		t.Fatal(err)
	}
	if calls != 1 || a.analyticsLocationSource() != "local" {
		t.Fatalf("download calls = %d, location source = %q", calls, a.analyticsLocationSource())
	}
	r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", nil)
	r.RemoteAddr = "8.8.8.8:1234"
	if got := a.analyticsLocation(r); got != "US" {
		t.Fatalf("local lookup = %q", got)
	}
	assertStoredCountryCopy(t, a, data)
}

func assertStoredCountryCopy(t *testing.T, a *App, data []byte) {
	t.Helper()
	stored := first(a.DB.Must(t.Context(), "SELECT object_key,file_sha256,version FROM analytics_country_database WHERE id=1"))
	storedData, err := a.Storage.Get(t.Context(), countryObjectKey)
	if err != nil || stored == nil || !bytes.Equal(storedData, data) || stored.str("object_key") != countryObjectKey || stored.str("file_sha256") != countryDigest(data) || stored.str("version") != countryDatabaseVersion {
		t.Fatal("saved S3 object differs from verified download")
	}
}

func TestCountryDatabaseSurvivesEngineRestart(t *testing.T) {
	archive, data := syntheticCountryArchive(t)
	filename := filepath.Join(t.TempDir(), "margin.db")
	db := databaseFixture(t, filename)
	storage := &testStorage{objects: map[string][]byte{}}
	a := NewApp(db, storage, nil, nil)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(archive))}, nil
	})
	spec := countryDownloadSpec{countryDatabaseURL, countryDigest(archive), countryDigest(data)}
	if err := a.installCountryDatabaseFrom(t.Context(), spec); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.countryFilePath()); !os.IsNotExist(err) {
		t.Fatalf("country data should be in S3, not an ephemeral file: %v", err)
	}
	reopened := databaseFixture(t, filename)
	fresh := NewApp(reopened, storage, nil, nil)
	if !fresh.countryDatabaseStatus().yes("installed") || fresh.analyticsLocationSource() != "local" {
		t.Fatal("installed country database disappeared after reopening metadata")
	}
	r := httptest.NewRequest("POST", "http://blog.test/api/public/analytics", nil)
	r.RemoteAddr = "8.8.8.8:1234"
	if got := fresh.analyticsLocation(r); got != "US" {
		t.Fatalf("country lookup after restart = %q", got)
	}
	assertCountryDatabaseRecoversMissingObject(t, reopened, storage, archive, spec)
}

func assertCountryDatabaseRecoversMissingObject(t *testing.T, db *Database, storage *testStorage, archive []byte, spec countryDownloadSpec) {
	t.Helper()
	if err := storage.Remove(t.Context(), countryObjectKey); err != nil {
		t.Fatal(err)
	}
	missing := NewApp(db, storage, nil, nil)
	status := missing.countryDatabaseStatus()
	if status.yes("installed") || status.str("error") == "" {
		t.Fatal("missing S3 object was reported installed")
	}
	missing.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(archive))}, nil
	})
	if err := missing.installCountryDatabaseFrom(t.Context(), spec); err != nil || !missing.countryDatabaseStatus().yes("installed") {
		t.Fatalf("country lookup did not recover after re-downloading: %v", err)
	}
}

func TestCountryDatabaseMigratesVerifiedFileIntoDatabase(t *testing.T) {
	_, data := syntheticCountryArchive(t)
	filename := filepath.Join(t.TempDir(), "margin.db")
	db := databaseFixture(t, filename)
	storage := &testStorage{objects: map[string][]byte{}}
	a := NewApp(db, storage, nil, nil)
	if err := os.WriteFile(a.countryFilePath(), data, 0600); err != nil {
		t.Fatal(err)
	}
	migrated, err := a.migrateCountryDatabaseFile(t.Context(), countryDigest(data))
	if err != nil {
		t.Fatal(err)
	}
	defer migrated.reader.Close()
	if _, err := os.Stat(a.countryFilePath()); !os.IsNotExist(err) {
		t.Fatalf("migrated file was not removed: %v", err)
	}
	reopened := databaseFixture(t, filename)
	fresh := NewApp(reopened, storage, nil, nil)
	if !fresh.countryDatabaseStatus().yes("installed") {
		t.Fatal("migrated country database was not restored")
	}
}

func TestCountryDatabasePersistsInPostgres(t *testing.T) {
	db, address := postgresTestDatabase(t)
	archive, data := syntheticCountryArchive(t)
	storage := &testStorage{objects: map[string][]byte{}}
	a := NewApp(db, storage, nil, nil)
	a.Client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(archive))}, nil
	})
	spec := countryDownloadSpec{countryDatabaseURL, countryDigest(archive), countryDigest(data)}
	if err := a.installCountryDatabaseFrom(t.Context(), spec); err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenDatabase(address, "")
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.SQL.Close()
	fresh := NewApp(reopened, storage, nil, nil)
	if !fresh.countryDatabaseStatus().yes("installed") || fresh.analyticsLocationSource() != "local" {
		t.Fatal("PostgreSQL country database disappeared after reopening")
	}
}
