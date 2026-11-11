package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTestFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}
func isolatedPaths(t *testing.T) {
	t.Helper()
	directory := t.TempDir()
	sqlite := filepath.Join(directory, "margin.db")
	t.Setenv("MARGIN_COOKIE_DOMAIN", "")
	t.Setenv("PUBLIC_URL", "")
	t.Setenv("PORT", "")
	t.Setenv("HOST", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("SQLITE_PATH", sqlite)
}
func TestServeRejectsInvalidPorts(t *testing.T) {
	isolatedPaths(t)
	envFile := filepath.Join(t.TempDir(), "empty.env")
	writeTestFile(t, envFile, nil)
	for _, port := range []string{"-1", "65536", "abc", "1.5", "3001oops"} {
		t.Run(port, func(t *testing.T) {
			if configureServe(serveOptions{port: port, envFile: envFile}) == nil {
				t.Fatal("invalid port accepted")
			}
		})
	}
}
func TestServeAcceptsPortBoundsAndSetsDataDirectory(t *testing.T) {
	isolatedPaths(t)
	envFile := filepath.Join(t.TempDir(), "empty.env")
	writeTestFile(t, envFile, nil)
	directory := t.TempDir()
	for _, port := range []string{"0", "3001", "65535"} {
		if err := configureServe(serveOptions{port: port, dataDir: directory, envFile: envFile}); err != nil {
			t.Fatal(err)
		}
	}
	if os.Getenv("SQLITE_PATH") != filepath.Join(directory, "margin.db") {
		t.Fatal("data directory was not applied")
	}
}

func TestServeRejectsUnknownEnvironment(t *testing.T) {
	isolatedPaths(t)
	envFile := filepath.Join(t.TempDir(), "empty.env")
	writeTestFile(t, envFile, nil)
	t.Setenv("MARGIN_ENV", "prodution")
	if configureServe(serveOptions{envFile: envFile}) == nil {
		t.Fatal("invalid environment accepted")
	}
}

func TestExplicitWebDirectory(t *testing.T) {
	directory := t.TempDir()
	if _, err := webFiles(directory); err == nil {
		t.Fatal("missing web assets accepted")
	}
	writeTestFile(t, filepath.Join(directory, "index.html"), []byte("compiled frontend"))
	web, err := webFiles(directory)
	if err != nil {
		t.Fatal(err)
	}
	file, err := web.Open("index.html")
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err := webFiles(""); err != nil {
		t.Fatal("embedded assets unavailable", err)
	}
}

func TestServeRejectsInvalidCookieDomain(t *testing.T) {
	isolatedPaths(t)
	envFile := filepath.Join(t.TempDir(), "empty.env")
	writeTestFile(t, envFile, nil)
	t.Setenv("PUBLIC_URL", "https://usefused.com/blog")
	t.Setenv("MARGIN_COOKIE_DOMAIN", "other.com")
	if configureServe(serveOptions{envFile: envFile}) == nil {
		t.Fatal("invalid cookie domain accepted")
	}
}
