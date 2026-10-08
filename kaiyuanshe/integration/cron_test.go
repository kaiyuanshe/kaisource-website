package integration

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
)

// Called only after the runtime test's disposable-database guard. This helper
// removes test-day stats in that isolated cluster, never on a production URL.
func testCronReliability(t *testing.T, connection *gorm.DB) {
	newRouter := func() *gin.Engine {
		router := gin.New()
		routes.SetupRouter(router)
		return router
	}
	first, second := newRouter(), newRouter()
	call := func(router *gin.Engine, target, authorization string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, target, nil)
		request.Header.Set("Authorization", authorization)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	assertStatus := func(response *httptest.ResponseRecorder, expected int) {
		t.Helper()
		var body struct {
			Code int `json:"code"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal("cron returned non-JSON response")
		}
		if response.Code != expected || body.Code != expected || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("cron status=%d body code=%d cache=%q; wanted %d and no-store", response.Code, body.Code, response.Header().Get("Cache-Control"), expected)
		}
	}
	paths := []string{"/internal/cron/cleanup", "/internal/cron/stats"}
	for _, path := range paths {
		t.Run(path+" is opt-in even with a secret", func(t *testing.T) {
			t.Setenv("KAISOURCE_CRON_ENABLED", "false")
			assertStatus(call(first, path, "Bearer isolated-cron-secret-not-for-production"), 503)
		})
		t.Run(path+" rejects missing credentials and query secrets", func(t *testing.T) {
			for _, auth := range []string{"", "Bearer incorrect-fixture", "Basic fixture", "Bearer "} {
				assertStatus(call(second, path, auth), 401)
			}
			assertStatus(call(second, path+"?secret=isolated-cron-secret-not-for-production", ""), 401)
		})
		t.Run(path+" fails closed without configured secret", func(t *testing.T) {
			t.Setenv("CRON_SECRET", "")
			t.Setenv("KAISOURCE_CRON_SECRET", "")
			assertStatus(call(second, path, "Bearer isolated-cron-secret-not-for-production"), 503)
		})
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	clearTestDay := func() {
		t.Helper()
		if err := connection.Unscoped().Where("date = ?", today).Delete(&models.DailyStats{}).Error; err != nil {
			t.Fatal(err)
		}
	}
	t.Run("concurrent delivery to separate routers creates one accurate row", func(t *testing.T) {
		clearTestDay()
		start := make(chan struct{})
		results := make(chan *httptest.ResponseRecorder, 12)
		var workers sync.WaitGroup
		for i := 0; i < 12; i++ {
			workers.Add(1)
			go func(index int) {
				defer workers.Done()
				<-start
				router := first
				if index%2 == 1 {
					router = second
				}
				results <- call(router, "/internal/cron/stats", "Bearer isolated-cron-secret-not-for-production")
			}(i)
		}
		close(start)
		workers.Wait()
		close(results)
		for response := range results {
			assertStatus(response, 200)
		}
		var entries int64
		if err := connection.Model(&models.DailyStats{}).Where("date = ?", today).Count(&entries).Error; err != nil || entries != 1 {
			t.Fatal("retries created missing or duplicate stats", err)
		}
		var stats models.DailyStats
		if err := connection.Where("date = ?", today).First(&stats).Error; err != nil {
			t.Fatal(err)
		}
		for _, item := range []struct {
			model interface{}
			value int
		}{{&models.User{}, stats.Users}, {&models.Article{}, stats.Blogs}, {&models.Tutorial{}, stats.Tutorials}, {&models.Event{}, stats.Events}, {&models.Post{}, stats.Posts}} {
			var count int64
			if err := connection.Model(item.model).Count(&count).Error; err != nil || int64(item.value) != count {
				t.Fatal("statistics did not reflect shared data", err)
			}
		}
	})
	t.Run("failed counting stores no partial statistics and can be retried", func(t *testing.T) {
		clearTestDay()
		const hook = "test:stats-count-failure"
		if err := connection.Callback().Query().Before("gorm:query").Register(hook, func(tx *gorm.DB) {
			if tx.Statement.Table == "tutorials" {
				tx.AddError(errors.New("isolated count failure"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = connection.Callback().Query().Remove(hook) })
		assertStatus(call(first, "/internal/cron/stats", "Bearer isolated-cron-secret-not-for-production"), 503)
		var count int64
		if err := connection.Model(&models.DailyStats{}).Where("date = ?", today).Count(&count).Error; err != nil || count != 0 {
			t.Fatal("failed counting persisted a row", err)
		}
		if err := connection.Callback().Query().Remove(hook); err != nil {
			t.Fatal(err)
		}
		assertStatus(call(second, "/internal/cron/stats", "Bearer isolated-cron-secret-not-for-production"), 200)
	})
	t.Run("cancelled request does not create a statistics row", func(t *testing.T) {
		clearTestDay()
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if err := models.CollectDailyStatsContext(ctx); err == nil {
			t.Fatal("cancelled statistics request succeeded")
		}
		var count int64
		if err := connection.Model(&models.DailyStats{}).Where("date = ?", today).Count(&count).Error; err != nil || count != 0 {
			t.Fatal("cancelled request persisted a row", err)
		}
	})
}
