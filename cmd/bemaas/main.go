// Lệnh bemaas chạy toàn bộ nền tảng MaaS trong một binary: API (Hertz), giao diện React nhúng,
// Gateway Sync và Budget Enforcer.
//
//	bemaas                      chạy server (tự chạy migration), đọc ./configs/config.yaml và ./.env
//	bemaas migrate              chỉ chạy migration rồi thoát
//	bemaas -config x.yaml -env y.env
//
// config.yaml chứa chỗ giữ chỗ ${BIẾN}; giá trị lấy từ biến môi trường và tệp .env (xem .env.example).
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/jackc/pgx/v5/pgxpool"
	"gopkg.in/natefinch/lumberjack.v2"

	"bemaas/internal/api"
	"bemaas/internal/auth"
	"bemaas/internal/cache"
	"bemaas/internal/config"
	"bemaas/internal/db"
	"bemaas/internal/gateway"
	"bemaas/internal/ingest"
	"bemaas/internal/jobs"
	"bemaas/internal/mcp"
	"bemaas/internal/server"
	"bemaas/internal/storage"
	"bemaas/internal/webui"
)

func main() {
	if err := run(); err != nil {
		slog.Error("bemaas dừng vì lỗi", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfgPath := flag.String("config", os.Getenv("BEMAAS_CONFIG"), "tệp config YAML (mặc định ./configs/config.yaml)")
	envDefault := os.Getenv("BEMAAS_ENV")
	if envDefault == "" {
		envDefault = ".env"
	}
	envPath := flag.String("env", envDefault, "tệp .env nạp vào biến môi trường (mặc định BEMAAS_ENV hoặc ./.env); biến có sẵn được ưu tiên")
	flag.Parse()

	cfg, err := config.Load(*cfgPath, *envPath)
	if err != nil {
		return err
	}
	loc, err := time.LoadLocation(cfg.Server.Timezone)
	if err != nil {
		return fmt.Errorf("server.timezone: %w", err)
	}
	if cfg.Log.File != "" {
		lj := &lumberjack.Logger{Filename: cfg.Log.File, MaxSize: cfg.Log.MaxSize, MaxAge: cfg.Log.MaxAge, LocalTime: true}
		defer lj.Close()
		out := io.MultiWriter(os.Stdout, lj)
		slog.SetDefault(slog.New(slog.NewTextHandler(out, nil)))
		hlog.SetOutput(out)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var pool *pgxpool.Pool
	if err := retry(ctx, "PostgreSQL", func() (err error) {
		pool, err = db.Open(ctx, cfg.Database)
		return err
	}); err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	if flag.Arg(0) == "migrate" {
		return nil
	}

	rc := cache.New(cfg.Redis)
	defer rc.Close()
	if err := rc.Ping(ctx); err != nil {
		// Redis ngừng thì vẫn chạy được, chỉ chậm hơn (mục 15).
		slog.Warn("không kết nối được Redis, chạy không có cache", "err", err)
	}

	files, err := storage.New(cfg.S3)
	if err != nil {
		return err
	}
	if err := retry(ctx, "S3", func() error { return files.EnsureBucket(ctx) }); err != nil {
		return err
	}

	var authn *auth.Authenticator
	if err := retry(ctx, "Keycloak", func() (err error) {
		authn, err = auth.New(ctx, cfg.OIDC, cfg.Server.PlatformAdmins, pool, rc)
		return err
	}); err != nil {
		return err
	}

	syncer, err := gateway.NewSyncer(cfg.Gateway.Sync, pool, rc)
	if err != nil {
		return err
	}
	go syncer.Run(ctx)
	go jobs.NewEnforcer(pool, rc, syncer, loc, cfg.Jobs.EnforcerInterval).Run(ctx)
	go mcp.RunScanner(ctx, pool, cfg.Jobs.MCPScanInterval, func(ctx context.Context) (func(), bool) {
		return rc.TryLock(ctx, "mcp-scan", cfg.Jobs.MCPScanInterval)
	}, syncer.Trigger)
	ingester := ingest.New(pool, cfg.Ingest.Attrs, loc)

	health := func(ctx context.Context) map[string]string {
		out := map[string]string{"postgres": "ok", "redis": "ok"}
		if err := pool.Ping(ctx); err != nil {
			out["postgres"] = err.Error()
		}
		if err := rc.Ping(ctx); err != nil {
			out["redis"] = "degraded: " + err.Error() // vẫn phục vụ được, chỉ không có cache
		}
		return out
	}

	h := server.New(cfg.Server.Addr, api.New(cfg, pool, rc, files, syncer, loc), authn, ingester.Handler(cfg.Ingest.Token), webui.Dist(), health)
	slog.Info("bemaas đang chạy", "addr", cfg.Server.Addr)
	h.Spin() // tự dừng êm khi nhận SIGINT/SIGTERM; ctx cũng bị huỷ nên các job nền dừng theo
	return nil
}

// retry thử lại kết nối tới dịch vụ phụ thuộc trong khoảng 60 giây lúc khởi động,
// để không phải canh thứ tự bật container (S3, Keycloak thường sẵn sàng chậm hơn).
func retry(ctx context.Context, name string, fn func() error) error {
	deadline := time.Now().Add(60 * time.Second)
	for {
		err := fn()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		slog.Warn("chưa kết nối được, thử lại sau 2 giây", "service", name, "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}
