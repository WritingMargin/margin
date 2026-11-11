package blog

import (
	"context"
	"database/sql"
	"github.com/lib/pq"
	"sync"
	"time"
)

// SQLite runs in a single server process. The hub coalesces committed changes
// without blocking writers; subscribers read the latest metadata after waking.
type postChangeHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]bool
}

func (h *postChangeHub) subscribe(id string) (<-chan struct{}, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subscribers == nil {
		h.subscribers = map[string]map[chan struct{}]bool{}
	}
	if h.subscribers[id] == nil {
		h.subscribers[id] = map[chan struct{}]bool{}
	}
	changed := make(chan struct{}, 1)
	h.subscribers[id][changed] = true
	return changed, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subscribers[id], changed)
		if len(h.subscribers[id]) == 0 {
			delete(h.subscribers, id)
		}
	}
}
func (h *postChangeHub) notify(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for changed := range h.subscribers[id] {
		select {
		case changed <- struct{}{}:
		default:
		}
	}
}

// PostgreSQL delivers NOTIFY only after the surrounding transaction commits.
// The schema-specific channel keeps independent publications isolated.
func (d *Database) notifyPostTransaction(ctx context.Context, tx *sql.Tx, id string) {
	if d.Kind != "postgres" {
		return
	}
	_, err := tx.ExecContext(ctx, "SELECT pg_notify('margin_post_' || md5(current_schema() || ':' || $1), '')", id)
	must(err)
}
func (d *Database) postCommitted(id string) {
	if d.Kind == "sqlite" {
		d.postChanges.notify(id)
	}
}
func (d *Database) subscribePost(ctx context.Context, id string) (<-chan struct{}, func(), error) {
	if d.Kind == "sqlite" {
		changed, close := d.postChanges.subscribe(id)
		return changed, close, nil
	}
	rows, err := d.Query(ctx, "SELECT 'margin_post_' || md5(current_schema() || ':' || $1) AS channel", id)
	if err != nil {
		return nil, nil, err
	}
	listener := pq.NewListener(d.dsn, time.Second, 15*time.Second, nil)
	stopCancellation := context.AfterFunc(ctx, func() { _ = listener.Close() })
	if err = listener.Listen(first(rows).str("channel")); err != nil {
		stopCancellation()
		_ = listener.Close()
		return nil, nil, err
	}
	changed := make(chan struct{}, 1)
	done := make(chan struct{})
	go relayPostNotifications(listener, changed, done)
	var once sync.Once
	closeListener := func() { once.Do(func() { close(done); stopCancellation(); _ = listener.Close() }) }
	return changed, closeListener, nil
}
func relayPostNotifications(listener *pq.Listener, changed chan<- struct{}, done <-chan struct{}) {
	for {
		select {
		case <-done:
			return
		case _, ok := <-listener.Notify:
			if !ok {
				return
			}
			// A nil notification means the listener reconnected; catch up with the DB.
			select {
			case changed <- struct{}{}:
			default:
			}
		}
	}
}
