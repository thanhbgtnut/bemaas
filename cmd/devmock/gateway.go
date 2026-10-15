package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"bemaas/internal/config"
)

type gateway struct {
	db          *pgxpool.Pool
	ingestURL   string
	ingestToken string
	attrs       config.IngestAttrs
}

type keyInfo struct {
	ID, DeptID string
	Models     []string
}

func (g *gateway) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/chat/completions", g.chat)
	mux.HandleFunc("POST /v1/completions", g.completion)
	mux.HandleFunc("POST /v1/embeddings", g.embeddings)
	mux.HandleFunc("POST /v1/rerank", g.rerank)
	mux.HandleFunc("POST /v1/messages", g.messages)
	mux.HandleFunc("POST /v1/systemone", g.systemone)
	mux.HandleFunc("POST /turboocr/{model}/ocr/raw", g.turboOCR)
	mux.HandleFunc("POST /mineru/{model}/v1/file_parse", g.mineru)
	mux.HandleFunc("GET /v1/models", g.models)
	return mux
}

func apiError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"message": msg}})
}

// authorize làm việc của policy apiKeyAuthentication + authorization trên gateway:
// chỉ key đang hoạt động mới có trong ConfigMap (cách B ở mục 10.4), model phải đang bật (M7)
// và nằm trong danh sách model của key (K4).
func (g *gateway) authorize(w http.ResponseWriter, r *http.Request, model string) (*keyInfo, bool) {
	secret, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		secret = r.Header.Get("X-Api-Key") // thư viện anthropic gửi key ở x-api-key
	}
	if secret == "" {
		apiError(w, http.StatusUnauthorized, "missing api key")
		return nil, false
	}
	sum := sha256.Sum256([]byte(secret))
	var k keyInfo
	err := g.db.QueryRow(r.Context(), `
		SELECT id::text, department_id::text, allowed_models FROM api_key
		WHERE key_hash = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())`,
		"sha256:"+hex.EncodeToString(sum[:])).Scan(&k.ID, &k.DeptID, &k.Models)
	if err == pgx.ErrNoRows {
		apiError(w, http.StatusUnauthorized, "invalid api key")
		return nil, false
	}
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	var enabled bool
	if err := g.db.QueryRow(r.Context(), `SELECT enabled FROM model WHERE id = $1`, model).Scan(&enabled); err != nil || !enabled || !slices.Contains(k.Models, model) {
		apiError(w, http.StatusForbidden, "authorization failed")
		return nil, false
	}
	return &k, true
}

type usage struct {
	in, cache, out, pages int64
}

func (g *gateway) chat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model         string `json:"model"`
		Stream        bool   `json:"stream"`
		StreamOptions *struct {
			IncludeUsage bool `json:"include_usage"`
		} `json:"stream_options"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		MaxTokens *int `json:"max_tokens"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil || len(req.Messages) == 0 {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	var prompt strings.Builder
	last := ""
	sys := ""
	for _, m := range req.Messages {
		prompt.WriteString(m.Content)
		if m.Role == "user" {
			last = m.Content
		}
		if m.Role == "system" {
			sys = m.Content
		}
	}
	answer := mockAnswer(req.Model, last, sys)
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		answer = truncateTokens(answer, *req.MaxTokens)
	}
	u := usage{in: tokens(prompt.String()) + 8, out: tokens(answer)}
	if len(req.Messages) > 2 {
		u.cache = u.in / 3 // giả lập prompt cache cho hội thoại nhiều lượt
	}
	id := "chatcmpl-" + uuid.NewString()[:12]
	reqID := uuid.NewString()

	if req.Stream {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		flusher, _ := w.(http.Flusher)
		time.Sleep(latency(req.Model))
		words := strings.SplitAfter(answer, " ")
		for i := 0; i < len(words); i += 2 {
			chunk := strings.Join(words[i:min(i+2, len(words))], "")
			writeSSE(w, map[string]any{"id": id, "object": "chat.completion.chunk", "model": req.Model,
				"choices": []any{map[string]any{"index": 0, "delta": map[string]string{"content": chunk}}}})
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(25 * time.Millisecond)
		}
		final := map[string]any{"id": id, "object": "chat.completion.chunk", "model": req.Model,
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}}}
		if req.StreamOptions != nil && req.StreamOptions.IncludeUsage {
			final["usage"] = usageJSON(u)
		}
		writeSSE(w, final)
		fmt.Fprint(w, "data: [DONE]\n\n")
		if flusher != nil {
			flusher.Flush()
		}
	} else {
		time.Sleep(latency(req.Model) + time.Duration(len(answer))*time.Millisecond/2)
		writeJSON(w, map[string]any{
			"id": id, "object": "chat.completion", "created": time.Now().Unix(), "model": req.Model,
			"choices": []any{map[string]any{"index": 0, "finish_reason": "stop",
				"message": map[string]string{"role": "assistant", "content": answer}}},
			"usage": usageJSON(u),
		})
	}
	go g.export(reqID, k, req.Model, u, http.StatusOK)
}

