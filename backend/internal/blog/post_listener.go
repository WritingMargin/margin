package blog

import (
	"context"
	"sync"
	"time"

	"github.com/lib/pq"
)

type postgresPostListener struct {
	mu       sync.Mutex
	listener *pq.Listener
	users    int
}

func (p *postgresPostListener) subscribe(ctx context.Context, d *Database, channel, id string) (<-chan struct{}, func(), error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	if p.listener == nil {
		listener, err := openPostListener(ctx, d.dsn, channel)
		if err != nil {
			return nil, nil, err
		}
		p.listener = listener
		go relayPostNotifications(listener, &d.postChanges)
	}
	changed, unsubscribe := d.postChanges.subscribe(id)
	p.users++
	var once sync.Once
	release := func() { once.Do(func() { p.release(unsubscribe) }) }
	stop := context.AfterFunc(ctx, release)
	return changed, func() { stop(); release() }, nil
}

func openPostListener(ctx context.Context, dsn, channel string) (*pq.Listener, error) {
	// lib/pq retries connection failures. Bound the initial wait so a database
	// outage cannot leave new subscriptions waiting indefinitely.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	listener := pq.NewListener(dsn, time.Second, 15*time.Second, nil)
	stop := context.AfterFunc(ctx, func() { _ = listener.Close() })
	err := listener.Listen(channel)
	stop()
	if ctx.Err() != nil {
		err = ctx.Err()
	}
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	return listener, nil
}

func (p *postgresPostListener) release(unsubscribe func()) {
	p.mu.Lock()
	defer p.mu.Unlock()
	unsubscribe()
	p.users--
	if p.users == 0 {
		_ = p.listener.Close()
		p.listener = nil
	}
}

func relayPostNotifications(listener *pq.Listener, hub *postChangeHub) {
	for notification := range listener.Notify {
		if notification == nil {
			// Reconnection may have missed commits; each subscriber rereads its post.
			hub.notifyAll()
		} else {
			hub.notify(notification.Extra)
		}
	}
}
