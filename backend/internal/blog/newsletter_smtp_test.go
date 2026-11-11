package blog

import (
	"context"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func smtpFixture(t *testing.T) (*App, Row) {
	a, _ := coreFixture(t)
	t.Setenv("AI_SERVICE_TOKEN", "")
	t.Setenv("PUBLIC_URL", "https://blog.example.com")
	t.Setenv("CONTENT_ENCRYPTION_KEY", strings.Repeat("ab", 32))
	a.Client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("SMTP must not call Central: %s", r.URL)
		return nil, nil
	})
	return a, Row{"enabled": true, "delivery": "smtp", "senderEmail": "news@example.com", "smtp": Row{"host": "smtp.example.com", "port": 587, "security": "starttls", "username": "writer", "password": "private-smtp-password"}}
}
func TestSMTPSavesEncryptedAndWorksWithoutAccount(t *testing.T) {
	a, input := smtpFixture(t)
	saved := responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 200)
	if !saved.yes("ready") || !saved.yes("entitled") || strings.Contains(encode(saved), "private-smtp-password") {
		t.Fatal(saved)
	}
	stored := first(a.DB.Must(context.Background(), "SELECT encrypted_configuration FROM newsletter_smtp"))
	if strings.Contains(stored.str("encrypted_configuration"), "private-smtp-password") {
		t.Fatal("unencrypted password")
	}
	responseRow(t, request(t, a, "GET", "/api/public/newsletter", nil, false), 200)
	smtpInput := object(input["smtp"])
	delete(smtpInput, "password")
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 200)
	if a.smtpSettings(context.Background()).str("password") != "private-smtp-password" {
		t.Fatal("password erased")
	}
	smtpInput["host"] = "different.example.com"
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 400)
	if a.smtpSettings(context.Background()).str("host") != "smtp.example.com" {
		t.Fatal("failed save changed server")
	}
}
func TestSMTPValidationAndOwnerOnly(t *testing.T) {
	a, input := smtpFixture(t)
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", input, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/newsletter/smtp/test", Row{}, false), 401)
	for _, field := range []string{"security", "host", "port"} {
		changed := Row{"host": "smtp.example.com", "port": 587, "security": "starttls", "username": "writer", "password": "secret"}
		switch field {
		case "security":
			changed[field] = "none"
		case "host":
			changed[field] = "https://smtp.example.com"
		case "port":
			changed[field] = 0
		}
		input["smtp"] = changed
		expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 400)
	}
	input["senderEmail"] = "someone@margin.dev"
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 400)
	expectStatus(t, request(t, a, "PUT", "/api/newsletter/settings", Row{"enabled": false, "provider": "resend", "senderEmail": ""}, true), 400)
}
func TestSMTPRequiresSTARTTLSBeforeAuthentication(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	received := make(chan string, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(3 * time.Second))
		conn.Write([]byte("220 test ESMTP\r\n"))
		buf := make([]byte, 4096)
		n, _ := conn.Read(buf)
		first := string(buf[:n])
		conn.Write([]byte("250-test\r\n250 AUTH PLAIN\r\n"))
		n, _ = conn.Read(buf)
		received <- first + string(buf[:n])
	}()
	host, port, _ := net.SplitHostPort(listener.Addr().String())
	_, _, err = smtpConnect(context.Background(), Row{"host": host, "port": port, "security": "starttls", "username": "owner", "password": "secret"})
	if err == nil {
		t.Fatal("accepted server without STARTTLS")
	}
	if strings.Contains(<-received, "AUTH") {
		t.Fatal("credentials sent without TLS")
	}
}
func TestSMTPConfirmationDoesNotRequireCentral(t *testing.T) {
	a, input := smtpFixture(t)
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 200)
	token := newsletterToken()
	a.DB.Must(context.Background(), "INSERT INTO newsletter_subscribers(email,status,confirmation_hash,confirmation_expires_at,unsubscribe_hash) VALUES($1,'pending',$2,NOW()+INTERVAL '24 hours',$3)", "reader@example.com", hash(token), hash(newsletterToken()))
	responseRow(t, request(t, a, "POST", "/api/public/newsletter/confirm", Row{"token": token}, false), 200)
}
