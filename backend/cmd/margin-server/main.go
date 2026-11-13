package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"github.com/joho/godotenv"
	"io/fs"
	cli "margin-cli"
	"margin/backend/assets"
	"margin/backend/internal/blog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"
)

var version = "dev"

const serveHelp = `margin serve [--host 127.0.0.1] [--port 3001] [--data-dir <directory>] [--env-file <file>] [--web-dir <directory>]

Starts the Go blog API with embedded SQLite metadata in .data/margin.db.
DATABASE_URL selects PostgreSQL.
Set S3_BUCKET for content storage. Missing CONTENT_ENCRYPTION_KEY and SETUP_TOKEN
are generated and saved beside the metadata database (also with PostgreSQL).
Environment values override saved keys. CONTENT_ENCRYPTION_KEY_PREVIOUS enables
reads with the previous key during online migration; new writes use the primary
key. Run margin reencrypt and verify before retiring the previous key.
`

func main() {
	if err := run(os.Args[1:]); err != nil {
		var failure cliExit
		if errors.As(err, &failure) {
			os.Exit(int(failure))
		}
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}
func run(args []string) error {
	if len(args) == 0 {
		return serve(nil)
	}
	switch args[0] {
	case "--version", "-v", "version":
		return authorCLI(append([]string{"--version"}, args[1:]...))
	case "serve":
		return serve(args[1:])
	case "keygen":
		return keygen(args[1:])
	case "reencrypt":
		return reencrypt(args[1:])
	case "healthcheck":
		return healthcheck()
	case "init-bucket":
		return initBucket()
	default:
		return authorCLI(args)
	}
}
func keygen(args []string) error {
	if len(args) != 0 {
		return errors.New("usage: margin keygen")
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	fmt.Println(hex.EncodeToString(key))
	return nil
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func loadEnv(filename string) error {
	if filename != "" {
		return godotenv.Load(filename)
	}
	err := godotenv.Load()
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

type serveOptions struct {
	host, port, dataDir, envFile, webDir string
	help                                 bool
}

func parseServe(args []string) (serveOptions, error) {
	var opts serveOptions
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.StringVar(&opts.host, "host", "", "bind address")
	flags.StringVar(&opts.port, "port", "", "port")
	flags.StringVar(&opts.dataDir, "data-dir", "", "metadata directory")
	flags.StringVar(&opts.envFile, "env-file", "", "environment file")
	flags.StringVar(&opts.webDir, "web-dir", "", "compiled frontend directory; omit to use embedded assets")
	flags.BoolVar(&opts.help, "help", false, "help")
	flags.BoolVar(&opts.help, "h", false, "help")
	err := flags.Parse(args)
	if err == nil && flags.NArg() != 0 {
		err = errors.New("unexpected serve argument")
	}
	return opts, err
}
func configureServe(opts serveOptions) error {
	if err := loadEnv(opts.envFile); err != nil {
		return err
	}
	switch env("MARGIN_ENV", "production") {
	case "production", "development", "test":
	default:
		return errors.New("MARGIN_ENV must be production, development, or test")
	}
	if err := applyServeEnvironment(opts); err != nil {
		return err
	}
	port, err := strconv.Atoi(env("PORT", "3001"))
	if err != nil || port < 0 || port > 65535 {
		return errors.New("Port must be an integer between 0 and 65535.")
	}
	return blog.ValidateCookieDomain()
}

func applyServeEnvironment(opts serveOptions) error {
	values := map[string]string{"HOST": opts.host, "PORT": opts.port}
	if opts.dataDir != "" {
		values["SQLITE_PATH"] = filepath.Join(opts.dataDir, "margin.db")
	}
	for key, value := range values {
		if value != "" {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return nil
}

func serve(args []string) error {
	opts, err := parseServe(args)
	if err != nil {
		return err
	}
	if opts.help {
		fmt.Print(serveHelp)
		return nil
	}
	if err = configureServe(opts); err != nil {
		return err
	}
	if err = configureStartupKeys(filepath.Dir(env("SQLITE_PATH", ".data/margin.db")), os.Stderr); err != nil {
		return err
	}
	db, err := blog.OpenDatabase(os.Getenv("DATABASE_URL"), env("SQLITE_PATH", ".data/margin.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	storage, err := blog.NewStorage(context.Background())
	if err != nil {
		return err
	}
	web, err := webFiles(opts.webDir)
	if err != nil {
		return err
	}
	app := blog.NewApp(db, storage, nil, web)
	if err := app.MigrateContentIndexes(context.Background()); err != nil {
		return fmt.Errorf("migrate content indexes: %w", err)
	}
	app.Version = version
	workerCtx, cancelWorker := context.WithCancel(context.Background())
	var workers sync.WaitGroup
	workers.Add(3)
	go func() { defer workers.Done(); app.RunSearchNotifications(workerCtx) }()
	go func() { defer workers.Done(); app.RunNewsletterCampaigns(workerCtx) }()
	go func() { defer workers.Done(); app.RunWritingSessionCleanup(workerCtx) }()
	defer func() { cancelWorker(); workers.Wait() }()
	return listen(app)
}
func webFiles(directory string) (fs.FS, error) {
	if directory == "" {
		return fs.Sub(assets.Files, "web")
	}
	info, err := os.Stat(filepath.Join(directory, "index.html"))
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, errors.New("web-dir must contain a compiled index.html file")
	}
	return os.DirFS(directory), nil
}
func listen(handler http.Handler) error {
	address := net.JoinHostPort(env("HOST", "127.0.0.1"), env("PORT", "3001"))
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 300 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan struct{})
	go shutdown(ctx, server, done)
	fmt.Printf("Margin listening on http://%s\n", listener.Addr())
	err = server.Serve(listener)
	stop()
	<-done
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
func shutdown(ctx context.Context, server *http.Server, done chan struct{}) {
	defer close(done)
	<-ctx.Done()
	deadline, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if server.Shutdown(deadline) != nil {
		_ = server.Close()
	}
}
func healthcheck() error {
	client := http.Client{Timeout: 4 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + env("PORT", "3001") + blog.BasePath() + "/api/health")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return errors.New("health check failed")
	}
	return nil
}
func initBucket() error {
	if err := loadEnv(""); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	storage, err := blog.NewStorage(ctx)
	if err != nil {
		return err
	}
	return retryBucket(ctx, storage)
}
func retryBucket(ctx context.Context, storage *blog.S3Storage) error {
	var err error
	for range 30 {
		if err = storage.CreateBucket(ctx); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return err
}

type cliExit int

func (e cliExit) Error() string { return fmt.Sprintf("CLI exited with status %d", e) }

func authorCLI(args []string) error {
	if code := cli.Execute(args, version, os.Stdin, os.Stdout, os.Stderr); code != 0 {
		return cliExit(code)
	}
	if len(args) == 1 && args[0] == "help" {
		fmt.Print("\nBundled commands: serve, keygen, reencrypt, init-bucket, healthcheck, --version\n")
	}
	return nil
}
