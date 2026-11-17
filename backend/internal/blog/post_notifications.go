package blog

import (
	"context"
	"database/sql"
	"sync"
)

// The hub coalesces committed changes without blocking writers. PostgreSQL
// notifications are relayed here from one shared connection per engine process.
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
	_, err := tx.ExecContext(ctx, "SELECT pg_notify('margin_posts_' || md5(current_schema()), $1)", id)
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
	rows, err := d.Query(ctx, "SELECT 'margin_posts_' || md5(current_schema()) AS channel")
	if err != nil {
		return nil, nil, err
	}
	return d.postListener.subscribe(ctx, d, first(rows).str("channel"), id)
}

func (h *postChangeHub) notifyAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, subscribers := range h.subscribers {
		for changed := range subscribers {
			select {
			case changed <- struct{}{}:
			default:
			}
		}
	}
}
