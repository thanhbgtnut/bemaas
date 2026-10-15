// Package ingest là Ingester (mục 10.2): nhận access log OTLP/HTTP của agentgateway,
// ghi mỗi lời gọi model thành một usage_event và cộng dồn vào usage_month; lời gọi tool MCP
// cộng vào mcp_tool_usage. request_id duy nhất nên nạp lại log không bị đếm trùng.
package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	common "go.opentelemetry.io/proto/otlp/common/v1"
	logs "go.opentelemetry.io/proto/otlp/logs/v1"

	"bemaas/internal/config"
)

type Ingester struct {
	db    *pgxpool.Pool
	attrs config.IngestAttrs
	loc   *time.Location
}

func New(db *pgxpool.Pool, attrs config.IngestAttrs, loc *time.Location) *Ingester {
	return &Ingester{db: db, attrs: attrs, loc: loc}
}

type Result struct {
	Records    int `json:"records"`
	Usage      int `json:"usage_events"`
	Tools      int `json:"tool_calls"`
	Skipped    int `json:"skipped"`
	Duplicates int `json:"duplicates"`
}

// Event là một lời gọi đã trích từ log.
type Event struct {
	RequestID    string
	TS           time.Time
	KeyID        string
	Model        string
	InputTokens  int64
	CacheTokens  int64
	OutputTokens int64
	Pages        int64
	Cost         *decimal.Decimal // nil: gateway không ghi chi phí, tự tính từ bảng giá
	Status       int
	MCPTarget    string
	MCPTool      string
}

// Ingest xử lý một lô log. LogsData có cùng định dạng (cả protobuf lẫn JSON) với ExportLogsServiceRequest
// của OTLP, dùng nó để không phải kéo theo gói gRPC của collector.
func (in *Ingester) Ingest(ctx context.Context, req *logs.LogsData) (Result, error) {
	var res Result
	for _, rl := range req.GetResourceLogs() {
		resAttrs := attrMap(rl.GetResource().GetAttributes())
		for _, sl := range rl.GetScopeLogs() {
			for _, rec := range sl.GetLogRecords() {
				res.Records++
				ev, ok := in.extract(rec, resAttrs)
				if !ok {
					res.Skipped++
					continue
				}
				kind, err := in.store(ctx, ev)
				if err != nil {
					return res, err
				}
				switch kind {
				case "usage":
					res.Usage++
				case "tool":
					res.Tools++
				case "duplicate":
					res.Duplicates++
				default:
					res.Skipped++
				}
			}
		}
	}
	return res, nil
}

func (in *Ingester) extract(rec *logs.LogRecord, resAttrs map[string]string) (Event, bool) {
	a := attrMap(rec.GetAttributes())
	// Access log dạng chuỗi key=value (stdout của agentgateway) thì đọc thêm từ body.
	if body := rec.GetBody().GetStringValue(); body != "" {
		for k, v := range parseKV(body) {
			if _, ok := a[k]; !ok {
				a[k] = v
			}
		}
	}
	get := func(name string) string {
		if name == "" {
			return ""
		}
		if v, ok := a[name]; ok {
			return v
		}
		return resAttrs[name]
	}
	ev := Event{
		RequestID:    get(in.attrs.RequestID),
		KeyID:        get(in.attrs.KeyID),
		Model:        get(in.attrs.Model),
		InputTokens:  toInt(get(in.attrs.InputTokens)),
		CacheTokens:  toInt(get(in.attrs.CacheTokens)),
		OutputTokens: toInt(get(in.attrs.OutputTokens)),
		Pages:        toInt(get(in.attrs.Pages)),
		Status:       int(toInt(get(in.attrs.Status))),
		MCPTarget:    get(in.attrs.MCPTarget),
		MCPTool:      get(in.attrs.MCPTool),
	}
	if c := get(in.attrs.Cost); c != "" {
		if d, err := decimal.NewFromString(c); err == nil {
			ev.Cost = &d
		}
	}
	ts := rec.GetTimeUnixNano()
	if ts == 0 {
		ts = rec.GetObservedTimeUnixNano()
	}
	ev.TS = time.Unix(0, int64(ts))
	if ts == 0 {
		ev.TS = time.Now()
	}
	if ev.KeyID == "" {
		return ev, false // không có key: không thuộc về ai, bỏ qua
	}
	if ev.RequestID == "" {
		// Không có request id thì lấy mã băm của bản ghi; cùng bản ghi nạp lại vẫn ra cùng id.
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d|%s|%s|%x", ts, ev.KeyID, ev.Model, rec.GetTraceId())))
		ev.RequestID = "h:" + hex.EncodeToString(sum[:16])
	}
	return ev, true
}

