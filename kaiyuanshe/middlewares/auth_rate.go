package middlewares

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"kaiyuanshe/models"
	"kaiyuanshe/utils"
)

func SharedAuthRateLimiter(scope string, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		allowed, err := models.TakeAuthRateLimit(ctx, scope, c.ClientIP(), limit, window, time.Now())
		if err != nil {
			utils.ErrorResponse(c, http.StatusServiceUnavailable, "Authentication is temporarily unavailable", nil)
			c.Abort()
			return
		}
		if !allowed {
			c.Header("Retry-After", strconv.Itoa(int(window/time.Second)))
			utils.ErrorResponse(c, http.StatusTooManyRequests, "Too many attempts. Please try again later", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}
