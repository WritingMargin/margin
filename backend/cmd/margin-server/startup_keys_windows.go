package main

import (
	"golang.org/x/sys/windows"
	"os"
)

// Windows mode bits do not express file privacy. Restrict access to the current
// account and SYSTEM before writing a secret, disabling inherited grants.
func secureGeneratedFile(path string) error {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return err
	}
	sd, err := windows.SecurityDescriptorFromString("D:P(A;;FA;;;SY)(A;;FA;;;" + user.User.Sid.String() + ")")
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
}

func checkKeyFilePermissions(path string, _ os.FileInfo) error {
	return secureGeneratedFile(path)
}

// Windows does not support fsync on a directory handle. File contents were
// flushed before the complete file was installed via Link/Rename.
func syncKeyDirectory(string) error { return nil }
