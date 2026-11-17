package blog

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net"
	"testing"
	"time"
)

// Accept PostgreSQL's socket but never finish its startup handshake.
func stalledPostgres(t *testing.T) (string, <-chan struct{}, <-chan struct{}) {
	t.Helper()
	server, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Close() })
	accepted, disconnected := make(chan struct{}), make(chan struct{})
	go func() {
		conn, err := server.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		close(accepted)
		_, _ = io.Copy(io.Discard, conn)
		close(disconnected)
	}()
	return "postgres://test@" + server.Addr().String() + "/test?sslmode=disable", accepted, disconnected
}

func awaitListenerCleanup(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("listener operation did not stop promptly")
	}
}

func TestPostListenerCancellationClosesStartupSocket(t *testing.T) {
	dsn, accepted, disconnected := stalledPostgres(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() {
		listener, err := openPostListener(ctx, dsn, "test")
		if listener != nil {
			_ = listener.Close()
		}
		result <- err
	}()
	awaitListenerCleanup(t, accepted)
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("unexpected cancellation error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("startup did not honor cancellation")
	}
	awaitListenerCleanup(t, disconnected)
}

func TestPostListenerWaitingSubscriberCanCancel(t *testing.T) {
	dsn, accepted, disconnected := stalledPostgres(t)
	db := &Database{dsn: dsn}
	defer db.postListener.close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first := make(chan struct{})
	go func() {
		defer close(first)
		_, release, _ := db.postListener.subscribe(ctx, db, "test", "one")
		if release != nil {
			release()
		}
	}()
	awaitListenerCleanup(t, accepted)
	waiting, stop := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer stop()
	errResult := make(chan error, 1)
	go func() {
		_, release, err := db.postListener.subscribe(waiting, db, "test", "two")
		if release != nil {
			release()
		}
		errResult <- err
	}()
	select {
	case err := <-errResult:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled subscriber waited for another request's startup")
	}
	cancel()
	awaitListenerCleanup(t, first)
	awaitListenerCleanup(t, disconnected)
}

func TestDatabaseCloseInterruptsListenerStartup(t *testing.T) {
	dsn, accepted, disconnected := stalledPostgres(t)
	db := fixtureDatabase(t)
	db.dsn = dsn
	defer db.Close()
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, release, _ := db.postListener.subscribe(context.Background(), db, "test", "one")
		if release != nil {
			release()
		}
	}()
	awaitListenerCleanup(t, accepted)
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	awaitListenerCleanup(t, done)
	awaitListenerCleanup(t, disconnected)
	_, _, err := db.postListener.subscribe(context.Background(), db, "test", "two")
	if !errors.Is(err, sql.ErrConnDone) {
		t.Fatalf("closed database accepted a new listener: %v", err)
	}
}

func TestPostgreSQLDatabaseCloseReleasesListener(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	_, release, err := db.subscribePost(context.Background(), "article")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	listener := db.postListener.listener
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		for range listener.Notify {
		}
		close(done)
	}()
	awaitListenerCleanup(t, done)
	if stats := db.SQL.Stats(); stats.OpenConnections != 0 {
		t.Fatalf("database close retained connections: %+v", stats)
	}
	release()
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestPostgreSQLCancelledStreamReleasesListener(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, release, err := db.subscribePost(ctx, "article")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	listener := db.postListener.listener
	cancel()
	done := make(chan struct{})
	go func() {
		for range listener.Notify {
		}
		close(done)
	}()
	awaitListenerCleanup(t, done)
	db.postListener.mu.Lock()
	closed := db.postListener.users == 0 && db.postListener.listener == nil
	db.postListener.mu.Unlock()
	if !closed {
		t.Fatal("cancelled request retained its subscription")
	}
	assertDatabaseReusable(t, db)
}
