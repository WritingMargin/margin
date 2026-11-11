package blog

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"
)

// Remote branding is optional. Fetch only public HTTPS destinations and pin the
// resolved IP to the connection, preventing DNS rebinding and internal requests.
func publicPWAIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, block := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001::/23", "2002::/16", "64:ff9b::/96", "64:ff9b:1::/48"} {
		if netip.MustParsePrefix(block).Contains(ip) {
			return false
		}
	}
	return true
}

// Wrapped so URL imports can tell a blocked host from an unreachable one; the
// message text is unchanged.
var errNonPublicHost = errors.New("host must resolve only to public IP addresses")

func dialPWALogo(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if !publicPWAIP(ip) {
			return nil, fmt.Errorf("logo %w", errNonPublicHost)
		}
	}
	if len(ips) == 0 {
		return nil, errors.New("logo host has no addresses")
	}
	return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
}
func validPWALogoURL(source string) bool {
	u, err := url.Parse(source)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && (u.Port() == "" || u.Port() == "443")
}
func fetchPWALogo(ctx context.Context, source string) ([]byte, error) {
	if !validPWALogoURL(source) {
		return nil, errors.New("logo must use public HTTPS")
	}
	transport := &http.Transport{DialContext: dialPWALogo, TLSHandshakeTimeout: 3 * time.Second, DisableKeepAlives: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("logo request failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if len(data) > 2<<20 {
		return nil, errors.New("logo exceeds 2 MB")
	}
	return data, err
}
