package services

import (
	"crypto/tls"
	"fmt"
	"html"
	"kaiyuanshe/config"
	"net"
	"net/smtp"
	"net/url"
	"strings"
	"time"

	"gopkg.in/gomail.v2"
)

type EmailService struct {
	config config.EmailConfig
}

func NewEmailService(cfg config.EmailConfig) *EmailService {
	return &EmailService{config: cfg}
}

// dialSMTP applies one deadline to connect, TLS, AUTH and message delivery.
// Provider replies can contain account data: report stages, not raw replies.
func (es *EmailService) dialSMTP() (*smtp.Client, error) {
	cfg := es.config
	if cfg.SMTPHost == "" || cfg.SMTPPort < 1 || cfg.SMTPPort > 65535 {
		return nil, fmt.Errorf("SMTP configuration missing")
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	if timeout > 60*time.Second {
		timeout = 60 * time.Second
	}
	deadline := time.Now().Add(timeout)
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(cfg.SMTPHost, fmt.Sprint(cfg.SMTPPort)), timeout)
	if err != nil {
		return nil, fmt.Errorf("SMTP connect failed")
	}
	if err := conn.SetDeadline(deadline); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SMTP deadline failed")
	}
	success := false
	defer func() {
		if !success {
			conn.Close()
		}
	}()
	tlsConfig := &tls.Config{ServerName: cfg.SMTPHost, MinVersion: tls.VersionTLS12}
	encrypted := cfg.SSL || cfg.SMTPPort == 465
	if encrypted {
		tlsConn := tls.Client(conn, tlsConfig)
		if err := tlsConn.Handshake(); err != nil {
			return nil, fmt.Errorf("SMTP TLS failed")
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		return nil, fmt.Errorf("SMTP greeting failed")
	}
	if !encrypted {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(tlsConfig); err != nil {
				return nil, fmt.Errorf("SMTP STARTTLS failed")
			}
			encrypted = true
		}
	}
	// Authenticated SMTP must never fall back to cleartext, even if a provider
	// stops advertising STARTTLS. Local unauthenticated capture remains usable.
	if (cfg.TLS || cfg.Username != "" || cfg.Password != "") && !encrypted {
		return nil, fmt.Errorf("SMTP encryption required")
	}
	if cfg.Username != "" || cfg.Password != "" {
		if cfg.Username == "" || cfg.Password == "" {
			return nil, fmt.Errorf("SMTP credentials incomplete")
		}
		ok, mechanisms := client.Extension("AUTH")
		if !ok {
			return nil, fmt.Errorf("SMTP authentication unavailable")
		}
		var auth smtp.Auth
		mechanisms = " " + strings.ToUpper(mechanisms) + " "
		switch {
		case strings.Contains(mechanisms, " CRAM-MD5 "):
			auth = smtp.CRAMMD5Auth(cfg.Username, cfg.Password)
		case strings.Contains(mechanisms, " PLAIN "):
			auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
		case strings.Contains(mechanisms, " LOGIN "):
			auth = &smtpLoginAuth{username: cfg.Username, password: cfg.Password}
		default:
			return nil, fmt.Errorf("SMTP authentication mechanism unsupported")
		}
		// Exactly one mechanism attempt; no fallback/retry with stored secrets.
		if err := client.Auth(auth); err != nil {
			return nil, fmt.Errorf("SMTP authentication failed")
		}
	}
	success = true
	return client, nil
}

type smtpLoginAuth struct {
	username, password string
	step               int
}

func (a *smtpLoginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS {
		return "", nil, fmt.Errorf("SMTP encryption required")
	}
	a.step = 0
	return "LOGIN", nil, nil
}
func (a *smtpLoginAuth) Next(_ []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	a.step++
	switch a.step {
	case 1:
		return []byte(a.username), nil
	case 2:
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("SMTP authentication challenge invalid")
	}
}

// SendEmail 使用 gomail 发送邮件
func (es *EmailService) SendEmail(to []string, subject, body string) error {
	m := gomail.NewMessage()

	// 设置发件人
	m.SetHeader("From", es.config.FromEmail)
	m.SetAddressHeader("From", es.config.FromEmail, es.config.FromName)

	// 设置收件人
	m.SetHeader("To", to...)

	// 设置主题
	m.SetHeader("Subject", subject)

	// 设置邮件正文（HTML格式）
	m.SetBody("text/html", body)

	client, err := es.dialSMTP()
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.Mail(es.config.FromEmail); err != nil {
		return fmt.Errorf("SMTP sender rejected")
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("SMTP recipient rejected")
		}
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed")
	}
	if _, err := m.WriteTo(writer); err != nil {
		writer.Close()
		return fmt.Errorf("SMTP message write failed")
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("SMTP delivery confirmation failed")
	}

	return nil
}

// SendVerificationEmail 发送验证邮件
func (es *EmailService) SendVerificationEmail(toEmail, username, token string, uid uint, expiresAt time.Time) error {
	subject := "欢迎加入开源社，请验证您的邮箱!"
	callback, err := url.Parse(es.config.RedirectUrl)
	if err != nil || callback.Scheme != "https" || callback.Host == "" || callback.User != nil {
		return fmt.Errorf("Email callback configuration invalid")
	}
	query := callback.Query()
	query.Set("uid", fmt.Sprint(uid))
	query.Set("token", token)
	callback.RawQuery = query.Encode()

	body := fmt.Sprintf(`
	    <p>感谢您在开源社网站注册账号，%s！</p>
	    <p>您的验证令牌：%s</p>
	    <p>该验证链接将在 %s 过期</p>
	`, html.EscapeString(username), html.EscapeString(callback.String()), expiresAt.Format("2006-01-02 15:04:05"))

	return es.SendEmail([]string{toEmail}, subject, body)
}
