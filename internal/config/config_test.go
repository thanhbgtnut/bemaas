package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadExpandsEnv(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	envPath := filepath.Join(dir, ".env")
	os.WriteFile(cfgPath, []byte(`
# ${KHONG_THAY_TRONG_CHU_THICH}
server:
  addr: ${ADDR:-:8080}
  timezone: Asia/Ho_Chi_Minh
  platform_admins: ${ADMINS}
database:
  host: ${DB_HOST}
  port: ${DB_PORT:-5432}
  user: bemaas
  password: ${DB_PASSWORD}
  name: bemaas
  sslmode: disable
redis:
  addr: ${REDIS_ADDR:-localhost:6380}
  prefix: ${REDIS_PREFIX:-bemaas:}
s3: {endpoint: "localhost:9000", bucket: b}
oidc: {issuer: "http://kc/realms/maas", client_id: web}
gateway:
  key_env: test
  sync:
    mode: ${SYNC_MODE:-log}
    interval: ${SYNC_INTERVAL:-30s}
    kube:
      token: ${KUBE_TOKEN}
ingest: {token: t, attrs: {key_id: apiKey.key_id, model: gen_ai.request.model}}
jobs: {enforcer_interval: 1m, mcp_scan_interval: 5m}
`), 0o600)
	os.WriteFile(envPath, []byte("DB_HOST=db.local\nDB_PASSWORD=p@ss:w#rd\nADMINS=a@x, b@x\n"), 0o600)
	t.Setenv("DB_PORT", "6543") // biến có sẵn được ưu tiên hơn .env và mặc định

	cfg, err := Load(cfgPath, envPath)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Addr != ":8080" || cfg.Database.Host != "db.local" || cfg.Database.Port != 6543 {
		t.Fatalf("sai giá trị: %+v %+v", cfg.Server, cfg.Database)
	}
	if cfg.Database.Password != "p@ss:w#rd" {
		t.Fatalf("mật khẩu ký tự đặc biệt bị hỏng: %q", cfg.Database.Password)
	}
	if want := "postgres://bemaas:p%40ss%3Aw%23rd@db.local:6543/bemaas?sslmode=disable"; cfg.Database.DSN() != want {
		t.Fatalf("DSN = %s", cfg.Database.DSN())
	}
	if len(cfg.Server.PlatformAdmins) != 2 || cfg.Server.PlatformAdmins[1] != "b@x" {
		t.Fatalf("platform_admins = %v", cfg.Server.PlatformAdmins)
	}
	if cfg.Redis.Addr != "localhost:6380" || cfg.Redis.Prefix != "bemaas:" {
		t.Fatalf("giá trị mặc định có dấu : bị hỏng: %+v", cfg.Redis)
	}
	if cfg.Gateway.Sync.Interval != 30*time.Second || cfg.Gateway.Sync.Mode != "log" {
		t.Fatalf("sync = %+v", cfg.Gateway.Sync)
	}
}

func TestLoadReportsMissingEnv(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	os.WriteFile(cfgPath, []byte("server: {addr: ':8080'}\ndatabase: {host: '${CHUA_DAT_DB_HOST}'}\n"), 0o600)
	_, err := Load(cfgPath, "")
	if err == nil || !strings.Contains(err.Error(), "CHUA_DAT_DB_HOST") {
		t.Fatalf("cần báo tên biến chưa đặt, err = %v", err)
	}
}
