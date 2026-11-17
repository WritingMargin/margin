package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"margin/backend/internal/blog"
	"margin/backend/internal/contentcrypto"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
)

const reencryptHelp = `margin reencrypt [--data-dir <directory>] [--env-file <file>] [--verify-only]

Set CONTENT_ENCRYPTION_KEY to the new write key and
CONTENT_ENCRYPTION_KEY_PREVIOUS to the old read-only fallback.
Before migrating, configure EVERY server instance with both keys and the new
write key. See docs/storage-encryption.md for a rolling deployment procedure.
Re-encrypts referenced articles, revisions, drafts, assets, and saved credentials
while dual-key servers continue serving reads and writes. Back up first.
If interrupted or a concurrent edit conflicts, keep both keys and rerun.
--verify-only checks current referenced data using only CONTENT_ENCRYPTION_KEY;
no previous key is required. Verify before removing the fallback from servers.
External backups and noncurrent S3 object versions still require the old key.
`

type reencryptOptions struct {
	dataDir, envFile string
	help, verify     bool
}

func parseReencrypt(args []string) (reencryptOptions, error) {
	var opts reencryptOptions
	flags := flag.NewFlagSet("reencrypt", flag.ContinueOnError)
	flags.StringVar(&opts.dataDir, "data-dir", "", "metadata directory")
	flags.StringVar(&opts.envFile, "env-file", "", "environment file")
	flags.BoolVar(&opts.verify, "verify-only", false, "verify current data using only the primary key")
	flags.BoolVar(&opts.help, "help", false, "help")
	flags.BoolVar(&opts.help, "h", false, "help")
	err := flags.Parse(args)
	if err == nil && flags.NArg() != 0 {
		err = errors.New("unexpected reencrypt argument; keys must be supplied through environment variables")
	}
	return opts, err
}

func reencrypt(args []string) error {
	opts, err := parseReencrypt(args)
	if err != nil {
		return err
	}
	if opts.help {
		fmt.Print(reencryptHelp)
		return nil
	}
	if err := configureReencrypt(opts); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := blog.OpenDatabase(os.Getenv("DATABASE_URL"), env("SQLITE_PATH", ".data/margin.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	storage, err := blog.NewStorage(ctx)
	if err != nil {
		return err
	}
	return runReencryption(ctx, db, storage, opts.verify)
}

func runReencryption(ctx context.Context, db *blog.Database, storage *blog.S3Storage, verify bool) error {
	if verify {
		if err := blog.VerifyReencryption(ctx, db, storage); err != nil {
			return fmt.Errorf("verification failed; keep the fallback key configured: %w", err)
		}
		fmt.Println("Verified current referenced content and saved credentials using only CONTENT_ENCRYPTION_KEY. Retire the fallback only after every server writes with this key.")
		return nil
	}
	fmt.Fprintln(os.Stderr, "Every Margin instance must already read both keys and write CONTENT_ENCRYPTION_KEY. Keep the fallback key configured until migration and verification succeed.")
	result, err := blog.Reencrypt(ctx, db, storage, os.Getenv("CONTENT_ENCRYPTION_KEY_PREVIOUS"))
	if err != nil {
		return fmt.Errorf("re-encryption incomplete; keep both keys configured for reads and rerun: %w", err)
	}
	fmt.Printf("Re-encrypted %d objects and %d settings; %d values already used the target key. Current referenced data verified with the primary key. Run --verify-only before retiring the fallback on all instances.\n", result.Objects, result.Settings, result.AlreadyCurrent)
	return nil
}

func configureReencrypt(opts reencryptOptions) error {
	if err := loadEnv(opts.envFile); err != nil {
		return err
	}
	names := []string{"CONTENT_ENCRYPTION_KEY"}
	if !opts.verify || os.Getenv("CONTENT_ENCRYPTION_KEY_PREVIOUS") != "" {
		names = append(names, "CONTENT_ENCRYPTION_KEY_PREVIOUS")
	}
	for _, name := range names {
		if _, err := contentcrypto.New(os.Getenv(name)); err != nil {
			return fmt.Errorf("%s must be set to 64 hexadecimal characters", name)
		}
	}
	if opts.dataDir != "" {
		return os.Setenv("SQLITE_PATH", filepath.Join(opts.dataDir, "margin.db"))
	}
	return nil
}
