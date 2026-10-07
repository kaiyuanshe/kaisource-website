package models

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/viper"
)

var ErrInvalidCaptcha = errors.New("captcha is invalid or expired")

// Only keyed answer/email digests and random proof hashes are persisted. These
// records belong to the same database as users, never an instance-local cache.
type CaptchaChallenge struct {
	ID         string    `gorm:"primaryKey;size:32"`
	AnswerHash []byte    `gorm:"not null"`
	ExpiresAt  time.Time `gorm:"index;not null"`
}

type RegistrationProof struct {
	ID        string    `gorm:"primaryKey;size:32"`
	TokenHash []byte    `gorm:"not null"`
	EmailHash []byte    `gorm:"not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
}

type AuthRateBucket struct {
	ID        string    `gorm:"primaryKey;size:64"`
	Count     int       `gorm:"not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
}

func ValidateAuthenticationSchema() error {
	if db == nil {
		return errors.New("database is not initialized")
	}
	for _, model := range []interface{}{&CaptchaChallenge{}, &RegistrationProof{}, &AuthRateBucket{}} {
		if !db.Migrator().HasTable(model) {
			return errors.New("authentication schema is not installed; complete the reviewed migration before serving")
		}
	}
	return nil
}

// A focused operator command for this additive release. Existing account,
// article, event and permission models are not part of this migration.
func MigrateAuthenticationSchema() error {
	return db.AutoMigrate(&CaptchaChallenge{}, &RegistrationProof{}, &AuthRateBucket{})
}

func authDigest(purpose, value string) ([]byte, error) {
	secret := viper.GetString("jwt.secret")
	if secret == "" {
		return nil, errors.New("authentication state signing is not configured")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("kaisource-auth-state-v1\x00" + purpose + "\x00" + value))
	return mac.Sum(nil), nil
}

func randomHex(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func validHex(value string, size int) bool {
	if len(value) != size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func CreateCaptchaChallenge(ctx context.Context, answer string) (string, error) {
	id, err := randomHex(16)
	if err != nil {
		return "", err
	}
	digest, err := authDigest("answer:"+id, strings.ToUpper(answer))
	if err != nil {
		return "", err
	}
	challenge := CaptchaChallenge{ID: id, AnswerHash: digest, ExpiresAt: time.Now().Add(5 * time.Minute)}
	return id, db.WithContext(ctx).Create(&challenge).Error
}

// DELETE RETURNING ensures that attempts handled by different instances cannot
// reuse a challenge. A wrong answer also consumes it and requires a refresh.
func VerifyCaptchaChallenge(ctx context.Context, id, answer, email string) (string, error) {
	if !validHex(id, 16) || len(answer) > 16 {
		return "", ErrInvalidCaptcha
	}
	var challenge CaptchaChallenge
	result := db.WithContext(ctx).Raw("DELETE FROM captcha_challenges WHERE id = ? AND expires_at > ? RETURNING *", id, time.Now()).Scan(&challenge)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected != 1 {
		return "", ErrInvalidCaptcha
	}
	digest, err := authDigest("answer:"+id, strings.ToUpper(strings.TrimSpace(answer)))
	if err != nil {
		return "", err
	}
	if !hmac.Equal(challenge.AnswerHash, digest) {
		return "", ErrInvalidCaptcha
	}
	proofID, err := randomHex(16)
	if err != nil {
		return "", err
	}
	value, err := randomHex(32)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(value))
	emailHash, err := authDigest("email", strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return "", err
	}
	proof := RegistrationProof{ID: proofID, TokenHash: hash[:], EmailHash: emailHash, ExpiresAt: time.Now().Add(2 * time.Minute)}
	if err := db.WithContext(ctx).Create(&proof).Error; err != nil {
		return "", err
	}
	return proofID + "." + value, nil
}

// Registration itself must consume the proof, not just trust a browser's
// "verified" flag. The exact email is bound to the proof, including retries.
func ConsumeRegistrationProof(ctx context.Context, token, email string) error {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || !validHex(parts[0], 16) || !validHex(parts[1], 32) {
		return ErrInvalidCaptcha
	}
	hash := sha256.Sum256([]byte(parts[1]))
	emailHash, err := authDigest("email", strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return err
	}
	var proof RegistrationProof
	result := db.WithContext(ctx).Raw("DELETE FROM registration_proofs WHERE id = ? AND token_hash = ? AND email_hash = ? AND expires_at > ? RETURNING id", parts[0], hash[:], emailHash, time.Now()).Scan(&proof)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrInvalidCaptcha
	}
	return nil
}

// An atomic upsert enforces one allowance across concurrent serverless
// instances. No sleep, process-local counter, or independently editable store.
func TakeAuthRateLimit(ctx context.Context, scope, subject string, limit int, window time.Duration, now time.Time) (bool, error) {
	if limit < 1 || window < time.Second {
		return false, errors.New("invalid rate limit configuration")
	}
	start := now.Unix() / int64(window/time.Second) * int64(window/time.Second)
	digest, err := authDigest("rate:"+scope, subject+"\x00"+strconv.FormatInt(start, 10))
	if err != nil {
		return false, err
	}
	var bucket AuthRateBucket
	result := db.WithContext(ctx).Raw(`INSERT INTO auth_rate_buckets (id, count, expires_at) VALUES (?, 1, ?)
		ON CONFLICT (id) DO UPDATE SET count = auth_rate_buckets.count + 1
		WHERE auth_rate_buckets.count < ? RETURNING count`, hex.EncodeToString(digest), time.Unix(start, 0).Add(window), limit).Scan(&bucket)
	return result.RowsAffected == 1, result.Error
}

// Explicit operator task; serving requests never migrates or starts a cleanup
// scheduler. The designated scheduler owner should invoke this periodically.
func PruneAuthenticationState(ctx context.Context) error {
	for _, model := range []interface{}{&CaptchaChallenge{}, &RegistrationProof{}, &AuthRateBucket{}} {
		if err := db.WithContext(ctx).Where("expires_at < ?", time.Now()).Delete(model).Error; err != nil {
			return err
		}
	}
	return nil
}