func (g *gateway) completion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model     string `json:"model"`
		Prompt    string `json:"prompt"`
		MaxTokens *int   `json:"max_tokens"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	text := " " + mockAnswer(req.Model, req.Prompt, "")
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		text = truncateTokens(text, *req.MaxTokens)
	}
	u := usage{in: tokens(req.Prompt), out: tokens(text)}
	time.Sleep(latency(req.Model))
	writeJSON(w, map[string]any{"id": "cmpl-" + uuid.NewString()[:12], "object": "text_completion", "model": req.Model,
		"choices": []any{map[string]any{"index": 0, "text": text, "finish_reason": "stop"}}, "usage": usageJSON(u)})
	go g.export(uuid.NewString(), k, req.Model, u, http.StatusOK)
}

func (g *gateway) embeddings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model string          `json:"model"`
		Input json.RawMessage `json:"input"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	var inputs []string
	var one string
	if json.Unmarshal(req.Input, &one) == nil {
		inputs = []string{one}
	} else if json.Unmarshal(req.Input, &inputs) != nil {
		apiError(w, http.StatusBadRequest, "input phải là chuỗi hoặc mảng chuỗi")
		return
	}
	data := []any{}
	var u usage
	for i, s := range inputs {
		u.in += tokens(s)
		vec := make([]float64, 1024)
		h := sha256.Sum256([]byte(s))
		for j := range vec {
			vec[j] = math.Round(math.Sin(float64(int(h[j%32])*(j+1)))*0.08*1e5) / 1e5
		}
		data = append(data, map[string]any{"object": "embedding", "index": i, "embedding": vec})
	}
	time.Sleep(80 * time.Millisecond)
	writeJSON(w, map[string]any{"object": "list", "model": req.Model, "data": data,
		"usage": map[string]int64{"prompt_tokens": u.in, "total_tokens": u.in}})
	go g.export(uuid.NewString(), k, req.Model, u, http.StatusOK)
}

