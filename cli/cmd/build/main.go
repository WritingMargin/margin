// Command build creates the native CLI release and its checksum and license notice.
package main

import (
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
)

//go:embed go.LICENSE.txt
var goLicense string

func main() {
	if err := build(); err != nil {
		fmt.Fprintln(os.Stderr, "Build failed:", err)
		os.Exit(1)
	}
}

func build() error {
	targetOS := flag.String("os", runtime.GOOS, "target operating system")
	targetArch := flag.String("arch", runtime.GOARCH, "target architecture")
	flag.Parse()
	if flag.NArg() != 0 {
		return fmt.Errorf("usage: go -C cli run ./cmd/build [-os linux] [-arch amd64]")
	}
	metadata, err := os.ReadFile("../package.json")
	if err != nil {
		return err
	}
	var release struct {
		Version string `json:"version"`
	}
	if err = json.Unmarshal(metadata, &release); err != nil {
		return err
	}
	name, err := releaseArtifactName(release.Version, *targetOS, *targetArch)
	if err != nil {
		return err
	}
	extension := ""
	if *targetOS == "windows" {
		extension = ".exe"
	}
	binary := filepath.Join("dist", "margin"+extension)
	if err = os.MkdirAll("dist", 0750); err != nil {
		return err
	}
	cmd := exec.Command("go", "build", "-trimpath", "-ldflags", "-s -w -X main.version="+release.Version, "-o", binary, "./cmd/margin") // #nosec G204 -- Fixed executable and arguments; releaseArtifactName rejects flag separators, whitespace and path separators in metadata.
	cmd.Env = append(os.Environ(), "GOOS="+*targetOS, "GOARCH="+*targetArch, "CGO_ENABLED=0")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err = cmd.Run(); err != nil {
		return err
	}
	data, err := os.ReadFile(binary) // #nosec G304 -- The path is exactly dist/margin or dist/margin.exe, selected above.
	if err != nil {
		return err
	}
	return writeReleaseArtifacts(name, data)
}

func writeReleaseArtifacts(name string, data []byte) error {
	if err := os.MkdirAll("../artifacts", 0750); err != nil {
		return err
	}
	artifacts, err := os.OpenRoot("../artifacts")
	if err != nil {
		return err
	}
	defer artifacts.Close()
	if err = artifacts.WriteFile(name, data, 0755); err != nil { // #nosec G306 -- Public release executable must be readable and executable by its recipients; os.Root confines writes.
		return err
	}
	checksum := fmt.Sprintf("%x  %s\n", sha256.Sum256(data), name)
	if err = artifacts.WriteFile(name+".sha256", []byte(checksum), 0644); err != nil { // #nosec G306 -- Public checksum accompanies the release; contains no credentials.
		return err
	}
	if err = artifacts.WriteFile(name+".LICENSES.txt", []byte("Margin CLI — Go standard library license\n\n"+goLicense), 0644); err != nil { // #nosec G306 -- Public license notice accompanies the release; contains no credentials.
		return err
	}
	fmt.Printf("Built %s\nAgent skills are embedded. No Node.js or Go runtime is required.\n", filepath.Join("..", "artifacts", name))
	return nil
}

var releaseVersionRE = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$`)
var releaseTargetRE = regexp.MustCompile(`^[a-z][a-z0-9]*$`)

func releaseArtifactName(version, targetOS, targetArch string) (string, error) {
	if !releaseVersionRE.MatchString(version) || !releaseTargetRE.MatchString(targetOS) || !releaseTargetRE.MatchString(targetArch) {
		return "", fmt.Errorf("release version must be semver and target OS/architecture must be alphanumeric identifiers")
	}
	extension := ""
	if targetOS == "windows" {
		extension = ".exe"
	}
	return fmt.Sprintf("margin-cli-%s-%s-%s%s", version, targetOS, targetArch, extension), nil
}
