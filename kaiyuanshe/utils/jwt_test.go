package utils

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/spf13/viper"
	"testing"
	"time"
)

func TestJWTUsesExplicitRuntimeKey(t *testing.T) {
	viper.Set("jwt.secret", "runtime-test-key")
	token, err := GenerateToken(42, "test@example.test", "", "tester", "", []string{"article:write"})
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseToken(token)
	if err != nil || claims.Uid != 42 {
		t.Fatal("token roundtrip failed")
	}
	viper.Set("jwt.secret", "different-test-key")
	if _, err := ParseToken(token); err == nil {
		t.Fatal("key was captured at import time")
	}
}

func TestJWTRejectsMissingSecretAndWrongAlgorithm(t *testing.T) {
	viper.Set("jwt.secret", "")
	if _, err := GenerateToken(1, "", "", "", "", nil); err == nil {
		t.Fatal("empty JWT key accepted")
	}
	viper.Set("jwt.secret", "runtime-test-key")
	wrong := jwt.NewWithClaims(jwt.SigningMethodHS384, Claims{Uid: 42, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}})
	encoded, err := wrong.SignedString([]byte("runtime-test-key"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(encoded); err == nil {
		t.Fatal("unexpected JWT algorithm accepted")
	}
}
