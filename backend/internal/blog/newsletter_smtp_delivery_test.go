package blog

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"io"
	"net"
	"net/http/httptest"
	"net/smtp"
	"strings"
	"testing"
	"time"
)

func TestSMTPDeliveryThroughVerifiedTLS(t *testing.T) {
	certServer := httptest.NewTLSServer(nil)
	cert := certServer.TLS.Certificates[0]
	roots := x509.NewCertPool()
	roots.AddCert(certServer.Certificate())
	certServer.Close()
	for _, mode := range []string{"tls", "starttls"} {
		t.Run(mode, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			received := make(chan string, 1)
			serverConfig := &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}
			go smtpTestServer(listener, serverConfig, mode, received)
			conn, err := net.Dial("tcp", listener.Addr().String())
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			client, err := smtpClient(context.Background(), conn, "127.0.0.1", mode, &tls.Config{ServerName: "127.0.0.1", RootCAs: roots, MinVersion: tls.VersionTLS12})
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			if err = client.Auth(smtp.PlainAuth("", "writer", "secret", "127.0.0.1")); err != nil {
				t.Fatal(err)
			}
			deliverSMTP(client, "news@example.com", "reader@example.com", "Research notes", newsletterConfirmationHTML("https://blog.example.com/notes", strings.Repeat("a", 64), strings.Repeat("b", 64)))
			message := <-received
			if !strings.Contains(message, "From: \"Research notes\" <news@example.com>") || !strings.Contains(message, "To: reader@example.com") {
				t.Fatal(message)
			}
			encoded := strings.SplitN(message, "\r\n\r\n", 2)[1]
			decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(encoded, "\r\n", ""))
			if err != nil || !strings.Contains(string(decoded), `href="https://blog.example.com/notes/newsletter/unsubscribe#`+strings.Repeat("b", 64)+`">Unsubscribe</a>`) {
				t.Fatal(string(decoded), err)
			}
		})
	}
}
func smtpTestServer(listener net.Listener, config *tls.Config, mode string, received chan<- string) {
	conn, err := listener.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	if mode == "tls" {
		conn = tls.Server(conn, config)
	}
	io.WriteString(conn, "220 test ESMTP\r\n")
	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		switch {
		case strings.HasPrefix(line, "EHLO"):
			io.WriteString(conn, "250-test\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n")
		case strings.HasPrefix(line, "STARTTLS"):
			io.WriteString(conn, "220 Ready\r\n")
			conn = tls.Server(conn, config)
			reader = bufio.NewReader(conn)
		case strings.HasPrefix(line, "AUTH"):
			io.WriteString(conn, "235 Authenticated\r\n")
		case strings.HasPrefix(line, "DATA"):
			io.WriteString(conn, "354 Send content\r\n")
			received <- smtpTestData(reader)
			io.WriteString(conn, "250 Accepted\r\n")
		case strings.HasPrefix(line, "QUIT"):
			io.WriteString(conn, "221 Bye\r\n")
			return
		default:
			io.WriteString(conn, "250 OK\r\n")
		}
	}
}

func smtpTestData(reader *bufio.Reader) string {
	message := ""
	for {
		part, err := reader.ReadString('\n')
		if err != nil || part == ".\r\n" {
			return message
		}
		message += part
	}
}
