package blog

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"margin/backend/internal/contentcrypto"
	"math"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

func smtpEncryption() *contentcrypto.Encryption {
	cipher, err := configuredContentEncryption()
	if err != nil {
		fail(503, "Configure CONTENT_ENCRYPTION_KEY before saving SMTP credentials.")
	}
	return cipher
}
func (a *App) smtpSettings(ctx context.Context) Row {
	saved := first(a.DB.Must(ctx, "SELECT encrypted_configuration FROM newsletter_smtp WHERE id=1"))
	if saved == nil {
		return Row{"host": "", "port": 587, "security": "starttls", "username": "", "password": ""}
	}
	data, err := base64.StdEncoding.DecodeString(saved.str("encrypted_configuration"))
	must(err)
	plain, err := smtpEncryption().Decrypt(data, "settings", "newsletter-smtp")
	must(err)
	var config Row
	must(json.Unmarshal(plain, &config))
	return config
}
func smtpPublic(config Row) Row {
	return Row{"host": config["host"], "port": config["port"], "security": config["security"], "username": config["username"], "passwordConfigured": config.str("password") != ""}
}
func (a *App) saveSMTP(ctx context.Context, input Row) {
	strict(input, "host", "port", "security", "username", "password")
	host := stringField(input, "host", 1, 253, true)
	if strings.ContainsAny(host, "/\\@?# \r\n\t") {
		fail(400, "Enter an SMTP hostname, without a URL or port.")
	}
	port, ok := input["port"].(float64)
	if !ok || math.Trunc(port) != port || port < 1 || port > 65535 {
		fail(400, "Enter an SMTP port between 1 and 65535.")
	}
	security := enumField(input, "security", "starttls", "tls")
	username := stringField(input, "username", 0, 320, true)
	config := Row{"host": host, "port": port, "security": security, "username": username}
	config["password"] = smtpPassword(input, config, a.smtpSettings(ctx))

	encrypted, err := smtpEncryption().Encrypt([]byte(encode(config)), "settings", "newsletter-smtp")
	must(err)
	a.DB.Must(ctx, "INSERT INTO newsletter_smtp(id,encrypted_configuration) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET encrypted_configuration=EXCLUDED.encrypted_configuration", base64.StdEncoding.EncodeToString(encrypted))
}
func smtpPassword(input, config, previous Row) string {
	password := previous.str("password")
	if _, ok := input["password"]; ok {
		password = stringField(input, "password", 0, 4096, false)
	} else if !sameSMTPServer(config, previous) {
		password = ""
	}
	if config.str("username") != "" && password == "" {
		fail(400, "Enter the SMTP password for this server and username.")
	}
	return password
}
func sameSMTPServer(a, b Row) bool {
	for _, key := range []string{"host", "port", "username", "security"} {
		if fmt.Sprint(a[key]) != fmt.Sprint(b[key]) {
			return false
		}
	}
	return true
}
func smtpPort(config Row) string { return fmt.Sprint(config["port"]) }
func smtpConnect(ctx context.Context, config Row) (*smtp.Client, func(), error) {
	host := config.str("host")
	if host == "" {
		return nil, nil, fmt.Errorf("SMTP not configured")
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(host, smtpPort(config)))
	if err != nil {
		cancel()
		return nil, nil, err
	}
	deadline, _ := ctx.Deadline()
	if err = conn.SetDeadline(deadline); err != nil {
		_ = conn.Close() // Best-effort cleanup; preserve the deadline error.
		cancel()
		return nil, nil, err
	}
	// Closing an already-closed connection is harmless during cancellation/cleanup.
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	closeConn := func() { stop(); _ = conn.Close(); cancel() }
	tlsConfig := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	client, err := smtpClient(ctx, conn, host, config.str("security"), tlsConfig)
	if err != nil {
		closeConn()
		return nil, nil, err
	}
	if config.str("username") != "" {
		err = client.Auth(smtp.PlainAuth("", config.str("username"), config.str("password"), host))
	}
	if err != nil {
		_ = client.Close() // Preserve the authentication error.
		closeConn()
		return nil, nil, err
	}
	return client, func() { _ = client.Close(); closeConn() }, nil
}
func smtpClient(ctx context.Context, conn net.Conn, host, security string, config *tls.Config) (*smtp.Client, error) {
	if security == "tls" {
		secure := tls.Client(conn, config)
		if err := secure.HandshakeContext(ctx); err != nil {
			return nil, err
		}
		return smtp.NewClient(secure, host)
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return nil, err
	}
	if err = client.StartTLS(config); err != nil {
		_ = client.Close() // Preserve the TLS negotiation error.
		return nil, err
	}
	return client, nil
}
func (a *App) smtpTest(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "smtp-test", 5, time.Minute, true)
	strict(body(w, r))
	client, closeClient, err := smtpConnect(r.Context(), a.smtpSettings(r.Context()))
	if err != nil {
		fail(502, "Could not connect securely to SMTP. Check the server, TLS mode and credentials.")
	}
	defer closeClient()
	if client.Noop() != nil {
		fail(502, "The SMTP server did not accept the connection check.")
	}
	send(w, 200, Row{"message": "Secure SMTP connection and authentication succeeded. No email was sent."})
}
func (a *App) sendSMTP(ctx context.Context, from, to, name, html string) {
	a.sendSMTPMessage(ctx, from, to, name, "Confirm your newsletter subscription", html)
}
func (a *App) sendSMTPMessage(ctx context.Context, from, to, name, subject, html string) {
	client, closeClient, err := smtpConnect(ctx, a.smtpSettings(ctx))
	must(err)
	defer closeClient()
	deliverSMTPMessage(client, from, to, name, subject, html)
}
func deliverSMTP(client *smtp.Client, from, to, name, html string) {
	deliverSMTPMessage(client, from, to, name, "Confirm your newsletter subscription", html)
}
func deliverSMTPMessage(client *smtp.Client, from, to, name, subject, html string) {
	must(client.Mail(from))
	must(client.Rcpt(to))
	writer, err := client.Data()
	must(err)
	sender := (&mail.Address{Name: name, Address: from}).String()
	message := "From: " + sender + "\r\nTo: " + to + "\r\nSubject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\nDate: " + time.Now().Format(time.RFC1123Z) + "\r\nMessage-ID: <" + uuid() + "@" + strings.Split(from, "@")[1] + ">\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
	encoded := base64.StdEncoding.EncodeToString([]byte(html))
	for len(encoded) > 76 {
		message += encoded[:76] + "\r\n"
		encoded = encoded[76:]
	}
	message += encoded + "\r\n"
	_, err = writer.Write([]byte(message))
	must(err)
	must(writer.Close())
	// A successful DATA response is delivery acceptance; QUIT failure must not replay it.
	_ = client.Quit()
}

func validSMTPSender(input Row) string {
	sender := emailField(input, "senderEmail", true)
	domain := strings.ToLower(strings.Split(sender, "@")[1])
	if domain == "margin.dev" || strings.HasSuffix(domain, ".margin.dev") {
		fail(400, "Use a sender address on a domain authorized by your SMTP provider.")
	}
	return sender
}
