package blog

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestPostgresPoolRejectsInvalidLimits(t *testing.T) {
	for _, value := range []string{"0", "-1", "many", "1.5"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("MARGIN_DB_MAX_OPEN_CONNS", value)
			_, err := OpenDatabase("postgres://unused:1/unused", "")
			if err == nil || err.Error() != "MARGIN_DB_MAX_OPEN_CONNS must be a positive integer" {
				t.Fatalf("invalid limit was not rejected before connecting: %v", err)
			}
		})
	}
}

func TestPostgreSQLPoolQueuesConcurrentQueries(t *testing.T) {
	t.Setenv("MARGIN_DB_MAX_OPEN_CONNS", "")
	db, _ := postgresTestDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := make(chan struct{})
	errors := make(chan error, 48)
	var workers sync.WaitGroup
	for range 48 {
		workers.Go(func() {
			<-start
			_, err := db.Query(ctx, "SELECT pg_sleep(0.05)")
			errors <- err
		})
	}
	close(start)
	workers.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	stats := db.SQL.Stats()
	if stats.MaxOpenConnections != 10 || stats.WaitCount == 0 || stats.InUse != 0 {
		t.Fatalf("queries did not queue and release the bounded pool: %+v", stats)
	}
}

func TestPostgreSQLPoolWaitHonorsCancellation(t *testing.T) {
	t.Setenv("MARGIN_DB_MAX_OPEN_CONNS", "1")
	db, _ := postgresTestDatabase(t)
	conn, err := db.SQL.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err = db.Query(ctx, "SELECT 1"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("waiting query did not respect its deadline: %v", err)
	}
	_ = conn.Close()
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err = db.Query(ctx, "SELECT 1"); err != nil {
		t.Fatalf("pool did not recover after cancellation: %v", err)
	}
}
