package blog

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func assertDatabaseReusable(t *testing.T, db *Database) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := db.Query(ctx, "SELECT 1"); err != nil {
		t.Fatalf("database connection was not released: %v", err)
	}
	if stats := db.SQL.Stats(); stats.InUse != 0 {
		t.Fatalf("database connection remained in use: %+v", stats)
	}
}

func TestPostgreSQLQueryErrorsReleaseConnection(t *testing.T) {
	t.Setenv("MARGIN_DB_MAX_OPEN_CONNS", "1")
	db, _ := postgresTestDatabase(t)
	for _, query := range []string{
		"SELECT missing_column FROM settings",
		"SELECT 1 / (n-2) FROM generate_series(1,3) AS n",
	} {
		if _, err := db.Query(context.Background(), query); err == nil {
			t.Fatalf("expected SQL error from %s", query)
		}
		assertDatabaseReusable(t, db)
	}
}

func TestPostgreSQLActiveQueryCancellationReleasesConnection(t *testing.T) {
	t.Setenv("MARGIN_DB_MAX_OPEN_CONNS", "1")
	db, dsn := postgresTestDatabase(t)
	observer, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer observer.Close()
	observer.SetMaxOpenConns(1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	query := "SELECT pg_sleep(30) /* " + uuid() + " */"
	go func() {
		_, err := db.Query(ctx, query)
		result <- err
	}()
	waitForActivePostgresQuery(t, observer, query)
	cancel()
	select {
	case err := <-result:
		if err == nil {
			t.Fatal("cancelled query returned success")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("active query did not stop on cancellation")
	}
	assertDatabaseReusable(t, db)
}

func waitForActivePostgresQuery(t *testing.T, observer *sql.DB, query string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for {
		var active bool
		err := observer.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query=$1 AND state='active')", query).Scan(&active)
		if err != nil {
			t.Fatal(err)
		}
		if active {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("query never became active")
		case <-time.After(5 * time.Millisecond):
		}
	}
}