func (g *gateway) rerank(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model     string   `json:"model"`
		Query     string   `json:"query"`
		Documents []string `json:"documents"`
		TopN      int      `json:"top_n"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	words := strings.Fields(strings.ToLower(req.Query))
	type res struct {
		Index int     `json:"index"`
		Score float64 `json:"relevance_score"`
		Doc   any     `json:"document"`
	}
	out := []res{}
	u := usage{in: tokens(req.Query)}
	for i, d := range req.Documents {
		u.in += tokens(d)
		hits := 0
		for _, wd := range words {
			if utf8.RuneCountInString(wd) > 2 && strings.Contains(strings.ToLower(d), wd) {
				hits++
			}
		}
		score := math.Min(0.98, 0.05+float64(hits)*0.22+float64(len(d)%7)*0.01)
		out = append(out, res{Index: i, Score: math.Round(score*1e4) / 1e4, Doc: map[string]string{"text": d}})
	}
	slices.SortFunc(out, func(a, b res) int {
		if a.Score > b.Score {
			return -1
		}
		if a.Score < b.Score {
			return 1
		}
		return 0
	})
	if req.TopN > 0 && req.TopN < len(out) {
		out = out[:req.TopN]
	}
	time.Sleep(120 * time.Millisecond)
	writeJSON(w, map[string]any{"model": req.Model, "results": out, "usage": map[string]int64{"total_tokens": u.in}})
	go g.export(uuid.NewString(), k, req.Model, u, http.StatusOK)
}

func (g *gateway) models(w http.ResponseWriter, r *http.Request) {
	rows, err := g.db.Query(r.Context(), `SELECT id FROM model WHERE enabled ORDER BY id`)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ids, _ := pgx.CollectRows(rows, pgx.RowTo[string])
	data := []any{}
	for _, id := range ids {
		data = append(data, map[string]string{"id": id, "object": "model", "owned_by": "maas"})
	}
	writeJSON(w, map[string]any{"object": "list", "data": data})
}

// export gửi một bản ghi access log OTLP/HTTP (JSON) về Ingester, như frontend.accessLog.otlp của gateway.
// Không gửi agw.ai.usage.cost.total: Ingester tự tính từ bảng giá, giống khi catalog.json chưa có giá.
func (g *gateway) export(reqID string, k *keyInfo, model string, u usage, status int) {
	kv := func(key string, v any) map[string]any {
		switch x := v.(type) {
		case int64:
			return map[string]any{"key": key, "value": map[string]any{"intValue": fmt.Sprint(x)}}
		default:
			return map[string]any{"key": key, "value": map[string]any{"stringValue": fmt.Sprint(x)}}
		}
	}
	attrs := []any{
		kv(g.attrs.RequestID, reqID), kv(g.attrs.KeyID, k.ID), kv(g.attrs.DeptID, k.DeptID), kv(g.attrs.Model, model),
		kv(g.attrs.InputTokens, u.in), kv(g.attrs.CacheTokens, u.cache), kv(g.attrs.OutputTokens, u.out),
		kv(g.attrs.Pages, u.pages), kv(g.attrs.Status, int64(status)),
	}
	body, _ := json.Marshal(map[string]any{"resourceLogs": []any{map[string]any{
		"resource": map[string]any{"attributes": []any{kv("service.name", "agentgateway-devmock")}},
		"scopeLogs": []any{map[string]any{"logRecords": []any{map[string]any{
			"timeUnixNano": fmt.Sprint(time.Now().UnixNano()),
			"body":         map[string]any{"stringValue": "request completed"},
			"attributes":   attrs,
		}}}},
	}}})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, g.ingestURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+g.ingestToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("gửi access log lỗi", "err", err)
		return
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Warn("Ingester từ chối access log", "status", resp.StatusCode)
	}
}

func usageJSON(u usage) map[string]any {
	return map[string]any{
		"prompt_tokens": u.in, "completion_tokens": u.out, "total_tokens": u.in + u.out,
		"prompt_tokens_details": map[string]int64{"cached_tokens": u.cache},
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeSSE(w io.Writer, v any) {
	b, _ := json.Marshal(v)
	fmt.Fprintf(w, "data: %s\n\n", b)
}

// tokens ước lượng số token: khoảng 4 ký tự một token.
func tokens(s string) int64 { return int64(utf8.RuneCountInString(s)/4 + 1) }

func truncateTokens(s string, n int) string {
	r := []rune(s)
	if len(r) > n*4 {
		return string(r[:n*4])
	}
	return s
}

func latency(model string) time.Duration {
	if model == "code-llm" {
		return 700 * time.Millisecond
	}
	return 400 * time.Millisecond
}

func mockAnswer(model, question, system string) string {
	q := strings.TrimSpace(question)
	if q == "" {
		q = "câu hỏi của bạn"
	}
	if model == "code-llm" {
		return "Dưới đây là một cách làm bằng Python:\n\ndef tong_so_du(giao_dich):\n    return sum(g[\"so_tien\"] for g in giao_dich if g[\"trang_thai\"] == \"thanh_cong\")\n\nHàm bỏ qua giao dịch lỗi để số dư không bị cộng sai. (Câu trả lời mẫu của devmock cho: " + q + ")"
	}
	prefix := ""
	if system != "" {
		prefix = "Theo hướng dẫn hệ thống, tôi trả lời ngắn gọn. "
	}
	return prefix + "Về “" + q + "”: đây là câu trả lời mẫu do devmock sinh ra để thử luồng gọi model qua gateway. " +
		"Trong môi trường thật, câu trả lời đến từ model nội bộ phía sau agentgateway; số token và chi phí của lời gọi này " +
		"vẫn được ghi vào access log và cộng vào hạn mức của key như bình thường."
}
