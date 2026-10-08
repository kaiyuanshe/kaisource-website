package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"kaiyuanshe/config"
	"kaiyuanshe/middlewares"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/utils"
)

// This helper is only invoked after TestIsolatedRuntime's disposable-DB guard.
// It never reads a production URL or uses an external SMTP service.
func testSharedAuthenticationState(t *testing.T, connection *gorm.DB) {
	ctx := context.Background()
	newInstance := func() *gin.Engine {
		r := gin.New()
		r.Use(gin.Recovery())
		if err := r.SetTrustedProxies(nil); err != nil {
			t.Fatal(err)
		}
		routes.SetupRouter(r)
		return r
	}
	first, second := newInstance(), newInstance()
	call := func(instance *gin.Engine, target string, body interface{}) *httptest.ResponseRecorder {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, target, bytes.NewReader(encoded))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		instance.ServeHTTP(w, r)
		return w
	}
	challenge := func() string {
		id, err := models.CreateCaptchaChallenge(ctx, "ABC234")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	proof := func(email string) string {
		response := call(second, "/v1/captcha/verify", map[string]string{"captchaId": challenge(), "captcha": "abc234", "email": email})
		if response.Code != 200 {
			t.Fatalf("verification failed: %d", response.Code)
		}
		var result struct {
			Data struct {
				Token string `json:"verificationToken"`
			}
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Data.Token == "" {
			t.Fatal("verification proof missing")
		}
		return result.Data.Token
	}

	t.Run("raster endpoint never exposes answers and uses shared state", func(t *testing.T) {
		response := call(first, "/v1/captcha/generate", map[string]string{})
		if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("generation failed")
		}
		var result struct {
			Data struct {
				ID    string `json:"captchaId"`
				Image string `json:"imageData"`
			}
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || !strings.HasPrefix(result.Data.Image, "data:image/png;base64,") {
			t.Fatal("missing raster image")
		}
		if strings.Contains(response.Body.String(), "answer") || strings.Contains(response.Body.String(), "answer_hash") {
			t.Fatal("answer leaked")
		}
		var stored models.CaptchaChallenge
		if err := connection.First(&stored, "id = ?", result.Data.ID).Error; err != nil || len(stored.AnswerHash) != 32 {
			t.Fatal("challenge was not persisted")
		}
	})
	t.Run("wrong answers consume challenge and expired challenges are rejected", func(t *testing.T) {
		id := challenge()
		for _, answer := range []string{"wrong", "ABC234"} {
			response := call(second, "/v1/captcha/verify", map[string]string{"captchaId": id, "captcha": answer, "email": "captcha-user@example.test"})
			if response.Code != 400 {
				t.Fatal("wrong or already-consumed challenge accepted")
			}
		}
		id = challenge()
		if err := connection.Model(&models.CaptchaChallenge{}).Where("id = ?", id).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := models.VerifyCaptchaChallenge(ctx, id, "ABC234", "expired@example.test"); err != models.ErrInvalidCaptcha {
			t.Fatal("expired challenge accepted")
		}
	})
	t.Run("proofs bind email and cannot be replayed across instances", func(t *testing.T) {
		token := proof("bound@example.test")
		if err := models.ConsumeRegistrationProof(ctx, token, "another@example.test"); err != models.ErrInvalidCaptcha {
			t.Fatal("proof was not bound to its email")
		}
		if err := models.ConsumeRegistrationProof(ctx, token, "BOUND@example.test"); err != nil {
			t.Fatal("email normalization failed")
		}
		if err := models.ConsumeRegistrationProof(ctx, token, "bound@example.test"); err != models.ErrInvalidCaptcha {
			t.Fatal("proof replay accepted")
		}
		token = proof("expired@example.test")
		if err := connection.Model(&models.RegistrationProof{}).Where("id = ?", strings.Split(token, ".")[0]).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
			t.Fatal(err)
		}
		if err := models.ConsumeRegistrationProof(ctx, token, "expired@example.test"); err != models.ErrInvalidCaptcha {
			t.Fatal("expired proof accepted")
		}
	})
	t.Run("concurrent challenge and proof consumers have only one winner", func(t *testing.T) {
		id := challenge()
		var winners atomic.Int32
		var failures atomic.Int32
		var wg sync.WaitGroup
		for i := 0; i < 16; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, err := models.VerifyCaptchaChallenge(ctx, id, "ABC234", "parallel@example.test")
				if err == nil {
					winners.Add(1)
				} else if err != models.ErrInvalidCaptcha {
					failures.Add(1)
				}
			}()
		}
		wg.Wait()
		if winners.Load() != 1 || failures.Load() != 0 {
			t.Fatal("challenge consumption is not atomic")
		}
		token := proof("parallel-proof@example.test")
		winners.Store(0)
		for i := 0; i < 16; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				err := models.ConsumeRegistrationProof(ctx, token, "parallel-proof@example.test")
				if err == nil {
					winners.Add(1)
				} else if err != models.ErrInvalidCaptcha {
					failures.Add(1)
				}
			}()
		}
		wg.Wait()
		if winners.Load() != 1 || failures.Load() != 0 {
			t.Fatal("proof consumption is not atomic")
		}
	})
	t.Run("durable rate limit holds under concurrency and survives a new router", func(t *testing.T) {
		var winners atomic.Int32
		var failures atomic.Int32
		var wg sync.WaitGroup
		now := time.Now()
		for i := 0; i < 32; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				allowed, err := models.TakeAuthRateLimit(ctx, "parallel-test", "fixture-client", 7, time.Minute, now)
				if err != nil {
					failures.Add(1)
				} else if allowed {
					winners.Add(1)
				}
			}()
		}
		wg.Wait()
		if winners.Load() != 7 || failures.Load() != 0 {
			t.Fatal("distributed rate allowance exceeded")
		}
		allowed, err := models.TakeAuthRateLimit(ctx, "parallel-test", "fixture-client", 7, time.Minute, now.Add(time.Minute))
		if err != nil || !allowed {
			t.Fatal("next rate window unavailable")
		}
		var raw models.AuthRateBucket
		if err := connection.First(&raw).Error; err != nil || strings.Contains(raw.ID, "fixture-client") {
			t.Fatal("raw client identity persisted")
		}
	})
	t.Run("separate routers share rate state and ignore untrusted forwarded IPs", func(t *testing.T) {
		for _, instance := range []*gin.Engine{first, second} {
			instance.GET("/fixture-rate", middlewares.SharedAuthRateLimiter("fixture-forwarding", 2, time.Minute), func(c *gin.Context) { c.Status(200) })
		}
		for i := 0; i < 5; i++ {
			request := httptest.NewRequest(http.MethodGet, "/fixture-rate", nil)
			request.RemoteAddr = "192.0.2.77:1234"
			request.Header.Set("X-Forwarded-For", fmt.Sprintf("198.51.100.%d", i+1))
			response := httptest.NewRecorder()
			[]*gin.Engine{first, second}[i%2].ServeHTTP(response, request)
			if i < 2 && response.Code != 200 {
				t.Fatal("shared rate allowance unavailable")
			}
			if i >= 2 && (response.Code != 429 || response.Header().Get("Retry-After") != "60") {
				t.Fatal("new instance or forged forwarding header bypassed shared rate limit")
			}
		}
	})
	t.Run("missing verification expiry and deleted account roles fail closed", func(t *testing.T) {
		role := models.Role{Name: "retired-role-fixture"}
		if err := connection.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
		user := models.User{Email: "no-role@example.test", Username: "no-role", RoleID: role.ID}
		if err := connection.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		// Soft deletion is the real ORM behavior and preserves the FK invariant.
		if err := connection.Delete(&role).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := models.GetUserWithPermissions(user.ID); err == nil {
			t.Fatal("account with missing role gained permissions")
		}
		response := call(first, "/v1/register-verify", map[string]interface{}{"uid": user.ID, "token": "invalid-fixture-token"})
		if response.Code != 400 {
			t.Fatal("missing verification expiry was not safely rejected")
		}
	})
	t.Run("registration enforces proof before creating users", func(t *testing.T) {
		for _, token := range []string{"", "client-says-verified"} {
			response := call(first, "/v1/register", map[string]string{"email": "no-proof@example.test", "password": "isolated-pass-123", "username": "fixture", "verificationToken": token})
			if response.Code != 400 {
				t.Fatal("registration bypassed captcha")
			}
		}
		var count int64
		connection.Model(&models.User{}).Where("email = ?", "no-proof@example.test").Count(&count)
		if count != 0 {
			t.Fatal("unverified request created an account")
		}
		response := call(first, "/v1/register", map[string]string{"email": "mail-missing@example.test", "password": "isolated-pass-123", "username": "fixture", "verificationToken": proof("mail-missing@example.test")})
		if response.Code != 503 {
			t.Fatal("missing mail configuration accepted")
		}
		connection.Model(&models.User{}).Where("email = ?", "mail-missing@example.test").Count(&count)
		if count != 0 {
			t.Fatal("missing mail configuration created an orphan account")
		}
	})
	t.Run("registration mail verification and login use one real shared user", func(t *testing.T) {
		port, delivered := fixtureSMTP(t)
		old := config.Email
		config.Email = &config.EmailConfig{SMTPHost: "127.0.0.1", SMTPPort: port, FromEmail: "fixture@example.test", FromName: "KaiSource test", RedirectUrl: "https://example.test/login"}
		t.Cleanup(func() { config.Email = old })
		role := models.Role{Name: "content_creator", Permissions: []models.Permission{{Name: "fixture:read"}}}
		if err := connection.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
		token := proof("captcha-user@example.test")
		request := map[string]string{"email": "captcha-user@example.test", "password": "isolated-pass-123", "username": "captcha-fixture", "verificationToken": token}
		if response := call(first, "/v1/register", request); response.Code != 200 {
			t.Fatalf("registration failed %d", response.Code)
		}
		select {
		case body := <-delivered:
			if !strings.Contains(body, "example.test/login") {
				t.Fatal("verification email missing callback")
			}
		case <-time.After(5 * time.Second):
			t.Fatal("mail was not delivered to isolated SMTP")
		}
		if response := call(second, "/v1/register", request); response.Code != 400 {
			t.Fatal("registration proof replay accepted")
		}
		var user models.User
		if err := connection.First(&user, "email = ?", request["email"]).Error; err != nil {
			t.Fatal(err)
		}
		if user.IsVerified || user.VerifyToken == "" || !utils.CheckPasswordHash(request["password"], user.Password) {
			t.Fatal("invalid pending user")
		}
		if response := call(first, "/v1/login-email", request); response.Code != 401 {
			t.Fatal("pending account logged in")
		}
		verification := map[string]interface{}{"uid": user.ID, "token": user.VerifyToken}
		var winners atomic.Int32
		var failures atomic.Int32
		var wg sync.WaitGroup
		for i := 0; i < 12; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				response := call(second, "/v1/register-verify", verification)
				if response.Code == 200 {
					winners.Add(1)
				} else if response.Code != 400 {
					failures.Add(1)
				}
			}()
		}
		wg.Wait()
		if winners.Load() != 1 || failures.Load() != 0 {
			t.Fatal("email verification is not single-use under concurrency")
		}
		if response := call(first, "/v1/register-verify", verification); response.Code != 400 {
			t.Fatal("email verification replay accepted")
		}
		response := call(first, "/v1/login-email", request)
		if response.Code != 200 {
			t.Fatal("verified account could not log in")
		}
		var result struct {
			Data struct {
				ID    uint
				Token string
			}
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Data.ID != user.ID {
			t.Fatal("login changed shared user identity")
		}
		claims, err := utils.ParseToken(result.Data.Token)
		if err != nil || claims.Uid != user.ID {
			t.Fatal("login token lacks the real user ID")
		}
		if strings.Contains(response.Body.String(), user.Password) || strings.Contains(response.Body.String(), user.VerifyToken) {
			t.Fatal("private account values leaked")
		}
	})
	t.Run("rate middleware fails closed when durable storage is unavailable", func(t *testing.T) {
		if err := connection.Migrator().DropTable(&models.AuthRateBucket{}); err != nil {
			t.Fatal(err)
		}
		if response := call(second, "/v1/login-email", map[string]string{"email": "writer@example.test", "password": "isolated-pass-123"}); response.Code != 503 {
			t.Fatal("durable-store failure bypassed protection")
		}
		if err := models.ValidateAuthenticationSchema(); err == nil {
			t.Fatal("readiness accepted missing durable authentication storage")
		}
		if err := models.MigrateAuthenticationSchema(); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("operator cleanup removes expired state", func(t *testing.T) {
		if err := models.PruneAuthenticationState(ctx); err != nil {
			t.Fatal(err)
		}
		for _, model := range []interface{}{&models.CaptchaChallenge{}, &models.RegistrationProof{}, &models.AuthRateBucket{}} {
			var count int64
			if err := connection.Model(model).Where("expires_at < ?", time.Now()).Count(&count).Error; err != nil || count != 0 {
				t.Fatal("expired authentication state retained")
			}
		}
	})
}

func fixtureSMTP(t *testing.T) (int, <-chan string) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	delivered := make(chan string, 4)
	t.Cleanup(func() { listener.Close() })
	go func() {
		for {
			connection, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer connection.Close()
				connection.SetDeadline(time.Now().Add(5 * time.Second))
				wire := textproto.NewConn(connection)
				wire.PrintfLine("220 isolated SMTP fixture")
				for {
					line, err := wire.ReadLine()
					if err != nil {
						return
					}
					switch {
					case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"):
						wire.PrintfLine("250 isolated SMTP fixture")
					case line == "DATA":
						wire.PrintfLine("354 Send fixture message")
						body, err := wire.ReadDotBytes()
						if err != nil {
							return
						}
						delivered <- string(body)
						wire.PrintfLine("250 Stored only in test memory")
					case line == "QUIT":
						wire.PrintfLine("221 Bye")
						return
					default:
						wire.PrintfLine("250 OK")
					}
				}
			}()
		}
	}()
	port := listener.Addr().(*net.TCPAddr).Port
	if port == 0 {
		t.Fatal(fmt.Errorf("SMTP fixture port missing"))
	}
	return port, delivered
}
