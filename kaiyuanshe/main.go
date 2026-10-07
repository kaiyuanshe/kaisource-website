package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"kaiyuanshe/config"
	"kaiyuanshe/logger"
	"kaiyuanshe/middlewares"
	"kaiyuanshe/models"
	"kaiyuanshe/routes"
	"kaiyuanshe/scheduler"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	mode := flag.String("mode", "serve", "serve, migrate, migrate-auth, seed, stats, or cleanup")
	flag.Parse()
	if *mode != "serve" && *mode != "migrate" && *mode != "migrate-auth" && *mode != "seed" && *mode != "stats" && *mode != "cleanup" {
		return errors.New("invalid mode")
	}
	if err := config.Load(); err != nil {
		return err
	}
	if *mode == "serve" {
		if err := config.ValidateRuntime(); err != nil {
			return err
		}
	}
	if err := config.ConnectDB(); err != nil {
		return err
	}
	models.BindDatabase(config.DB)
	pool, err := config.DB.DB()
	if err != nil {
		return errors.New("database pool unavailable")
	}
	defer pool.Close()
	switch *mode {
	case "migrate-auth":
		if err := models.MigrateAuthenticationSchema(); err != nil {
			return errors.New("authentication schema migration failed; inspect database diagnostics")
		}
		return nil
	case "migrate":
		if err := models.MigrateSchema(); err != nil {
			return errors.New("schema migration failed; inspect database diagnostics")
		}
		return nil
	case "seed":
		if err := models.InitRolesAndPermissions(); err != nil {
			return errors.New("permission initialization failed")
		}
		if err := models.InitCategories(); err != nil {
			return errors.New("category initialization failed")
		}
		return nil
	case "stats":
		if err := models.CollectDailyStats(); err != nil {
			return errors.New("daily statistics task failed")
		}
		return nil
	case "cleanup":
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := models.PruneAuthenticationState(ctx); err != nil {
			return errors.New("authentication state cleanup failed")
		}
		return nil
	}
	if err := models.ValidateAuthenticationSchema(); err != nil {
		return err
	}
	// 初始化日志
	logFile := viper.GetString("log.file")
	logLevel := viper.GetString("log.level")
	logger.Init(logFile, logLevel)

	// There must be one scheduler owner. Vercel instances never start cron loops.
	if viper.GetBool("scheduler.enabled") && os.Getenv("VERCEL") == "" {
		job, err := scheduler.StartScheduler()
		if err != nil {
			return err
		}
		defer func() {
			ctx := job.Stop()
			select {
			case <-ctx.Done():
			case <-time.After(10 * time.Second):
			}
		}()
	}

	r := gin.Default()
	if err := r.SetTrustedProxies(viper.GetStringSlice("server.trusted_proxies")); err != nil {
		return errors.New("invalid trusted proxy configuration")
	}
	r.Use(middlewares.Cors())
	routes.SetupRouter(r)
	r.GET("/healthz", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		if err := pool.PingContext(ctx); err != nil {
			c.JSON(503, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(200, gin.H{"status": "ok"})
	})
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{
		Addr: fmt.Sprintf(":%d", viper.GetInt("server.port")), Handler: r,
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second,
		WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second,
	}
	result := make(chan error, 1)
	go func() { result <- server.ListenAndServe() }()
	select {
	case err := <-result:
		if !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP server failed")
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			_ = server.Close()
			return errors.New("HTTP server shutdown timed out")
		}
	}
	return nil
}
