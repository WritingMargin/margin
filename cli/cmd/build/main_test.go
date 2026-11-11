package main

import "testing"

func TestReleaseArtifactNameRejectsPathsAndBuildFlags(t *testing.T) {
	for _, input := range [][3]string{
		{"../../outside", "linux", "amd64"},
		{"1.2.3 -extldflags=-bad", "linux", "amd64"},
		{"1.2.3", "../../outside", "amd64"},
		{"1.2.3", "linux", `..\outside`},
		{"1.2.3", "linux", "amd64\n"},
		{"", "linux", "amd64"},
	} {
		if name, err := releaseArtifactName(input[0], input[1], input[2]); err == nil {
			t.Errorf("unsafe release inputs %q produced %q", input, name)
		}
	}
	for _, tc := range []struct{ version, os, arch, want string }{
		{"1.2.3", "linux", "amd64", "margin-cli-1.2.3-linux-amd64"},
		{"1.2.3-rc.1", "darwin", "arm64", "margin-cli-1.2.3-rc.1-darwin-arm64"},
		{"1.2.3-rc.1+build.2", "linux", "arm64", "margin-cli-1.2.3-rc.1+build.2-linux-arm64"},
		{"1.2.3+build.1", "windows", "amd64", "margin-cli-1.2.3+build.1-windows-amd64.exe"},
	} {
		name, err := releaseArtifactName(tc.version, tc.os, tc.arch)
		if err != nil || name != tc.want {
			t.Errorf("releaseArtifactName: got %q, %v; want %q", name, err, tc.want)
		}
	}
}
