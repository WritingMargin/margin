package blog

import (
	"context"
	"testing"
	"time"
)

func TestDeliveryCleanupDatabaseFailureDoesNotPanic(t *testing.T) {
	for _, kind := range []string{"campaign", "author", "reader"} {
		t.Run(kind, func(t *testing.T) {
			db := databaseFixture(t, ":memory:")
			_ = db.SQL.Close()
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			if failure := invokeDeliveryCleanup(&App{DB: db}, ctx, kind); failure != nil {
				t.Fatalf("cleanup failure escaped recovery: %v", failure)
			}
		})
	}
}

func TestDeliveryCleanupSaturatedPoolHasDeadline(t *testing.T) {
	db := databaseFixture(t, ":memory:")
	conn, err := db.SQL.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan any, 1)
	go func() { done <- invokeDeliveryCleanup(&App{DB: db}, ctx, "campaign") }()
	select {
	case failure := <-done:
		if failure != nil {
			t.Fatalf("cleanup deadline escaped recovery: %v", failure)
		}
	case <-time.After(7 * time.Second):
		_ = conn.Close()
		<-done
		t.Fatal("cancelled delivery waited indefinitely for its cleanup connection")
	}
	_ = conn.Close()
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := db.Query(ctx, "SELECT 1"); err != nil {
		t.Fatalf("pool unusable after cleanup timeout: %v", err)
	}
}

func invokeDeliveryCleanup(a *App, ctx context.Context, kind string) (failure any) {
	defer func() { failure = recover() }()
	switch kind {
	case "author":
		a.sendAuthorUpdateDelivery(ctx, Row{}, Row{})
	case "reader":
		a.sendReaderAlertDelivery(ctx, Row{}, Row{})
	default:
		a.sendCampaignDelivery(ctx, Row{})
	}
	return nil
}
