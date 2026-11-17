package blog

import (
	"context"
	"net"
	"time"

	"github.com/lib/pq"
)

// pq.Listener.Close cannot interrupt a connection still performing its startup
// handshake. Own the sockets as well so cancellation closes that connection too.
type postNotificationListener struct {
	*pq.Listener
	cancel context.CancelFunc
}

func newPostListener(dsn string) *postNotificationListener {
	ctx, cancel := context.WithCancel(context.Background())
	listener := pq.NewDialListener(postListenerDialer{ctx}, dsn, time.Second, 15*time.Second, nil)
	return &postNotificationListener{Listener: listener, cancel: cancel}
}

func (l *postNotificationListener) Close() error {
	l.cancel()
	return l.Listener.Close()
}

type postListenerDialer struct{ ctx context.Context }

func (d postListenerDialer) Dial(network, address string) (net.Conn, error) {
	return d.DialTimeout(network, address, 10*time.Second)
}
func (d postListenerDialer) DialTimeout(network, address string, timeout time.Duration) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(d.ctx, min(timeout, 10*time.Second))
	defer cancel()
	conn, err := (&net.Dialer{}).DialContext(ctx, network, address)
	if err != nil {
		return nil, err
	}
	stop := context.AfterFunc(d.ctx, func() { _ = conn.Close() })
	return &postListenerConn{Conn: conn, stop: stop}, nil
}

type postListenerConn struct {
	net.Conn
	stop func() bool
}

func (c *postListenerConn) Close() error {
	c.stop()
	return c.Conn.Close()
}
