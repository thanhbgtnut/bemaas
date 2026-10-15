package ingest

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/subtle"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	logs "go.opentelemetry.io/proto/otlp/logs/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Handler nhận POST /ingest/otlp/v1/logs theo OTLP/HTTP, mã hoá protobuf hoặc JSON, có thể nén gzip.
// Xác thực bằng bearer token cấu hình trong INGEST_TOKEN.
func (in *Ingester) Handler(token string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		got, _ := strings.CutPrefix(string(c.GetHeader("Authorization")), "Bearer ")
		if token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		body := c.Request.Body()
		if strings.EqualFold(string(c.GetHeader("Content-Encoding")), "gzip") {
			zr, err := gzip.NewReader(bytes.NewReader(body))
			if err != nil {
				c.AbortWithStatus(http.StatusBadRequest)
				return
			}
			if body, err = io.ReadAll(io.LimitReader(zr, 64<<20)); err != nil {
				c.AbortWithStatus(http.StatusBadRequest)
				return
			}
		}
		req := &logs.LogsData{}
		isJSON := strings.HasPrefix(string(c.ContentType()), "application/json")
		var err error
		if isJSON {
			err = protojson.UnmarshalOptions{DiscardUnknown: true}.Unmarshal(body, req)
		} else {
			err = proto.Unmarshal(body, req)
		}
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		res, err := in.Ingest(ctx, req)
		if err != nil {
			slog.Error("ingest lỗi", "err", err)
			// 503 để exporter thử gửi lại; request_id chống đếm trùng nên gửi lại an toàn.
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		slog.Debug("ingest", "records", res.Records, "usage", res.Usage, "tools", res.Tools, "duplicates", res.Duplicates, "skipped", res.Skipped)
		// ExportLogsServiceResponse rỗng: JSON là {}, protobuf là 0 byte.
		if isJSON {
			c.Data(http.StatusOK, "application/json", []byte("{}"))
			return
		}
		c.Data(http.StatusOK, "application/x-protobuf", nil)
	}
}
