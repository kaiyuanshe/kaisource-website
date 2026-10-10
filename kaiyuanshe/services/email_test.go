package services

import (
	"bufio"
	"fmt"
	"kaiyuanshe/config"
	"net"
	"net/smtp"
	"strings"
	"testing"
	"time"
)

func smtpFixture(t *testing.T, reply func(net.Conn)) config.EmailConfig {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			defer conn.Close()
			reply(conn)
		}
	}()
	return config.EmailConfig{SMTPHost: "127.0.0.1", SMTPPort: listener.Addr().(*net.TCPAddr).Port, Timeout: 100 * time.Millisecond, FromEmail: "fixture@example.test", RedirectUrl: "https://example.test/login"}
}

func TestSMTPDeadlineIncludesGreeting(t *testing.T) {
	cfg := smtpFixture(t, func(conn net.Conn) { bufio.NewReader(conn).ReadString('\n') })
	start := time.Now()
	_, err := NewEmailService(cfg).dialSMTP()
	if err == nil || time.Since(start) > time.Second {
		t.Fatal("unbounded SMTP greeting")
	}
}

func TestSMTPRejectsCleartextCredentialsAndTLSFallback(t *testing.T) {
	for _, credentials := range []bool{false, true} {
		t.Run(fmt.Sprint(credentials), func(t *testing.T) {
			commands := make(chan string, 1)
			cfg := smtpFixture(t, func(conn net.Conn) {
				fmt.Fprint(conn, "220 fixture\r\n")
				r := bufio.NewReader(conn)
				r.ReadString('\n')
				fmt.Fprint(conn, "250-fixture\r\n250 AUTH PLAIN LOGIN\r\n")
				line, _ := r.ReadString('\n')
				commands <- line
			})
			if credentials {
				cfg.Username = "private"
				cfg.Password = "never-send"
			} else {
				cfg.TLS = true
			}
			_, err := NewEmailService(cfg).dialSMTP()
			if err == nil || !strings.Contains(err.Error(), "encryption required") {
				t.Fatal("TLS downgrade accepted")
			}
			if command := <-commands; strings.Contains(command, "AUTH") {
				t.Fatal("credentials sent over cleartext")
			}
		})
	}
}

func TestVerificationEmailEscapesHTMLAndUsesInstanceCallback(t *testing.T) {
	body := make(chan string, 1)
	cfg := smtpFixture(t, func(conn net.Conn) {
		fmt.Fprint(conn, "220 fixture\r\n")
		r := bufio.NewReader(conn)
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "DATA") {
				fmt.Fprint(conn, "354 continue\r\n")
				var message strings.Builder
				for {
					row, _ := r.ReadString('\n')
					if row == ".\r\n" {
						break
					}
					message.WriteString(row)
				}
				body <- message.String()
				fmt.Fprint(conn, "250 accepted\r\n")
			} else {
				fmt.Fprint(conn, "250 OK\r\n")
			}
		}
	})
	cfg.Timeout = time.Second
	err := NewEmailService(cfg).SendVerificationEmail("fixture@example.test", "<script>alert(1)</script>", "fixture", 42, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	message := <-body
	if strings.Contains(message, "<script>") || !strings.Contains(message, "&lt;script&gt;") || !strings.Contains(message, "example.test/login") {
		t.Fatal("unsafe verification email")
	}
}

func TestSMTPLoginRequiresTLSAndOnlyTwoChallenges(t *testing.T) {
	auth := &smtpLoginAuth{username: "fixture", password: "secret"}
	if _, _, err := auth.Start(&smtp.ServerInfo{TLS: false}); err == nil {
		t.Fatal("cleartext LOGIN accepted")
	}
	if _, _, err := auth.Start(&smtp.ServerInfo{TLS: true}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"fixture", "secret"} {
		got, err := auth.Next(nil, true)
		if err != nil || string(got) != want {
			t.Fatal("LOGIN sequence invalid")
		}
	}
	if _, err := auth.Next(nil, true); err == nil {
		t.Fatal("extra credential challenge accepted")
	}
}