// store ghi một sự kiện. Trả "usage", "tool", "duplicate" hoặc "skip".
func (in *Ingester) store(ctx context.Context, ev Event) (string, error) {
	kind := "skip"
	err := pgx.BeginFunc(ctx, in.db, func(tx pgx.Tx) error {
		var deptID string
		if err := tx.QueryRow(ctx, `SELECT department_id::text FROM api_key WHERE id::text = $1`, ev.KeyID).Scan(&deptID); err != nil {
			if err == pgx.ErrNoRows {
				slog.Warn("ingest: key không có trong CSDL, bỏ qua", "key_id", ev.KeyID)
				return nil
			}
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE api_key SET last_used_at = GREATEST(COALESCE(last_used_at, $2), $2) WHERE id::text = $1`, ev.KeyID, ev.TS); err != nil {
			return err
		}

		if ev.MCPTool != "" {
			errs := 0
			if ev.Status >= 400 {
				errs = 1
			}
			day := ev.TS.In(in.loc).Format("2006-01-02")
			// Chống đếm trùng lời gọi tool bằng chính bảng usage_event? Không: tool không tính tiền.
			// Dùng khoá request_id trong bảng phụ ingest_seen để không cộng hai lần.
			tag, err := tx.Exec(ctx, `INSERT INTO ingest_seen (request_id) VALUES ($1) ON CONFLICT DO NOTHING`, ev.RequestID)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				kind = "duplicate"
				return nil
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO mcp_tool_usage (period, server_id, tool_name, key_id, department_id, calls, errors)
				VALUES ($1::date, $2, $3, $4::uuid, $5::uuid, 1, $6)
				ON CONFLICT (period, server_id, tool_name, key_id)
				DO UPDATE SET calls = mcp_tool_usage.calls + 1, errors = mcp_tool_usage.errors + EXCLUDED.errors`,
				day, ev.MCPTarget, stripPrefix(ev.MCPTool, ev.MCPTarget), ev.KeyID, deptID, errs)
			kind = "tool"
			return err
		}

		if ev.Model == "" {
			return nil
		}
		cost := ev.Cost
		if cost == nil {
			c, err := priceOf(ctx, tx, ev)
			if err != nil {
				return err
			}
			cost = &c
		}
		tag, err := tx.Exec(ctx, `
			INSERT INTO usage_event (request_id, ts, key_id, department_id, model_id, input_tokens, cache_tokens, output_tokens, pages, cost_usd)
			VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10) ON CONFLICT (request_id) DO NOTHING`,
			ev.RequestID, ev.TS, ev.KeyID, deptID, ev.Model, ev.InputTokens, ev.CacheTokens, ev.OutputTokens, ev.Pages, cost.Round(6))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			kind = "duplicate"
			return nil
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO usage_month (period, key_id, department_id, model_id, requests, input_tokens, cache_tokens, output_tokens, pages, cost_usd)
			VALUES ($1, $2::uuid, $3::uuid, $4, 1, $5, $6, $7, $8, $9)
			ON CONFLICT (period, key_id, model_id) DO UPDATE SET
			  requests = usage_month.requests + 1,
			  input_tokens = usage_month.input_tokens + EXCLUDED.input_tokens,
			  cache_tokens = usage_month.cache_tokens + EXCLUDED.cache_tokens,
			  output_tokens = usage_month.output_tokens + EXCLUDED.output_tokens,
			  pages = usage_month.pages + EXCLUDED.pages,
			  cost_usd = usage_month.cost_usd + EXCLUDED.cost_usd`,
			ev.TS.In(in.loc).Format("2006-01"), ev.KeyID, deptID, ev.Model, ev.InputTokens, ev.CacheTokens, ev.OutputTokens, ev.Pages, cost.Round(6))
		kind = "usage"
		return err
	})
	return kind, err
}

// priceOf tính chi phí từ bảng giá khi log không có agw.ai.usage.cost.total.
// Token input đã cache tính theo giá cache_read, phần còn lại theo giá input.
func priceOf(ctx context.Context, tx pgx.Tx, ev Event) (decimal.Decimal, error) {
	var in, out, cache, page decimal.Decimal
	err := tx.QueryRow(ctx, `SELECT input, output, cache_read, per_page FROM model_price WHERE model_id = $1`, ev.Model).
		Scan(&in, &out, &cache, &page)
	if err == pgx.ErrNoRows {
		return decimal.Zero, nil
	}
	if err != nil {
		return decimal.Zero, err
	}
	million := decimal.NewFromInt(1_000_000)
	uncached := ev.InputTokens - ev.CacheTokens
	if uncached < 0 {
		uncached = 0
	}
	return decimal.NewFromInt(uncached).Mul(in).
		Add(decimal.NewFromInt(ev.CacheTokens).Mul(cache)).
		Add(decimal.NewFromInt(ev.OutputTokens).Mul(out)).
		Div(million).
		Add(decimal.NewFromInt(ev.Pages).Mul(page)), nil
}

func stripPrefix(tool, target string) string {
	if target != "" {
		if t, ok := strings.CutPrefix(tool, target+"_"); ok {
			return t
		}
	}
	return tool
}

func attrMap(kvs []*common.KeyValue) map[string]string {
	m := make(map[string]string, len(kvs))
	for _, kv := range kvs {
		m[kv.GetKey()] = anyString(kv.GetValue())
	}
	return m
}

func anyString(v *common.AnyValue) string {
	switch x := v.GetValue().(type) {
	case *common.AnyValue_StringValue:
		return x.StringValue
	case *common.AnyValue_IntValue:
		return strconv.FormatInt(x.IntValue, 10)
	case *common.AnyValue_DoubleValue:
		return strconv.FormatFloat(x.DoubleValue, 'f', -1, 64)
	case *common.AnyValue_BoolValue:
		return strconv.FormatBool(x.BoolValue)
	}
	return ""
}

// parseKV đọc chuỗi dạng `a=1 b="x y" c=z`.
func parseKV(s string) map[string]string {
	out := map[string]string{}
	for len(s) > 0 {
		s = strings.TrimLeft(s, " ")
		eq := strings.IndexByte(s, '=')
		if eq <= 0 {
			break
		}
		key := s[:eq]
		s = s[eq+1:]
		var val string
		if strings.HasPrefix(s, `"`) {
			end := strings.Index(s[1:], `"`)
			if end < 0 {
				val, s = s[1:], ""
			} else {
				val, s = s[1:end+1], s[end+2:]
			}
		} else {
			sp := strings.IndexByte(s, ' ')
			if sp < 0 {
				val, s = s, ""
			} else {
				val, s = s[:sp], s[sp:]
			}
		}
		out[key] = val
	}
	return out
}

func toInt(s string) int64 {
	if s == "" {
		return 0
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return int64(f)
	}
	return 0
}
