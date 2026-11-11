package controllers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func TestOAuthFailureNeverCreatesZeroIdentity(t *testing.T) {
	for _, emptyToken := range []bool{true, false} {
		t.Run(map[bool]string{true: "empty token", false: "invalid identity"}[emptyToken], func(t *testing.T) {
			profileCalls := 0
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/token" {
					if emptyToken {
						io.WriteString(w, `{"error":"bad_verification_code"}`)
					} else {
						io.WriteString(w, `{"access_token":"fixture"}`)
					}
				} else {
					profileCalls++
					body, _ := io.ReadAll(r.Body)
					if len(body) != 0 {
						t.Error("profile GET leaked token-exchange body")
					}
					io.WriteString(w, `{"message":"Bad credentials"}`)
				}
			}))
			defer provider.Close()
			viper.Set("oauth.accessApi", provider.URL+"/token")
			viper.Set("oauth.getUser", provider.URL+"/user")
			t.Cleanup(viper.Reset)
			router := gin.New()
			router.POST("/login", HandleLogin)
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest("POST", "/login", strings.NewReader(`{"code":"fixture"}`))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)
			if recorder.Code != 401 {
				t.Fatalf("provider failure not rejected before DB: %d", recorder.Code)
			}
			if emptyToken && profileCalls != 0 {
				t.Fatal("empty token used for profile request")
			}
		})
	}
}
