package controllers

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"kaiyuanshe/models"
	"kaiyuanshe/utils"
)

// authorizeCron accepts only the secret injected into the deployment's cron
// job. It deliberately does not accept user sessions or query-string secrets.
func authorizeCron(c *gin.Context) bool {
	secret := strings.TrimSpace(viper.GetString("cron.secret"))
	if secret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Scheduled jobs are not configured", nil)
		return false
	}
	expected := "Bearer " + secret
	if subtle.ConstantTimeCompare([]byte(c.GetHeader("Authorization")), []byte(expected)) != 1 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized scheduled job", nil)
		return false
	}
	return true
}

func RunAuthenticationCleanupCron(c *gin.Context) {
	if !authorizeCron(c) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := models.PruneAuthenticationState(ctx); err != nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Scheduled cleanup failed", nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "cleanup complete", nil)
}

func RunDailyStatsCron(c *gin.Context) {
	if !authorizeCron(c) {
		return
	}
	if err := models.CollectDailyStats(); err != nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Daily statistics failed", nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "stats complete", nil)
}
