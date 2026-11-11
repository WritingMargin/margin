//go:build !windows

package main

import (
	"fmt"
	"os"
)

func secureGeneratedFile(path string) error { return os.Chmod(path, 0600) }

func checkKeyFilePermissions(path string, info os.FileInfo) error {
	if info.Mode().Perm()&0077 != 0 {
		return fmt.Errorf("key file %s must be private (chmod 600)", path)
	}
	return nil
}

func syncKeyDirectory(path string) error {
	directory, err := os.Open(path) // #nosec G304 -- Startup-only fsync of the operator-selected key directory; no request-supplied path.
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
