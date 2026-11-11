package blog

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/pem"
	"net"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// A separate process loads only this fixture CA into SMTP's normal system trust
// store. The application still verifies TLS, and no Central account is present.
func TestPasswordRecoveryStandaloneSMTP(t *testing.T) {
	if os.Getenv("MARGIN_SMTP_RECOVERY_CHILD") == "1" {
		standaloneSMTPRecovery(t)
		return
	}
	certServer := httptest.NewTLSServer(nil)
	cert := certServer.TLS.Certificates[0]
	certServer.Close()
	directory := t.TempDir()
	certificate := filepath.Join(directory, "fixture-ca.pem")
	if err := os.WriteFile(certificate, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Certificate[0]}), 0600); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	received := make(chan string)
	go smtpTestServer(listener, &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, "tls", received)
	messageFile := filepath.Join(directory, "message.eml")
	go func() {
		select {
		case message := <-received:
			_ = os.WriteFile(messageFile, []byte(message), 0600)
		case <-time.After(15 * time.Second):
		}
	}()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, executable, "-test.run=^TestPasswordRecoveryStandaloneSMTP$", "-test.v")
	command.Env = append(os.Environ(), "MARGIN_SMTP_RECOVERY_CHILD=1", "SSL_CERT_FILE="+certificate, "MARGIN_SMTP_RECOVERY_ADDRESS="+listener.Addr().String(), "MARGIN_SMTP_RECOVERY_MESSAGE="+messageFile)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("standalone SMTP recovery failed: %v\n%s", err, output)
	}
}

func standaloneSMTPRecovery(t *testing.T) {
	t.Helper()
	a, input := smtpFixture(t)
	host, port, err := net.SplitHostPort(os.Getenv("MARGIN_SMTP_RECOVERY_ADDRESS"))
	if err != nil {
		t.Fatal(err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil {
		t.Fatal(err)
	}
	config := object(input["smtp"])
	config["host"], config["port"], config["security"] = host, portNumber, "tls"
	responseRow(t, request(t, a, "PUT", "/api/newsletter/settings", input, true), 200)
	digest, err := bcrypt.GenerateFromPassword([]byte("old-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	a.DB.Must(context.Background(), "INSERT INTO admins(id,email,password_hash) VALUES(1,$1,$2)", "owner@example.com", string(digest))
	a.DB.Must(context.Background(), "INSERT INTO owner_email_verification(id,email,verified_at) VALUES(1,$1,NOW())", "owner@example.com")
	t.Cleanup(a.passwordMailTasks.Wait)
	requestPasswordRecovery(t, a, "owner@example.com")
	value := standaloneSMTPRecoveryToken(t)
	expectStatus(t, request(t, a, "POST", "/api/public/password/reset", Row{"token": value, "password": "new-password-123"}, false), 200)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "old-password-123"}, false), 401)
	expectStatus(t, request(t, a, "POST", "/api/login", Row{"email": "owner@example.com", "password": "new-password-123"}, false), 200)
}

func standaloneSMTPRecoveryToken(t *testing.T) string {
	t.Helper()
	var message []byte
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); {
		message, _ = os.ReadFile(os.Getenv("MARGIN_SMTP_RECOVERY_MESSAGE"))
		if len(message) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	parts := strings.SplitN(string(message), "\r\n\r\n", 2)
	if len(parts) != 2 {
		t.Fatal("SMTP did not capture a recovery message")
	}
	content, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(parts[1], "\r\n", ""))
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`https://blog\.example\.com/admin/reset-password#([a-f0-9]{64})`).FindSubmatch(content)
	if len(match) != 2 {
		t.Fatal("SMTP recovery message has no valid reset link")
	}
	return string(match[1])
}
