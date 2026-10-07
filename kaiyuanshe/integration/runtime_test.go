package integration

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"kaiyuanshe/config"
	"kaiyuanshe/logger"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/utils"
)

func TestIsolatedRuntime(t *testing.T) {
	dsn := os.Getenv("KAISOURCE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("run npm run test:backend-runtime to create an isolated database")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "localhost" || !strings.HasPrefix(u.Query().Get("host"), filepath.Join(os.TempDir(), "kaisource-pg-test-")) || u.Path != "/kaisource_runtime_test" {
		t.Fatal("refusing to test against a non-disposable database")
	}
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("KAISOURCE_DATABASE_URL", dsn)
	t.Setenv("JWT_SECRET", "isolated-runtime-test-key-not-for-production")
	t.Chdir(t.TempDir())
	if config.DB != nil {
		t.Fatal("import opened database")
	}
	if err := config.Load(); err != nil {
		t.Fatal(err)
	}
	if err := config.ValidateRuntime(); err != nil {
		t.Fatal(err)
	}
	if err := config.ConnectDB(); err != nil {
		t.Fatal(err)
	}
	connection := config.DB
	pool, err := connection.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if connection.Migrator().HasTable(&models.User{}) {
		t.Fatal("startup migrated schema")
	}
	models.BindDatabase(connection)
	if err := models.ValidateAuthenticationSchema(); err == nil {
		t.Fatal("serving allowed before explicit authentication migration")
	}
	if err := models.MigrateSchema(); err != nil {
		t.Fatal("migration failed", err)
	}
	if err := models.ValidateAuthenticationSchema(); err != nil {
		t.Fatal("explicit authentication migration was not recognized")
	}
	if pool.Stats().MaxOpenConnections != 5 {
		t.Fatal("pool limit missing")
	}
	var roles int64
	connection.Model(&models.Role{}).Count(&roles)
	if roles != 0 {
		t.Fatal("migration seeded data implicitly")
	}
	permission := models.Permission{Name: "article:write"}
	role := models.Role{Name: "runtime-test-writer", Permissions: []models.Permission{permission}}
	if err := connection.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	hash, err := utils.HashPassword("isolated-pass-123")
	if err != nil {
		t.Fatal(err)
	}
	user := models.User{Email: "writer@example.test", Username: "test-writer", Password: hash, IsVerified: true, RoleID: role.ID}
	if err := connection.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	zh := models.Article{Title: "测试文章", Content: "中文正文", Locale: "zh-CN", PublishStatus: 2, Category: "blog", PublisherId: user.ID}
	if err := connection.Create(&zh).Error; err != nil {
		t.Fatal(err)
	}
	en := models.Article{Title: "Test article", Content: "English body", Locale: "en", TranslationOf: &zh.ID, PublishStatus: 2, Category: "blog", PublisherId: user.ID}
	if err := connection.Create(&en).Error; err != nil {
		t.Fatal(err)
	}
	zhEvent := models.Event{Title: "测试活动", Locale: "zh-CN", PublishStatus: 2, UserId: user.ID}
	if err := connection.Create(&zhEvent).Error; err != nil {
		t.Fatal(err)
	}
	enEvent := models.Event{Title: "Test event", Locale: "en", TranslationOf: &zhEvent.ID, PublishStatus: 2, UserId: user.ID}
	if err := connection.Create(&enEvent).Error; err != nil {
		t.Fatal(err)
	}
	logger.Init("", "info")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Recovery())
	routes.SetupRouter(router)
	call := func(method, target, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, target, bytes.NewBufferString(body))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	login := call(http.MethodPost, "/v1/login-email", `{"email":"writer@example.test","password":"isolated-pass-123"}`, "")
	if login.Code != 200 {
		t.Fatalf("login failed %d", login.Code)
	}
	var loginResult struct {
		Data struct {
			Token string `json:"token"`
		}
	}
	if err := json.Unmarshal(login.Body.Bytes(), &loginResult); err != nil || loginResult.Data.Token == "" {
		t.Fatal("missing API token")
	}
	claims, err := utils.ParseToken(loginResult.Data.Token)
	if err != nil || claims.Uid != user.ID {
		t.Fatal("wrong shared user identity")
	}
	badLogin := call(http.MethodPost, "/v1/login-email", `{"email":"writer@example.test","password":"incorrect"}`, "")
	if badLogin.Code != 401 {
		t.Fatal("bad credentials accepted")
	}
	for _, locale := range []string{"en", "zh-CN"} {
		for _, resource := range []string{"articles", "events"} {
			list := call(http.MethodGet, "/v1/"+resource+"?locale="+locale+"&publish_status=2", "", "")
			if list.Code != 200 || !bytes.Contains(list.Body.Bytes(), []byte(`"locale":"`+locale+`"`)) {
				t.Fatalf("%s %s failed", locale, resource)
			}
		}
	}
	localized := call(http.MethodGet, fmt.Sprintf("/v1/articles/%d?locale=en", zh.ID), "", "")
	if localized.Code != 200 || !bytes.Contains(localized.Body.Bytes(), []byte("English body")) {
		t.Fatal("linked article translation missing")
	}
	draftBody := `{"title":"Authorized article","desc":"Test","content":"Body","category":"blog","license":"CC-BY-4.0","locale":"en","cover_img":"https://example.test/cover.png","author":"Test writer"}`
	unauthorized := call(http.MethodPost, "/v1/articles", draftBody, "")
	if unauthorized.Code != 401 {
		t.Fatal("anonymous write accepted")
	}
	write := call(http.MethodPost, "/v1/articles", draftBody, loginResult.Data.Token)
	if write.Code != 200 {
		t.Fatalf("authorized article write failed %d: %s", write.Code, write.Body.String())
	}
	var count int64
	connection.Model(&models.Article{}).Where("title = ?", "Authorized article").Count(&count)
	if count != 1 {
		t.Fatal("write was not persisted in authoritative database")
	}
	eventRole := models.Role{Name: "runtime-event-only", Permissions: []models.Permission{{Name: "event:write"}}}
	if err := connection.Create(&eventRole).Error; err != nil {
		t.Fatal(err)
	}
	eventUser := models.User{Email: "event@example.test", Username: "event-writer", Password: hash, IsVerified: true, RoleID: eventRole.ID}
	if err := connection.Create(&eventUser).Error; err != nil {
		t.Fatal(err)
	}
	eventToken, err := utils.GenerateToken(eventUser.ID, eventUser.Email, "", eventUser.Username, "", []string{"event:write"})
	if err != nil {
		t.Fatal(err)
	}
	if response := call(http.MethodPost, "/v1/articles", draftBody, eventToken); response.Code != 403 {
		t.Fatal("event-only permission granted article write")
	}
	profile := call(http.MethodGet, fmt.Sprintf("/v1/users/%d", user.ID), "", loginResult.Data.Token)
	if profile.Code != 200 {
		t.Fatal("authenticated profile unavailable")
	}
	if bytes.Contains(profile.Body.Bytes(), []byte(hash)) {
		t.Fatal("password hash exposed")
	}
	// Explicit seed failures roll back the category tree and can be retried.
	if err := connection.Callback().Create().Before("gorm:create").Register("test:fail_category_seed", func(tx *gorm.DB) {
		if category, ok := tx.Statement.Dest.(*models.Category); ok && category.Name == "AI" {
			tx.AddError(errors.New("isolated seed failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	if err := models.InitCategories(); err == nil {
		t.Fatal("seed failure ignored")
	}
	connection.Model(&models.Category{}).Count(&count)
	if count != 0 {
		t.Fatal("failed category seed left partial data")
	}
	if err := connection.Callback().Create().Remove("test:fail_category_seed"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := models.InitCategories(); err != nil {
			t.Fatal("explicit category seed failed", err)
		}
	}
	connection.Model(&models.Category{}).Count(&count)
	if count != 29 {
		t.Fatal("category seed is not idempotent")
	}
	t.Run("shared authentication state", func(t *testing.T) { testSharedAuthenticationState(t, connection) })
	t.Run("NextAuth real login and writes", func(t *testing.T) { testNextAuthRuntime(t, connection) })
}
