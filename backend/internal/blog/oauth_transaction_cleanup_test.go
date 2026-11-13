package blog

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestOAuthTransactionCleanup(t *testing.T) {
	db := databaseFixture(t, filepath.Join(t.TempDir(), "oauth-cleanup.db"))
	testOAuthTransactionCleanup(t, db)
}

func TestPostgreSQLOAuthTransactionCleanup(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	testOAuthTransactionCleanup(t, db)
}

func testOAuthTransactionCleanup(t *testing.T, db *Database) {
	db.SQL.SetMaxOpenConns(1)
	store := oauthStore{db: db}
	for _, outcome := range []string{"error", "panic", "cancel"} {
		t.Run(outcome, func(t *testing.T) {
			before := oauthLockRevision(t, db)
			err := failOAuthTransaction(store, outcome)
			if err == nil {
				t.Fatal("expected transaction failure")
			}
			if outcome == "cancel" && !errors.Is(err, context.Canceled) && !errors.Is(err, sql.ErrTxDone) {
				t.Fatalf("expected cancellation error: %v", err)
			}
			if after := oauthLockRevision(t, db); after != before {
				t.Fatalf("failed transaction committed changes: %d -> %d", before, after)
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			if _, err := store.mutate(ctx, func(oauthTx) error { return nil }); err != nil {
				t.Fatalf("connection was not reusable: %v", err)
			}
			if db.SQL.Stats().InUse != 0 {
				t.Fatal("transaction left a connection in use")
			}
		})
	}
}

func failOAuthTransaction(store oauthStore, outcome string) (err error) {
	defer func() {
		if failure := recover(); failure != nil {
			err = failure.(error)
		}
	}()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, err = store.mutate(ctx, func(tx oauthTx) error {
		if err := tx.exec("UPDATE oauth_lock SET revision=revision+10 WHERE id=1"); err != nil {
			return err
		}
		switch outcome {
		case "error":
			return errors.New("callback rejected mutation")
		case "panic":
			panic(errors.New("callback panicked"))
		default:
			cancel()
			return nil
		}
	})
	return err
}

func oauthLockRevision(t *testing.T, db *Database) int64 {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	var revision int64
	if err := db.SQL.QueryRowContext(ctx, "SELECT revision FROM oauth_lock WHERE id=1").Scan(&revision); err != nil {
		t.Fatalf("connection unavailable after transaction: %v", err)
	}
	return revision
}
