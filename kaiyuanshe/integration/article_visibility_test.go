package integration

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/utils"
)

func testArticleReadPermissions(t *testing.T, db *gorm.DB, publisherID uint) {
	router := gin.New()
	router.Use(gin.Recovery())
	routes.SetupRouter(router)
	published := models.Article{Title: "Visibility public original", Content: "public", Category: "visibility-fixture", Locale: "zh-CN", PublishStatus: 2, PublisherId: publisherID}
	if err := db.Create(&published).Error; err != nil {
		t.Fatal(err)
	}
	draft := models.Article{Title: "Visibility private translation", Content: "private body", Category: published.Category, Locale: "en", PublishStatus: 1, PublisherId: publisherID, TranslationOf: &published.ID}
	if err := db.Create(&draft).Error; err != nil {
		t.Fatal(err)
	}
	actorToken := func(permission string) string {
		p := models.Permission{Name: permission}
		if err := db.Where("name = ?", permission).FirstOrCreate(&p).Error; err != nil {
			t.Fatal(err)
		}
		role := models.Role{Name: "read-permission-" + permission, Permissions: []models.Permission{p}}
		if err := db.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
		user := models.User{Email: strings.ReplaceAll(permission, ":", "-") + "@visibility.example.test", Username: "visibility", IsVerified: true, RoleID: role.ID}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		token, err := utils.GenerateToken(user.ID, user.Email, "", user.Username, "", []string{permission})
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	for _, actor := range []struct {
		name, token string
		allow       bool
	}{
		{"anonymous", "", false}, {"event-only", actorToken("event:write"), false}, {"writer", actorToken("article:write"), true}, {"reviewer", actorToken("article:review"), true},
	} {
		t.Run(actor.name, func(t *testing.T) {
			request := func(path string) *httptest.ResponseRecorder {
				r := httptest.NewRequest("GET", path, nil)
				if actor.token != "" {
					r.Header.Set("Authorization", "Bearer "+actor.token)
				}
				w := httptest.NewRecorder()
				router.ServeHTTP(w, r)
				return w
			}
			for _, status := range []string{"0", "1", "2"} {
				w := request("/v1/articles?locale=en&category=" + published.Category + "&publish_status=" + status)
				if w.Code != 200 {
					t.Fatalf("list failed %d", w.Code)
				}
				if !actor.allow && strings.Contains(w.Body.String(), draft.Title) {
					t.Fatal("draft exposed in list")
				}
				if !actor.allow && !strings.Contains(w.Body.String(), published.Title) {
					t.Fatal("draft translation suppressed published original")
				}
			}
			w := request(fmt.Sprintf("/v1/articles/%d?locale=en", published.ID))
			if w.Code != 200 {
				t.Fatalf("public detail failed %d", w.Code)
			}
			if !actor.allow && strings.Contains(w.Body.String(), draft.Title) {
				t.Fatal("draft exposed via translation")
			}
			w = request(fmt.Sprintf("/v1/articles/%d", draft.ID))
			if !actor.allow && (w.Code == 200 || strings.Contains(w.Body.String(), draft.Title)) {
				t.Fatal("direct draft exposed")
			}
			if actor.allow && w.Code != 200 {
				t.Fatal("authorized draft denied")
			}
		})
	}
	r := httptest.NewRequest("GET", "/v1/articles", nil)
	r.Header.Set("Authorization", "Bearer invalid")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	var envelope struct {
		Code int `json:"code"`
	}
	json.Unmarshal(w.Body.Bytes(), &envelope)
	if w.Code != 401 || envelope.Code != 401 {
		t.Fatal("invalid optional auth did not fail closed")
	}
}
