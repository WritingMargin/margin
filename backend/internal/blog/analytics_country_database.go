package blog

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"time"

	"github.com/oschwald/maxminddb-golang/v2"
)

// This release is pinned to a published DB-IP Country Lite snapshot. No data
// file is included in the Margin image or fetched before the owner opts in.
const countryDatabaseVersion = "2026-11"
const countryDatabaseURL = "https://download.db-ip.com/free/dbip-country-lite-2026-11.mmdb.gz"
const countryArchiveSHA256 = "75fe430010f6d38a8c4331c202bf0df6ce3221a6e6d823b9e5a6d951e4cf9758"
const countryFileSHA256 = "145ce5dfb812d8de28547e6289bb5c5f8b3df2f1dea21d324d5b575e0431311f"
const countryFileName = "dbip-country-lite.mmdb"
const countryObjectKey = "analytics/country/dbip-country-lite-2026-11.mmdb"
const maxCountryBytes = 16 << 20

type countryDatabase struct {
	reader  *maxminddb.Reader
	version string
}
type countryDownloadSpec struct{ url, archiveSHA256, fileSHA256 string }

var currentCountryDownload = countryDownloadSpec{countryDatabaseURL, countryArchiveSHA256, countryFileSHA256}

func (a *App) countryFilePath() string {
	if a.DB.Kind == "sqlite" && a.DB.dsn != ":memory:" {
		return filepath.Join(filepath.Dir(a.DB.dsn), countryFileName)
	}
	return filepath.Join(filepath.Dir(env("SQLITE_PATH", ".data/margin.db")), countryFileName)
}

func countryDigest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func verifiedCountryDatabase(data []byte, expectedDigest string) (*countryDatabase, error) {
	if countryDigest(data) != expectedDigest {
		return nil, errors.New("country database checksum mismatch")
	}
	reader, err := maxminddb.OpenBytes(data)
	if err != nil {
		return nil, err
	}
	if err = reader.Verify(); err != nil {
		_ = reader.Close()
		return nil, err
	}
	return &countryDatabase{reader: reader}, nil
}

func readInstalledCountryDatabase(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxCountryBytes {
		return nil, errors.New("invalid country database file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxCountryBytes {
		return nil, errors.New("invalid country database file")
	}
	return io.ReadAll(io.LimitReader(file, maxCountryBytes+1))
}

func (a *App) ensureCountryDatabase() {
	a.countryMu.Lock()
	defer a.countryMu.Unlock()
	if a.countryLoaded {
		return
	}
	a.countryLoaded = true
	db, err := a.loadCountryDatabase(context.Background())
	a.countryDB = db
	if err != nil {
		a.countryError = "The saved database could not be verified. Download it again."
		if !a.Storage.Configured() {
			a.countryError = "Configure S3 storage before installing country lookup."
		}
	}
}

func (a *App) loadCountryDatabase(ctx context.Context) (*countryDatabase, error) {
	var version, digest, key string
	err := a.DB.SQL.QueryRowContext(ctx, "SELECT version,file_sha256,object_key FROM analytics_country_database WHERE id=1").Scan(&version, &digest, &key)
	if err == nil {
		if !a.Storage.Configured() {
			return nil, errors.New("country database object storage is unavailable")
		}
		data, readErr := a.Storage.Get(ctx, key)
		if readErr != nil {
			return nil, readErr
		}
		if len(data) > maxCountryBytes {
			return nil, errors.New("invalid saved country database size")
		}
		db, verifyErr := verifiedCountryDatabase(data, digest)
		if verifyErr == nil {
			db.version = version
		}
		return db, verifyErr
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return a.migrateCountryDatabaseFile(ctx, countryFileSHA256)
}

func (a *App) migrateCountryDatabaseFile(ctx context.Context, digest string) (*countryDatabase, error) {
	path := a.countryFilePath()
	data, err := readInstalledCountryDatabase(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	db, err := verifiedCountryDatabase(data, digest)
	if err != nil {
		return nil, err
	}
	if err = a.saveCountryDatabase(ctx, data, countryDatabaseVersion, digest); err != nil {
		_ = db.reader.Close()
		return nil, err
	}
	db.version = countryDatabaseVersion
	_ = os.Remove(path)
	return db, nil
}

func (a *App) saveCountryDatabase(ctx context.Context, data []byte, version, digest string) error {
	if err := a.Storage.Put(ctx, countryObjectKey, data); err != nil {
		return err
	}
	_, err := a.DB.Query(ctx, `INSERT INTO analytics_country_database(id,version,file_sha256,object_key) VALUES(1,$1,$2,$3)
	 ON CONFLICT(id) DO UPDATE SET version=excluded.version,file_sha256=excluded.file_sha256,object_key=excluded.object_key
	 RETURNING id`, version, digest, countryObjectKey)
	return err
}

func (a *App) countryDatabaseStatus() Row {
	a.ensureCountryDatabase()
	a.countryMu.RLock()
	defer a.countryMu.RUnlock()
	version := countryDatabaseVersion
	if a.countryDB != nil {
		version = a.countryDB.version
	}
	return Row{"installed": a.countryDB != nil, "version": version, "storageConfigured": a.Storage.Configured(),
		"sourceUrl": "https://db-ip.com/db/download/ip-to-country-lite", "error": a.countryError}
}

func (a *App) localCountry(ip netip.Addr) (string, bool) {
	a.ensureCountryDatabase()
	a.countryMu.RLock()
	defer a.countryMu.RUnlock()
	if a.countryDB == nil {
		return "", false
	}
	if !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return "Unknown", true
	}
	var record struct {
		Country struct {
			Code string `maxminddb:"iso_code"`
		} `maxminddb:"country"`
	}
	if err := a.countryDB.reader.Lookup(ip).Decode(&record); err == nil {
		return normalizedCountry(record.Country.Code), true
	}
	return "Unknown", true
}

func (a *App) downloadCountryData(ctx context.Context, spec countryDownloadSpec) ([]byte, *countryDatabase, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, spec.url, nil)
	if err != nil {
		return nil, nil, err
	}
	client := http.Client{Transport: a.Client.Transport, Timeout: 30 * time.Second, CheckRedirect: countryDownloadRedirect}
	response, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("country database download returned %d", response.StatusCode)
	}
	archive, err := io.ReadAll(io.LimitReader(response.Body, maxCountryBytes+1))
	if err != nil {
		return nil, nil, err
	}
	return decodeCountryArchive(archive, spec)
}

func countryDownloadRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 3 || req.URL.Scheme != "https" || req.URL.Host != "download.db-ip.com" {
		return errors.New("unexpected country database redirect")
	}
	return nil
}

func decodeCountryArchive(archive []byte, spec countryDownloadSpec) ([]byte, *countryDatabase, error) {
	if len(archive) > maxCountryBytes || countryDigest(archive) != spec.archiveSHA256 {
		return nil, nil, errors.New("country database archive could not be verified")
	}
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, nil, err
	}
	data, err := io.ReadAll(io.LimitReader(gz, maxCountryBytes+1))
	closeErr := gz.Close()
	if err != nil || closeErr != nil || len(data) > maxCountryBytes {
		return nil, nil, errors.New("country database contents could not be verified")
	}
	db, err := verifiedCountryDatabase(data, spec.fileSHA256)
	return data, db, err
}

func (a *App) installCountryDatabase(ctx context.Context) error {
	return a.installCountryDatabaseFrom(ctx, currentCountryDownload)
}

func (a *App) installCountryDatabaseFrom(ctx context.Context, spec countryDownloadSpec) error {
	a.countryDownloadMu.Lock()
	defer a.countryDownloadMu.Unlock()
	a.ensureCountryDatabase()
	a.countryMu.RLock()
	installed := a.countryDB != nil
	a.countryMu.RUnlock()
	if installed {
		return nil
	}
	data, db, err := a.downloadCountryData(ctx, spec)
	if err != nil {
		return err
	}
	if err = a.saveCountryDatabase(ctx, data, countryDatabaseVersion, spec.fileSHA256); err != nil {
		_ = db.reader.Close()
		return err
	}
	db.version = countryDatabaseVersion
	a.countryMu.Lock()
	previous := a.countryDB
	a.countryDB, a.countryError, a.countryLoaded = db, "", true
	a.countryMu.Unlock()
	if previous != nil {
		_ = previous.reader.Close()
	}
	return nil
}

func (a *App) countryDatabaseRoutes() {
	a.mux.HandleFunc("GET /api/settings/country-database", func(w http.ResponseWriter, r *http.Request) {
		send(w, 200, a.countryDatabaseStatus())
	})
	a.mux.HandleFunc("POST /api/settings/country-database", a.downloadCountryDatabase)
}

func (a *App) downloadCountryDatabase(w http.ResponseWriter, r *http.Request) {
	input := body(w, r)
	strict(input, "confirm")
	if !booleanField(input, "confirm") {
		fail(400, "Confirm the DB-IP download before continuing.")
	}
	if !a.Storage.Configured() {
		fail(503, "Configure S3 storage before installing country lookup.")
	}
	a.limit(r, "country-database-download", 3, time.Hour, true)
	if err := a.installCountryDatabase(r.Context()); err != nil {
		coded(502, "The DB-IP download could not be verified or saved. Try again later.", "COUNTRY_DATABASE_DOWNLOAD")
	}
	send(w, 200, a.countryDatabaseStatus())
}
