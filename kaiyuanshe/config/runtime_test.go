package config

import (
	"github.com/spf13/viper"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadWithoutFileHasNoDatabaseSideEffects(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("KAISOURCE_CONFIG_FILE", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("KAISOURCE_JWT_SECRET", "")
	DB = nil
	if err := Load(); err != nil {
		t.Fatal(err)
	}
	if DB != nil {
		t.Fatal("Load must not connect to a database")
	}
	if viper.GetBool("scheduler.enabled") {
		t.Fatal("scheduler must be opt-in")
	}
	if err := ValidateRuntime(); err == nil {
		t.Fatal("missing JWT key accepted")
	}
}

func TestEnvironmentOverridesYAMLAndDSNUsesTLS(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(file, []byte("jwt:\n  secret: local-key\nserver:\n  port: 8080\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KAISOURCE_CONFIG_FILE", file)
	t.Setenv("JWT_SECRET", "test-key")
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost:5432/isolated")
	t.Setenv("PORT", "3010")
	if err := Load(); err != nil {
		t.Fatal(err)
	}
	if viper.GetString("jwt.secret") != "test-key" || viper.GetInt("server.port") != 3010 {
		t.Fatal("env override failed")
	}
	dsn, err := DatabaseDSN()
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(dsn)
	if u.Query().Get("sslmode") != "require" || u.Query().Get("connect_timeout") != "10" {
		t.Fatal("TLS must be the default")
	}
}

func TestMissingAndMalformedConfigFailWithoutSecrets(t *testing.T) {
	t.Setenv("KAISOURCE_CONFIG_FILE", filepath.Join(t.TempDir(), "missing.yaml"))
	if err := Load(); err == nil {
		t.Fatal("explicit missing config was ignored")
	}
	viper.Reset()
	viper.Set("database.url", "https://user:private-value@invalid/db")
	viper.Set("database.connect_timeout_seconds", 10)
	_, err := DatabaseDSN()
	if err == nil || strings.Contains(err.Error(), "private-value") {
		t.Fatal("unsafe DSN error")
	}
}

func TestConnectionPoolLimitsAreBounded(t *testing.T) {
	viper.Reset()
	viper.Set("database.url", "postgres://test:test@localhost/isolated")
	viper.Set("database.connect_timeout_seconds", 10)
	viper.Set("database.max_open_conns", 0)
	if err := ConnectDB(); err == nil || !strings.Contains(err.Error(), "pool limits") {
		t.Fatal("unbounded pool accepted")
	}
	viper.Set("database.max_open_conns", 5)
	viper.Set("database.max_idle_conns", 1)
	viper.Set("database.conn_max_lifetime_seconds", 0)
	if err := ConnectDB(); err == nil || !strings.Contains(err.Error(), "lifetime") {
		t.Fatal("unbounded connection lifetime accepted")
	}
}

func TestLegacyYAMLDSNHandlesIPv6AndEscapedCredentials(t *testing.T) {
	viper.Reset()
	viper.Set("database.host", "::1")
	viper.Set("database.port", "5432")
	viper.Set("database.user", "local user")
	viper.Set("database.password", "test @password:with/symbols")
	viper.Set("database.dbname", "isolated")
	viper.Set("database.sslmode", "disable")
	viper.Set("database.connect_timeout_seconds", 10)
	dsn, err := DatabaseDSN()
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "::1" || u.User.Username() != "local user" {
		t.Fatal("legacy connection settings were not encoded correctly")
	}
	password, _ := u.User.Password()
	if password != "test @password:with/symbols" || u.Query().Get("sslmode") != "disable" {
		t.Fatal("explicit local SSL mode and credentials were not preserved")
	}
}

func TestInvalidRuntimePortAndConnectionTimeoutAreRejected(t *testing.T) {
	viper.Reset()
	viper.Set("jwt.secret", "runtime-test-key")
	viper.Set("server.port", 65536)
	if err := ValidateRuntime(); err == nil {
		t.Fatal("invalid port accepted")
	}
	viper.Set("database.connect_timeout_seconds", 0)
	if _, err := DatabaseDSN(); err == nil {
		t.Fatal("unbounded connection timeout accepted")
	}
}
