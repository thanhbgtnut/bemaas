// Package server dựng Hertz: `/api/v1/*` cho API, mọi đường dẫn khác phục vụ giao diện React nhúng bằng embed.FS.
package server

import (
	"context"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"bemaas/internal/api"
	"bemaas/internal/auth"
	"bemaas/internal/skillpkg"
)

type Health func(ctx context.Context) map[string]string

// ingest nhận access log OTLP của agentgateway ở /ingest/otlp/v1/logs (xác thực bằng INGEST_TOKEN, không qua Keycloak).
func New(addr string, a *api.API, authn *auth.Authenticator, ingest app.HandlerFunc, static fs.FS, health Health) *server.Hertz {
	h := server.New(
		server.WithHostPorts(addr),
		server.WithMaxRequestBodySize(skillpkg.MaxPackageBytes+1<<20), // gói skill + phần form
	)

	h.GET("/healthz", func(ctx context.Context, c *app.RequestContext) {
		status := health(ctx)
		code := http.StatusOK
		if status["postgres"] != "ok" { // Redis lỗi chỉ làm chậm, không làm hỏng dịch vụ
			code = http.StatusServiceUnavailable
		}
		c.JSON(code, status)
	})

	h.POST("/ingest/otlp/v1/logs", ingest)

	v1 := h.Group("/api/v1")
	a.RegisterPublic(v1)
	a.Register(v1.Group("", authn.Middleware()))

	h.NoRoute(spaHandler(static))
	return h
}

// spaHandler trả tệp tĩnh nếu có; đường dẫn không khớp tệp nào thì trả index.html để React Router xử lý.
// Tệp trong assets/ có mã băm trong tên nên được cache lâu; index.html không cache.
func spaHandler(static fs.FS) app.HandlerFunc {
	index, err := fs.ReadFile(static, "index.html")
	if err != nil {
		index = []byte(`<!doctype html><meta charset="utf-8"><p>Chưa build giao diện: chạy <code>make web</code> rồi build lại binary.</p>`)
	}
	return func(_ context.Context, c *app.RequestContext) {
		p := strings.TrimPrefix(path.Clean(string(c.Path())), "/")
		if strings.HasPrefix(p, "api/") {
			c.JSON(http.StatusNotFound, map[string]string{"code": "NOT_FOUND", "message": "Không có API này"})
			return
		}
		if p != "" && p != "index.html" {
			if b, err := fs.ReadFile(static, p); err == nil {
				ct := mime.TypeByExtension(path.Ext(p))
				if ct == "" {
					ct = http.DetectContentType(b)
				}
				if strings.HasPrefix(p, "assets/") {
					c.Header("Cache-Control", "public, max-age=31536000, immutable")
				}
				c.Data(http.StatusOK, ct, b)
				return
			}
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", index)
	}
}
