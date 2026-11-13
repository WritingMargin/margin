package blog

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/lib/pq"
)

func TestPostgreSQLStreamsShareOneConnection(t *testing.T) {
	db, dsn := postgresTestDatabase(t)
	other, err := OpenDatabase(dsn, "")
	if err != nil {
		t.Fatal(err)
	}
	defer other.SQL.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var streams []<-chan struct{}
	for range 48 {
		changed, release, err := db.subscribePost(ctx, "article-a")
		if err != nil {
			t.Fatal(err)
		}
		defer release()
		streams = append(streams, changed)
	}
	unrelated, release, err := db.subscribePost(ctx, "article-b")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	channel := first(db.Must(ctx, "SELECT 'margin_posts_' || md5(current_schema()) AS channel")).str("channel")
	row := first(db.Must(ctx, "SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND query=$1", "LISTEN "+pq.QuoteIdentifier(channel)))
	if fmt.Sprint(row["count"]) != "1" {
		t.Fatalf("expected one listener for 49 streams: %v", row)
	}
	notifyTestPost(t, other, "article-a", false)
	assertNoPostNotification(t, streams[0])
	notifyTestPost(t, other, "article-a", true)
	for _, stream := range streams {
		awaitPostNotification(t, stream)
	}
	assertNoPostNotification(t, unrelated)
}

func notifyTestPost(t *testing.T, db *Database, id string, commit bool) {
	t.Helper()
	tx, err := db.SQL.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	db.notifyPostTransaction(context.Background(), tx, id)
	if commit {
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
}

func awaitPostNotification(t *testing.T, changed <-chan struct{}) {
	t.Helper()
	select {
	case <-changed:
	case <-time.After(3 * time.Second):
		t.Fatal("committed change was not delivered")
	}
}

func assertNoPostNotification(t *testing.T, changed <-chan struct{}) {
	t.Helper()
	select {
	case <-changed:
		t.Fatal("received an unrelated or uncommitted change")
	case <-time.After(30 * time.Millisecond):
	}
}

func TestPostgreSQLStreamCancellationAndReopen(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	ctx, cancel := context.WithCancel(context.Background())
	_, release, err := db.subscribePost(ctx, "article")
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	release()
	release() // Cleanup may race request cancellation; it must be idempotent.
	db.postListener.mu.Lock()
	closed := db.postListener.listener == nil && db.postListener.users == 0
	db.postListener.mu.Unlock()
	if !closed {
		t.Fatal("last subscriber did not release its connection")
	}
	changed, release, err := db.subscribePost(context.Background(), "article")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	notifyTestPost(t, db, "article", true)
	awaitPostNotification(t, changed)
}

func TestPostgreSQLStreamPublicationIsolation(t *testing.T) {
	first, _ := postgresTestDatabase(t)
	second, _ := postgresTestDatabase(t)
	changed, release, err := first.subscribePost(context.Background(), "same-article-id")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	notifyTestPost(t, second, "same-article-id", true)
	assertNoPostNotification(t, changed)
	notifyTestPost(t, first, "same-article-id", true)
	awaitPostNotification(t, changed)
}

func TestPostgreSQLStreamReconnectAndIndependentCancellation(t *testing.T) {
	db, _ := postgresTestDatabase(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, release, err := db.subscribePost(ctx, "article-a")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	changed, closeOther, err := db.subscribePost(context.Background(), "article-b")
	if err != nil {
		t.Fatal(err)
	}
	defer closeOther()
	cancel()
	release()
	notifyTestPost(t, db, "article-b", true)
	awaitPostNotification(t, changed)
	channel := first(db.Must(context.Background(), "SELECT 'margin_posts_' || md5(current_schema()) AS channel")).str("channel")
	rows := db.Must(context.Background(), "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND query=$1", "LISTEN "+pq.QuoteIdentifier(channel))
	if len(rows) != 1 {
		t.Fatalf("expected to interrupt exactly the test listener: %v", rows)
	}
	// Reconnection wakes subscribers to catch up with any missed commits.
	awaitPostNotification(t, changed)
	notifyTestPost(t, db, "article-b", true)
	awaitPostNotification(t, changed)
}
