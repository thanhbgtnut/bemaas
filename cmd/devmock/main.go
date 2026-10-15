// Lệnh devmock CHỈ DÙNG Ở MÁY LOCAL: giả lập các hệ thống bên ngoài để chạy thử trọn vòng MaaS
// mà không cần cụm agentgateway thật.
//
//	:8090  agentgateway giả: xác thực API key (đọc mã băm trong CSDL, như gateway đọc ConfigMap),
//	       chặn model đang tắt hoặc không có trong key, trả lời theo các chuẩn ở internal/standard
//	       (OpenAI, Anthropic, SystemOne, TurboOCR, MinerU), rồi gửi access log OTLP về Ingester của bemaas
//	       như gateway thật.
//	:8092  MCP server giả (Streamable HTTP ở /mcp): vài tool chỉ đọc và một tool ghi dữ liệu.
//
// Câu trả lời của model là dữ liệu mẫu. Không triển khai lệnh này lên môi trường thật.
package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"time"

	"bemaas/internal/config"
	"bemaas/internal/db"
)

func main() {
	cfgPath := flag.String("config", "", "tệp config YAML (mặc định ./config.yaml)")
	envPath := flag.String("env", ".env", "tệp .env")
	bemaas := flag.String("bemaas", "http://localhost:8080", "địa chỉ bemaas để gửi access log")
	flag.Parse()

	cfg, err := config.Load(*cfgPath, *envPath)
	if err != nil {
		slog.Error("đọc config", "err", err)
		os.Exit(1)
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, cfg.Database)
	if err != nil {
		slog.Error("kết nối CSDL", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	gw := &gateway{db: pool, ingestURL: *bemaas + "/ingest/otlp/v1/logs", ingestToken: cfg.Ingest.Token, attrs: cfg.Ingest.Attrs}
	servers := map[string]http.Handler{
		":8090": cors(gw.routes()),
		":8092": mcpRoutes(),
	}
	for addr, h := range servers {
		go func(addr string, h http.Handler) {
			srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}
			slog.Info("devmock đang chạy", "addr", addr)
			if err := srv.ListenAndServe(); err != nil {
				slog.Error("devmock dừng", "addr", addr, "err", err)
				os.Exit(1)
			}
		}(addr, h)
	}
	select {}
}

// cors: Playground trên trình duyệt gọi thẳng gateway (P9), nên gateway phải cho phép origin của MaaS.
// Gateway thật cấu hình CORS bằng policy của agentgateway.
func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Api-Key, Anthropic-Version")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}
