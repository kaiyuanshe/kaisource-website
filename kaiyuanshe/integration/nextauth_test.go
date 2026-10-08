package integration

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/utils"
)

// The frontend uses a real NextAuth server and production Secure cookies behind
// a test-only TLS proxy. Only the guarded disposable Go/database fixtures are
// reachable by authorizers. No production account or provider is used.
func testNextAuthRuntime(t *testing.T, connection *gorm.DB) {
	if os.Getenv("KAISOURCE_TEST_NEXTAUTH") != "true" {
		t.Skip("run npm run test:auth-runtime for the built NextAuth integration")
	}
	// TestIsolatedRuntime changes cwd. Use the guarded runner's explicit path.
	root := os.Getenv("KAISOURCE_TEST_REPOSITORY")
	if root == "" {
		t.Fatal("isolated repository path not supplied")
	}
	if _, err := os.Stat(filepath.Join(root, ".next", "BUILD_ID")); err != nil {
		t.Fatal("build frontend before NextAuth integration")
	}
	router := gin.New()
	router.Use(gin.Recovery())
	if err := router.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	routes.SetupRouter(router)
	backend := httptest.NewServer(router)
	t.Cleanup(backend.Close)
	portListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := portListener.Addr().(*net.TCPAddr).Port
	portListener.Close()
	upstream, _ := url.Parse("http://127.0.0.1:" + strconv.Itoa(port))
	frontend := httptest.NewTLSServer(httputil.NewSingleHostReverseProxy(upstream))
	t.Cleanup(frontend.Close)
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		t.Fatal(err)
	}
	command := exec.Command("node", filepath.Join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", strconv.Itoa(port))
	command.Dir = root
	// Explicit test environment: never inherit provider tokens or database secrets
	// into the frontend process. Empty provider keys override optional dotenv files.
	command.Env = []string{
		"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), "NODE_ENV=production",
		"NEXTAUTH_SECRET=" + hex.EncodeToString(secret), "NEXTAUTH_URL=" + frontend.URL,
		"INTERNAL_API_URL=" + backend.URL + "/v1", "SITE_DEFAULT_LOCALE=en", "SITE_PREVIEW_MODE=false",
		"GITHUB_CLIENT_ID=", "GITHUB_CLIENT_SECRET=", "CLOUDINARY_API_SECRET=",
		"CLOUDINARY_API_KEY=", "CLOUDINARY_CLOUD_NAME=", "NEXT_PUBLIC_CLOUDINARY_API_KEY=", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=",
	}
	command.Stdout, command.Stderr = io.Discard, io.Discard
	if err := command.Start(); err != nil {
		t.Fatal("could not start isolated NextAuth server")
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	t.Cleanup(func() {
		_ = command.Process.Signal(os.Interrupt)
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			_ = command.Process.Kill()
			<-done
		}
	})
	probe := &http.Client{Timeout: time.Second}
	ready := false
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		response, err := probe.Get(upstream.String() + "/api/auth/csrf")
		if err == nil {
			response.Body.Close()
			if response.StatusCode == 200 {
				ready = true
				break
			}
		}
		select {
		case <-done:
			t.Fatal("isolated NextAuth server exited before readiness")
		default:
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !ready {
		t.Fatal("isolated NextAuth server did not become ready")
	}
	newClient := func() *http.Client {
		client := frontend.Client()
		client.Timeout = 10 * time.Second
		client.Jar, _ = cookiejar.New(nil)
		return client
	}
	// Exercise the compiled Next route handlers over actual HTTPS, without
	// following the redirect to any build-time external API destination.
	routeClient := newClient()
	routeClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	for _, action := range []string{"generate", "verify"} {
		response, err := routeClient.Post(frontend.URL+"/api/captcha/"+action, "application/json", strings.NewReader(`{"email":"fixture@example.test"}`))
		if err != nil {
			t.Fatal("captcha compatibility route unavailable")
		}
		response.Body.Close()
		if response.StatusCode != 307 || response.Header.Get("Location") != "/v1/captcha/"+action || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("captcha route lost POST-preserving redirect or cache protection")
		}
		response, err = routeClient.Get(frontend.URL + "/api/captcha/" + action)
		if err != nil {
			t.Fatal("captcha method rejection unavailable")
		}
		response.Body.Close()
		if response.StatusCode != 405 || response.Header.Get("Allow") != "POST" {
			t.Fatal("captcha route accepted a non-POST request")
		}
	}
	// Request helpers belong to services, not published Next API endpoints.
	// Check the compiled routes over HTTPS instead of relying only on source scans.
	for _, utility := range []string{"api", "article", "comment", "comunity", "dapp", "event", "feedback", "login", "member", "post", "recap", "tutorial", "user", "verification"} {
		response, err := routeClient.Get(frontend.URL + "/api/" + utility)
		if err != nil {
			t.Fatal("request utility route probe failed")
		}
		response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Fatalf("request utility /api/%s became a public route: %d", utility, response.StatusCode)
		}
	}
	getJSON := func(client *http.Client, path string, target interface{}) {
		response, err := client.Get(frontend.URL + path)
		if err != nil {
			t.Fatal("frontend request failed")
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			t.Fatalf("frontend endpoint failed %d", response.StatusCode)
		}
		if err := json.NewDecoder(response.Body).Decode(target); err != nil {
			t.Fatal("invalid frontend JSON")
		}
	}
	signIn := func(client *http.Client, provider string, credentials url.Values) string {
		var csrf struct {
			Token string `json:"csrfToken"`
		}
		getJSON(client, "/api/auth/csrf", &csrf)
		credentials.Set("csrfToken", csrf.Token)
		credentials.Set("callbackUrl", frontend.URL+"/")
		credentials.Set("json", "true")
		request, err := http.NewRequest(http.MethodPost, frontend.URL+"/api/auth/callback/"+provider, strings.NewReader(credentials.Encode()))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		request.Header.Set("Origin", frontend.URL)
		response, err := client.Do(request)
		if err != nil {
			t.Fatal("credential callback request failed")
		}
		defer response.Body.Close()
		var result struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			t.Fatal("invalid credential callback JSON")
		}
		if !strings.Contains(result.URL, "error=") {
			secure := false
			for _, cookie := range response.Cookies() {
				if strings.HasPrefix(cookie.Name, "__Secure-next-auth.session-token") {
					secure = cookie.Secure && cookie.HttpOnly && cookie.SameSite == http.SameSiteLaxMode
				}
			}
			if !secure {
				t.Fatal("successful production session lacks Secure/HttpOnly/SameSite cookie protection")
			}
		}
		return result.URL
	}
	type sessionData struct {
		User *struct {
			UID         string   `json:"uid"`
			Token       string   `json:"token"`
			Permissions []string `json:"permissions"`
		} `json:"user"`
	}
	client := newClient()
	var anonymous sessionData
	getJSON(client, "/api/auth/session", &anonymous)
	if anonymous.User != nil {
		t.Fatal("anonymous session gained a user")
	}
	redirect := signIn(client, "email-login", url.Values{"email": {"writer@example.test"}, "password": {"isolated-pass-123"}})
	if strings.Contains(redirect, "error=") {
		t.Fatal("actual password authorization failed")
	}
	var session sessionData
	getJSON(client, "/api/auth/session", &session)
	if session.User == nil || session.User.Token == "" {
		t.Fatal("successful login did not establish a session")
	}
	claims, err := utils.ParseToken(session.User.Token)
	if err != nil || session.User.UID != strconv.Itoa(int(claims.Uid)) {
		t.Fatal("session and API user IDs differ")
	}
	var writer models.User
	if err := connection.First(&writer, "email = ?", "writer@example.test").Error; err != nil || writer.ID != claims.Uid {
		t.Fatal("frontend login created an independent identity")
	}
	secureCookie := false
	frontendURL, _ := url.Parse(frontend.URL)
	for _, cookie := range client.Jar.Cookies(frontendURL) {
		if strings.HasPrefix(cookie.Name, "__Secure-next-auth.session-token") {
			secureCookie = true
		}
	}
	if !secureCookie {
		t.Fatal("production session was not delivered as a Secure cookie")
	}
	article := `{"title":"NextAuth authorized article","desc":"Isolated fixture","content":"Body","category":"blog","license":"CC-BY-4.0","locale":"en","cover_img":"https://example.test/cover.png","author":"Fixture"}`
	request, _ := http.NewRequest(http.MethodPost, backend.URL+"/v1/articles", bytes.NewBufferString(article))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+session.User.Token)
	response, err := backend.Client().Do(request)
	if err != nil {
		t.Fatal("authorized write request failed")
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("frontend session token could not write to shared API")
	}
	var count int64
	connection.Model(&models.Article{}).Where("title = ? AND publisher_id = ?", "NextAuth authorized article", writer.ID).Count(&count)
	if count != 1 {
		t.Fatal("frontend-authorized write did not persist in shared database")
	}
	badClient := newClient()
	redirect = signIn(badClient, "email-login", url.Values{"email": {"writer@example.test"}, "password": {"wrong-password"}})
	if !strings.Contains(redirect, "error=CredentialsSignin") {
		t.Fatal("wrong password was accepted")
	}
	var rejected sessionData
	getJSON(badClient, "/api/auth/session", &rejected)
	if rejected.User != nil {
		t.Fatal("wrong password established a session")
	}
	verification, err := utils.GenerateEmailVerificationToken(24)
	if err != nil {
		t.Fatal(err)
	}
	pending := models.User{Email: "next-verify@example.test", Username: "next-verify", RoleID: writer.RoleID, VerifyToken: verification.Token, TokenExpiry: &verification.ExpiresAt}
	if err := connection.Create(&pending).Error; err != nil {
		t.Fatal(err)
	}
	verifyClient := newClient()
	redirect = signIn(verifyClient, "register-verify", url.Values{"uid": {strconv.Itoa(int(pending.ID))}, "token": {verification.Token}})
	if strings.Contains(redirect, "error=") {
		t.Fatal("email verification authorizer failed")
	}
	var verified sessionData
	getJSON(verifyClient, "/api/auth/session", &verified)
	if verified.User == nil || verified.User.UID != strconv.Itoa(int(pending.ID)) {
		t.Fatal("email verification did not preserve shared user identity")
	}
	if _, err := utils.ParseToken(verified.User.Token); err != nil {
		t.Fatal("email verification session lacks an API token")
	}
}
