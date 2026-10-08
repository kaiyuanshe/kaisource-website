package integration

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/utils"
)

// Invoked only by the disposable-database runtime test. It proves the backend
// distinctions mirrored by UI gates without changing production roles.
func testArticleOperationPermissions(t *testing.T, db *gorm.DB, publisherID uint) {
	cases := []struct {
		name       string
		permission string
		create     int
		edit       int
		review     int
		delete     int
	}{
		{"anonymous", "", 401, 401, 401, 401},
		{"event_only", "event:write", 403, 403, 403, 403},
		{"writer", "article:write", 200, 200, 403, 403},
		{"reviewer", "article:review", 403, 403, 200, 403},
		{"deleter", "article:delete", 403, 403, 403, 200},
	}
	router := gin.New()
	router.Use(gin.Recovery())
	routes.SetupRouter(router)
	for _, scenario := range cases {
		t.Run(scenario.name, func(t *testing.T) {
			token := ""
			if scenario.permission != "" {
				permission := models.Permission{Name: scenario.permission}
				if err := db.Where("name = ?", permission.Name).FirstOrCreate(&permission).Error; err != nil {
					t.Fatal(err)
				}
				role := models.Role{Name: "permission-test-" + scenario.name, Permissions: []models.Permission{permission}}
				if err := db.Create(&role).Error; err != nil {
					t.Fatal(err)
				}
				user := models.User{Email: scenario.name + "@permissions.example.test", Username: "permission-" + scenario.name, IsVerified: true, RoleID: role.ID}
				if err := db.Create(&user).Error; err != nil {
					t.Fatal(err)
				}
				var err error
				token, err = utils.GenerateToken(user.ID, user.Email, "", user.Username, "", []string{scenario.permission})
				if err != nil {
					t.Fatal(err)
				}
			}
			article := models.Article{Title: "Operation permission fixture", Content: "Test body", Locale: "en", Category: "blog", PublishStatus: 2, PublisherId: publisherID}
			if err := db.Create(&article).Error; err != nil {
				t.Fatal(err)
			}
			body := `{"title":"Permission test","desc":"Test","content":"Test body","category":"blog","locale":"en","cover_img":"https://example.test/cover.png","author":"Test writer","license":"CC-BY-4.0"}`
			operations := []struct {
				method string
				path   string
				body   string
				status int
			}{
				{http.MethodPost, "/v1/articles", body, scenario.create},
				{http.MethodPut, fmt.Sprintf("/v1/articles/%d", article.ID), body, scenario.edit},
				{http.MethodPut, fmt.Sprintf("/v1/articles/%d/status", article.ID), `{"publish_status":1}`, scenario.review},
				{http.MethodDelete, fmt.Sprintf("/v1/articles/%d", article.ID), "", scenario.delete},
			}
			for _, operation := range operations {
				request := httptest.NewRequest(operation.method, operation.path, strings.NewReader(operation.body))
				request.Header.Set("Content-Type", "application/json")
				if token != "" {
					request.Header.Set("Authorization", "Bearer "+token)
				}
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != operation.status {
					t.Fatalf("%s %s: expected %d, got %d", operation.method, operation.path, operation.status, response.Code)
				}
			}
		})
	}
}
