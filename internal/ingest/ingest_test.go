package ingest

import (
	"testing"

	common "go.opentelemetry.io/proto/otlp/common/v1"
	logs "go.opentelemetry.io/proto/otlp/logs/v1"

	"bemaas/internal/config"
)

var attrs = config.IngestAttrs{
	RequestID: "request.id", KeyID: "apiKey.key_id", DeptID: "apiKey.dept_id", Model: "gen_ai.request.model",
	InputTokens: "gen_ai.usage.input_tokens", CacheTokens: "gen_ai.usage.cache_read_input_tokens", OutputTokens: "gen_ai.usage.output_tokens",
	Pages: "agw.ai.usage.pages", Cost: "agw.ai.usage.cost.total", Status: "http.status", MCPTarget: "mcp.target", MCPTool: "mcp.tool.name",
}

func str(k, v string) *common.KeyValue {
	return &common.KeyValue{Key: k, Value: &common.AnyValue{Value: &common.AnyValue_StringValue{StringValue: v}}}
}

func num(k string, v int64) *common.KeyValue {
	return &common.KeyValue{Key: k, Value: &common.AnyValue{Value: &common.AnyValue_IntValue{IntValue: v}}}
}

func TestExtractAttributes(t *testing.T) {
	in := &Ingester{attrs: attrs}
	ev, ok := in.extract(&logs.LogRecord{TimeUnixNano: 1_700_000_000_000_000_000, Attributes: []*common.KeyValue{
		str("request.id", "r1"), str("apiKey.key_id", "k1"), str("gen_ai.request.model", "llm-noi-bo"),
		num("gen_ai.usage.input_tokens", 120), num("gen_ai.usage.output_tokens", 30),
		{Key: "agw.ai.usage.cost.total", Value: &common.AnyValue{Value: &common.AnyValue_DoubleValue{DoubleValue: 0.0125}}},
	}}, map[string]string{})
	if !ok || ev.RequestID != "r1" || ev.KeyID != "k1" || ev.InputTokens != 120 || ev.OutputTokens != 30 {
		t.Fatalf("sai: %+v", ev)
	}
	if ev.Cost == nil || ev.Cost.String() != "0.0125" {
		t.Fatalf("cost = %v", ev.Cost)
	}
}

func TestExtractFromKVBodyAndFallbackID(t *testing.T) {
	in := &Ingester{attrs: attrs}
	rec := &logs.LogRecord{TimeUnixNano: 42, Body: &common.AnyValue{Value: &common.AnyValue_StringValue{
		StringValue: `apiKey.key_id=k2 gen_ai.request.model="cppd-ocr" agw.ai.usage.pages=3`}}}
	ev, ok := in.extract(rec, map[string]string{})
	if !ok || ev.KeyID != "k2" || ev.Model != "cppd-ocr" || ev.Pages != 3 {
		t.Fatalf("sai: %+v", ev)
	}
	again, _ := in.extract(rec, map[string]string{})
	if ev.RequestID == "" || ev.RequestID != again.RequestID {
		t.Fatalf("request id thay thế phải ổn định để chống đếm trùng: %q %q", ev.RequestID, again.RequestID)
	}
}

func TestSkipWithoutKey(t *testing.T) {
	in := &Ingester{attrs: attrs}
	if _, ok := in.extract(&logs.LogRecord{Attributes: []*common.KeyValue{str("gen_ai.request.model", "x")}}, nil); ok {
		t.Fatal("bản ghi không có key phải bị bỏ qua")
	}
}

func TestStripPrefix(t *testing.T) {
	if got := stripPrefix("ho-so_tim_ho_so", "ho-so"); got != "tim_ho_so" {
		t.Fatal(got)
	}
	if got := stripPrefix("tim_ho_so", "ho-so"); got != "tim_ho_so" {
		t.Fatal(got)
	}
}
