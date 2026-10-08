package config

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// Load reads configuration only. Importing this package never opens a database
// connection, runs migrations, or sends email. YAML remains optional for Azure.
func Load() error {
	viper.Reset()
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.SetEnvPrefix("KAISOURCE")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.trusted_proxies", []string{"127.0.0.1", "::1"})
	viper.SetDefault("database.port", 5432)
	viper.SetDefault("database.sslmode", "require")
	viper.SetDefault("database.max_open_conns", 5)
	viper.SetDefault("database.max_idle_conns", 1)
	viper.SetDefault("database.conn_max_lifetime_seconds", 300)
	viper.SetDefault("database.connect_timeout_seconds", 10)
	viper.SetDefault("log.level", "info")
	viper.SetDefault("scheduler.enabled", false)
	viper.SetDefault("cron.enabled", false)
	viper.SetDefault("email.timeout", 15)
	for key, names := range map[string][]string{
		"database.url":       {"DATABASE_URL"},
		"jwt.secret":         {"JWT_SECRET"},
		"server.port":        {"PORT"},
		"cron.secret":        {"CRON_SECRET"},
		"email.redirectUrl":  {"EMAIL_REDIRECT_URL"},
		"oauth.clientId":     {"GITHUB_CLIENT_ID"},
		"oauth.clientSecret": {"GITHUB_CLIENT_SECRET"},
	} {
		prefixed := "KAISOURCE_" + strings.ToUpper(strings.ReplaceAll(key, ".", "_"))
		if err := viper.BindEnv(append([]string{key, prefixed}, names...)...); err != nil {
			return fmt.Errorf("invalid environment binding for %s", key)
		}
	}
	if file := os.Getenv("KAISOURCE_CONFIG_FILE"); file != "" {
		viper.SetConfigFile(file)
	}
	if err := viper.ReadInConfig(); err != nil {
		var missing viper.ConfigFileNotFoundError
		if os.Getenv("KAISOURCE_CONFIG_FILE") != "" || !errors.As(err, &missing) {
			// Parser errors can contain source values: never include them in logs.
			return errors.New("unable to read configuration file")
		}
	}
	InitEmailConfig()
	return nil
}

func ValidateRuntime() error {
	if viper.GetString("jwt.secret") == "" {
		return errors.New("JWT_SECRET or jwt.secret is required")
	}
	if port := viper.GetInt("server.port"); port < 1 || port > 65535 {
		return errors.New("server port must be between 1 and 65535")
	}
	if viper.GetBool("cron.enabled") && viper.GetBool("scheduler.enabled") {
		return errors.New("choose one scheduler owner: cron or the legacy scheduler, not both")
	}
	if viper.GetBool("cron.enabled") && strings.TrimSpace(viper.GetString("cron.secret")) == "" {
		return errors.New("CRON_SECRET is required when cron jobs are enabled")
	}
	return nil
}
