package blog

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

type postgresPostListener struct {
	mu          sync.Mutex
	listener    *postNotificationListener
	users       int
	closed      bool
	starting    *postListenerStart
	cancelStart context.CancelFunc
}

type postListenerStart struct {
	done chan struct{}
	err  error
}

func (p *postgresPostListener) subscribe(ctx context.Context, d *Database, channel, id string) (<-chan struct{}, func(), error) {
	defer p.closeUnused()
	for {
		p.mu.Lock()
		if err := p.subscriptionError(ctx); err != nil {
			p.mu.Unlock()
			return nil, nil, err
		}
		if p.listener != nil {
			changed, release := p.register(ctx, &d.postChanges, id)
			p.mu.Unlock()
			return changed, release, nil
		}
		ready := p.starting
		if ready == nil {
			// Connect outside the mutex: another request must be able to cancel
			// while this connection is still starting, and Close must interrupt it.
			ready = &postListenerStart{done: make(chan struct{})}
			p.starting = ready
			startCtx, cancel := context.WithCancel(ctx)
			p.cancelStart = cancel
			go p.start(startCtx, d, channel, ready)
		}
		p.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		case <-ready.done:
			if ready.err != nil {
				return nil, nil, ready.err
			}
		}
	}
}

func (p *postgresPostListener) subscriptionError(ctx context.Context) error {
	if p.closed {
		return sql.ErrConnDone
	}
	return ctx.Err()
}

func (p *postgresPostListener) start(ctx context.Context, d *Database, channel string, ready *postListenerStart) {
	listener, err := openPostListener(ctx, d.dsn, channel)
	p.mu.Lock()
	defer p.mu.Unlock()
	if err == nil && !p.closed && ctx.Err() == nil {
		p.listener = listener
		go relayPostNotifications(listener, &d.postChanges)
	} else if listener != nil {
		_ = listener.Close()
	}
	ready.err = err
	p.cancelStart()
	p.cancelStart = nil
	p.starting = nil
	close(ready.done)
}

// Called with p.mu held, after the shared listener is ready.
func (p *postgresPostListener) register(ctx context.Context, hub *postChangeHub, id string) (<-chan struct{}, func()) {
	changed, unsubscribe := hub.subscribe(id)
	p.users++
	var once sync.Once
	release := func() { once.Do(func() { p.release(unsubscribe) }) }
	stop := context.AfterFunc(ctx, release)
	return changed, func() { stop(); release() }
}

func openPostListener(ctx context.Context, dsn, channel string) (*postNotificationListener, error) {
	// lib/pq retries connection failures. Bound the initial wait so a database
	// outage cannot leave new subscriptions waiting indefinitely.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	listener := newPostListener(dsn)
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
	if p.users == 0 && p.listener != nil {
		_ = p.listener.Close()
		p.listener = nil
	}
}

func relayPostNotifications(listener *postNotificationListener, hub *postChangeHub) {
	for notification := range listener.Notify {
		if notification == nil {
			// Reconnection may have missed commits; each subscriber rereads its post.
			hub.notifyAll()
		} else {
			hub.notify(notification.Extra)
		}
	}
}

func (p *postgresPostListener) close() {
	p.mu.Lock()
	p.closed = true
	if p.cancelStart != nil {
		p.cancelStart()
	}
	if p.listener != nil {
		_ = p.listener.Close()
		p.listener = nil
	}
	starting := p.starting
	p.mu.Unlock()
	if starting != nil {
		<-starting.done
	}
}

func (p *postgresPostListener) closeUnused() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.users == 0 && p.listener != nil {
		// Cancellation can race successful startup before anyone registers.
		_ = p.listener.Close()
		p.listener = nil
	}
}
