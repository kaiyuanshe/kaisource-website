package config

import (
	"errors"
	"net"
	"net/url"
	"strconv"
	"time"

	"github.com/spf13/viper"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	ormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func DatabaseDSN() (string, error) {
	timeout := viper.GetInt("database.connect_timeout_seconds")
	if timeout < 1 || timeout > 60 {
		return "", errors.New("database connect timeout must be between 1 and 60 seconds")
	}
	if dsn := viper.GetString("database.url"); dsn != "" {
		u, err := url.Parse(dsn)
		if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" {
			return "", errors.New("DATABASE_URL must be a PostgreSQL URL")
		}
		// Managed connections default to encrypted transport. Local Unix sockets
		// or localhost can explicitly opt out in an isolated development database.
		q := u.Query()
		if q.Get("sslmode") == "" {
			q.Set("sslmode", "require")
		}
		q.Set("connect_timeout", strconv.Itoa(timeout))
		u.RawQuery = q.Encode()
		return u.String(), nil
	}
	dbHost := viper.GetString("database.host")
	dbPort := viper.GetString("database.port")
	dbUser := viper.GetString("database.user")
	dbPassword := viper.GetString("database.password")
	dbName := viper.GetString("database.dbname")
	dbSsl := viper.GetString("database.sslmode")

	if dbHost == "" || dbUser == "" || dbName == "" {
		return "", errors.New("DATABASE_URL or complete database connection settings are required")
	}
	u := &url.URL{Scheme: "postgresql", Host: net.JoinHostPort(dbHost, dbPort), Path: "/" + dbName, User: url.UserPassword(dbUser, dbPassword)}
	q := u.Query()
	q.Set("sslmode", dbSsl)
	q.Set("connect_timeout", strconv.Itoa(timeout))
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func ConnectDB() error {
	dsn, err := DatabaseDSN()
	if err != nil {
		return err
	}
	maxOpen := viper.GetInt("database.max_open_conns")
	maxIdle := viper.GetInt("database.max_idle_conns")
	if maxOpen < 1 || maxIdle < 0 || maxIdle > maxOpen {
		return errors.New("invalid database connection pool limits")
	}
	lifetime := viper.GetInt("database.conn_max_lifetime_seconds")
	if lifetime < 1 {
		return errors.New("database connection lifetime must be positive")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: ormlogger.Default.LogMode(ormlogger.Silent)})
	if err != nil {
		return errors.New("database connection failed; check connectivity and credentials")
	}
	pool, err := db.DB()
	if err != nil {
		return errors.New("database connection pool unavailable")
	}
	pool.SetMaxOpenConns(maxOpen)
	pool.SetMaxIdleConns(maxIdle)
	pool.SetConnMaxLifetime(time.Duration(lifetime) * time.Second)
	DB = db
	return nil
}
