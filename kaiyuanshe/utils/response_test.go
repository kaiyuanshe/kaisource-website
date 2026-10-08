package utils

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestErrorResponsePreservesHTTPStatusInJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, status := range []int{400, 401, 403, 404, 429, 500, 503} {
		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		ErrorResponse(c, status, "fixture error", nil)
		var body struct{ Code int }
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if response.Code != status || body.Code != status {
			t.Fatalf("HTTP %d has JSON code %d; wanted %d", response.Code, body.Code, status)
		}
	}
}
