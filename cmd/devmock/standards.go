package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Trả lời giả theo các chuẩn không phải OpenAI (internal/standard). Định dạng bám tài liệu công khai của
// từng chuẩn.

// messages: Anthropic Messages API (/v1/messages), có streaming theo các event của Anthropic.
func (g *gateway) messages(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model     string          `json:"model"`
		MaxTokens int             `json:"max_tokens"`
		System    json.RawMessage `json:"system"`
		Stream    bool            `json:"stream"`
		Messages  []struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil || len(req.Messages) == 0 {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", "invalid request")
		return
	}
	if req.MaxTokens <= 0 {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", "max_tokens: field required")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	var prompt strings.Builder
	last, sys := "", blockText(req.System)
	prompt.WriteString(sys)
	for _, m := range req.Messages {
		t := blockText(m.Content)
		prompt.WriteString(t)
		if m.Role == "user" {
			last = t
		}
	}
	answer := truncateTokens(mockAnswer(req.Model, last, sys), req.MaxTokens)
	u := usage{in: tokens(prompt.String()) + 8, out: tokens(answer)}
	if len(req.Messages) > 2 {
		u.cache = u.in / 3
	}
	id := "msg_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:24]
	usageOut := map[string]int64{"input_tokens": u.in - u.cache, "cache_read_input_tokens": u.cache, "output_tokens": u.out}

	if req.Stream {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		flusher, _ := w.(http.Flusher)
		ev := func(name string, v any) {
			b, _ := json.Marshal(v)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, b)
			if flusher != nil {
				flusher.Flush()
			}
		}
		time.Sleep(latency(req.Model))
		ev("message_start", map[string]any{"type": "message_start", "message": map[string]any{
			"id": id, "type": "message", "role": "assistant", "model": req.Model, "content": []any{},
			"usage": map[string]int64{"input_tokens": u.in - u.cache, "cache_read_input_tokens": u.cache, "output_tokens": 1}}})
		ev("content_block_start", map[string]any{"type": "content_block_start", "index": 0, "content_block": map[string]string{"type": "text", "text": ""}})
		words := strings.SplitAfter(answer, " ")
		for i := 0; i < len(words); i += 2 {
			ev("content_block_delta", map[string]any{"type": "content_block_delta", "index": 0,
				"delta": map[string]string{"type": "text_delta", "text": strings.Join(words[i:min(i+2, len(words))], "")}})
			time.Sleep(25 * time.Millisecond)
		}
		ev("content_block_stop", map[string]any{"type": "content_block_stop", "index": 0})
		ev("message_delta", map[string]any{"type": "message_delta", "delta": map[string]any{"stop_reason": "end_turn"},
			"usage": map[string]int64{"output_tokens": u.out}})
		ev("message_stop", map[string]string{"type": "message_stop"})
	} else {
		time.Sleep(latency(req.Model))
		writeJSON(w, map[string]any{"id": id, "type": "message", "role": "assistant", "model": req.Model,
			"content": []any{map[string]string{"type": "text", "text": answer}}, "stop_reason": "end_turn", "usage": usageOut})
	}
	go g.export(uuid.NewString(), k, req.Model, u, http.StatusOK)
}

// blockText đọc nội dung dạng chuỗi hoặc mảng content block của Anthropic.
func blockText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	json.Unmarshal(raw, &blocks)
	var b strings.Builder
	for _, x := range blocks {
		b.WriteString(x.Text)
	}
	return b.String()
}

func anthropicError(w http.ResponseWriter, status int, typ, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"type": "error", "error": map[string]string{"type": typ, "message": msg}})
}

// systemone: decision API (docs.ollama.com/api/systemone). Xác suất giả lập từ độ trùng từ giữa state và
// mô tả của từng phương án, rồi softmax; confidence = 1 − H(p)/ln(N) như tài liệu.
func (g *gateway) systemone(w http.ResponseWriter, r *http.Request) {
	fail := func(status int, msg string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20+1))
	if err != nil {
		fail(http.StatusBadRequest, "cannot read body")
		return
	}
	if len(body) > 32<<20 {
		fail(http.StatusRequestEntityTooLarge, "request body must not exceed 32 MiB with images")
		return
	}
	var req struct {
		Model     string          `json:"model"`
		State     json.RawMessage `json:"state"`
		Images    []string        `json:"images"`
		Questions map[string]struct {
			Type         string          `json:"type"`
			Instructions string          `json:"instructions"`
			Criteria     json.RawMessage `json:"criteria"`
		} `json:"questions"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		fail(http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(req.Model) == "" {
		fail(http.StatusBadRequest, "model is required")
		return
	}
	if len(req.Images) == 0 && len(body) > 64<<10 {
		fail(http.StatusRequestEntityTooLarge, "request body must not exceed 64 KiB without images")
		return
	}
	var seen []string // nội dung "nhìn thấy" trên ảnh mẫu, để quyết định giả lập khớp với ảnh
	// images: base64 thuần của PNG, JPEG hoặc WebP; không nhận URL hay data URL (tài liệu SystemOne).
	for i, img := range req.Images {
		if strings.HasPrefix(img, "data:") || strings.HasPrefix(img, "http://") || strings.HasPrefix(img, "https://") {
			fail(http.StatusBadRequest, fmt.Sprintf("images[%d]: URLs and data URLs are not supported, send raw base64", i))
			return
		}
		b, err := base64.StdEncoding.DecodeString(img)
		if err != nil {
			fail(http.StatusBadRequest, fmt.Sprintf("images[%d]: invalid base64", i))
			return
		}
		if kind := imageKind(b); kind == "" {
			fail(http.StatusBadRequest, fmt.Sprintf("images[%d]: unsupported image format, use PNG, JPEG or WebP", i))
			return
		}
		seen = append(seen, sampleImageText(b))
	}
	state := blockText(req.State)
	if state == "" && len(req.State) > 0 && string(req.State) != `""` && string(req.State) != "null" {
		state = string(req.State) // object hoặc mảng: dùng nguyên văn JSON
	}
	if strings.TrimSpace(state) == "" {
		fail(http.StatusBadRequest, "state is required")
		return
	}
	if n := len(req.Questions); n < 1 || n > 64 {
		fail(http.StatusBadRequest, "questions must contain 1 to 64 entries")
		return
	}
	k, ok := g.authorize(w, r, req.Model)
	if !ok {
		return
	}
	if len(seen) > 0 {
		state += " " + strings.Join(seen, " ")
	}
	answers := map[string]any{}
	u := usage{}
	for name, q := range req.Questions {
		if strings.TrimSpace(name) == "" || strings.TrimSpace(q.Instructions) == "" {
			fail(http.StatusBadRequest, "question "+name+": instructions is required")
			return
		}
		var keys, descs []string
		switch q.Type {
		case "choice":
			var c map[string]*string
			if json.Unmarshal(q.Criteria, &c) != nil || len(c) < 2 || len(c) > 255 {
				fail(http.StatusBadRequest, "question "+name+": choice criteria must have 2 to 255 entries")
				return
			}
			for key, d := range c {
				keys = append(keys, key)
				descs = append(descs, key+" "+deref(d))
			}
			slices.Sort(keys)
			descs = descs[:0]
			for _, key := range keys {
				descs = append(descs, key+" "+deref(c[key]))
			}
		case "noul":
			var c map[string]string
			if len(q.Criteria) > 0 && string(q.Criteria) != "null" {
				if json.Unmarshal(q.Criteria, &c) != nil {
					fail(http.StatusBadRequest, "question "+name+": noul criteria must be an object")
					return
				}
				for key := range c {
					if key != "false" && key != "true" {
						fail(http.StatusBadRequest, "question "+name+": noul criteria only allows \"false\" and \"true\"")
						return
					}
				}
			}
			keys = []string{"false", "true"}
			descs = []string{"không bình thường " + c["false"], "có " + c["true"] + " " + q.Instructions}
		case "score":
			if json.Unmarshal(q.Criteria, &descs) != nil || len(descs) < 2 || len(descs) > 10 {
				fail(http.StatusBadRequest, "question "+name+": score criteria must be an array of 2 to 10 strings")
				return
			}
			for i := range descs {
				keys = append(keys, fmt.Sprint(i))
			}
		default:
			fail(http.StatusBadRequest, "question "+name+": type must be choice, noul or score")
			return
		}
		p := decide(state, q.Instructions, descs)
		conf := confidence(p)
		probs := map[string]float64{}
		best := 0
		for i, key := range keys {
			probs[key] = round4(p[i])
			if p[i] > p[best] {
				best = i
			}
		}
		switch q.Type {
		case "choice":
			answers[name] = map[string]any{"type": "choice", "choice": keys[best], "probabilities": probs, "confidence": round4(conf)}
		case "noul":
			answers[name] = map[string]any{"type": "noul", "noul": round4(p[1])}
		case "score":
			legend := map[string]string{}
			score := 0.0
			for i, d := range descs {
				legend[keys[i]] = d
				score += float64(i) * p[i]
			}
			answers[name] = map[string]any{"type": "score", "score": round4(score), "legend": legend, "probabilities": probs, "confidence": round4(conf)}
		}
		// Mỗi ảnh chiếm thêm vị trí token đầu vào; ngữ cảnh chung tính lại cho từng câu hỏi như tài liệu.
		u.in += tokens(state) + tokens(q.Instructions) + tokens(strings.Join(descs, " ")) + 12 + int64(len(req.Images))*256
		u.out++
	}
	time.Sleep(latency(req.Model) / 2)
	writeJSON(w, map[string]any{"model": req.Model, "answers": answers,
		"usage": map[string]int64{"input_tokens": u.in, "output_tokens": u.out}})
	go g.export(uuid.NewString(), k, req.Model, u, http.StatusOK)
}

// Ảnh mẫu của Playground (web/public/examples): devmock không nhìn được ảnh, nên nhận ra ảnh mẫu theo mã băm
// và coi như đã đọc được nội dung này. Ảnh khác coi như không đọc được gì.
var sampleImages = map[string]string{
	"uy-nhiem-chi.png": "ủy nhiệm chi ủy_nhiem_chi số tiền 125.000.000 VND khớp rõ đọc được hết",
	"hoa-don.png":      "hoá đơn hoa_don GTGT bảng hàng hoá rõ đọc được hết",
}

func sampleImageText(b []byte) string {
	sum := sha256.Sum256(b)
	for name, text := range sampleImages {
		f, err := os.ReadFile("web/public/examples/" + name)
		if err == nil && sha256.Sum256(f) == sum {
			return text
		}
	}
	return ""
}

// imageKind nhận dạng PNG, JPEG, WebP theo byte đầu tệp.
func imageKind(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return "png"
	case bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF}):
		return "jpeg"
	case len(b) > 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "webp"
	}
	return ""
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// decide cho điểm từng phương án theo số từ trùng với state (cộng chút nhiễu ổn định theo nội dung), rồi softmax.
func decide(state, instructions string, options []string) []float64 {
	words := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(state), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if utf8.RuneCountInString(w) > 1 {
			words[w] = true
		}
	}
	logits := make([]float64, len(options))
	for i, o := range options {
		hits := 0
		for _, w := range strings.FieldsFunc(strings.ToLower(o), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
			if words[w] {
				hits++
			}
		}
		logits[i] += 1.2 * float64(min(hits, 3)) // giới hạn để xác suất không bão hoà về 0 và 1
		h := sha256.Sum256([]byte(state + instructions + o))
		logits[i] += float64(h[0]) / 255
	}
	maxL := slices.Max(logits)
	sum := 0.0
	p := make([]float64, len(logits))
	for i, l := range logits {
		p[i] = math.Exp(l - maxL)
		sum += p[i]
	}
	for i := range p {
		p[i] /= sum
	}
	return p
}

// confidence = 1 − H(p)/ln(N): độ tập trung của phân phối, không phải xác suất đúng.
func confidence(p []float64) float64 {
	h := 0.0
	for _, x := range p {
		if x > 0 {
			h -= x * math.Log(x)
		}
	}
	return 1 - h/math.Log(float64(len(p)))
}

func round4(x float64) float64 { return math.Round(x*1e4) / 1e4 }

// turboOCR: POST /ocr/raw của TurboOCR, body là byte ảnh. layout=1, tables=1 thêm bố cục và bảng.
func (g *gateway) turboOCR(w http.ResponseWriter, r *http.Request) {
	model := r.PathValue("model")
	k, ok := g.authorize(w, r, model)
	if !ok {
		return
	}
	img, err := io.ReadAll(io.LimitReader(r.Body, 30<<20))
	if err != nil || len(img) == 0 {
		apiError(w, http.StatusBadRequest, "body phải là byte của ảnh")
		return
	}
	time.Sleep(300 * time.Millisecond)
	q := r.URL.Query()
	line := func(text string, conf float64, x, y, w int) map[string]any {
		return map[string]any{"text": text, "confidence": conf, "bounding_box": [][]int{{x, y}, {x + w, y}, {x + w, y + 24}, {x, y + 24}}}
	}
	body := map[string]any{"results": []any{
		line("ỦY NHIỆM CHI", 0.99, 300, 40, 220),
		line("Số: UNC-2026-00418", 0.98, 40, 110, 260),
		line("Đơn vị trả tiền: CÔNG TY TNHH MẪU", 0.96, 40, 150, 480),
		line("Số tiền: 125.000.000 VND", 0.95, 40, 190, 340),
		line("Nội dung: Thanh toán hợp đồng số 12/2026", 0.94, 40, 230, 520),
	}}
	if q.Get("layout") == "1" || q.Get("tables") == "1" {
		body["layout"] = []any{
			map[string]any{"type": "title", "order": 0, "bounding_box": [][]int{{300, 40}, {520, 40}, {520, 64}, {300, 64}}},
			map[string]any{"type": "text", "order": 1, "bounding_box": [][]int{{40, 110}, {600, 110}, {600, 254}, {40, 254}}},
		}
	}
	if q.Get("tables") == "1" {
		body["tables"] = []any{map[string]any{"html": "<table><tr><th>Mặt hàng</th><th>SL</th><th>Thành tiền</th></tr>" +
			"<tr><td>Dịch vụ tư vấn</td><td>1</td><td>100.000.000</td></tr><tr><td>Thuế GTGT</td><td></td><td>10.000.000</td></tr></table>"}}
	}
	writeJSON(w, body)
	go g.export(uuid.NewString(), k, model, usage{pages: 1}, http.StatusOK)
}

// mineru: POST /v1/file_parse của MinerU, tệp gửi multipart ở trường files; trả Markdown cho từng tệp.
func (g *gateway) mineru(w http.ResponseWriter, r *http.Request) {
	model := r.PathValue("model")
	k, ok := g.authorize(w, r, model)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(64 << 20); err != nil || len(r.MultipartForm.File["files"]) == 0 {
		apiError(w, http.StatusBadRequest, "cần ít nhất một tệp ở trường files")
		return
	}
	results := map[string]any{}
	var pages int64
	for _, fh := range r.MultipartForm.File["files"] {
		f, err := fh.Open()
		if err != nil {
			continue
		}
		b, _ := io.ReadAll(f)
		f.Close()
		n := pdfPages(b)
		pages += n
		results[fh.Filename] = map[string]any{"pages": n, "md_content": fmt.Sprintf(
			"# HỢP ĐỒNG CUNG CẤP DỊCH VỤ\n\nSố: 12/2026/HĐDV\n\n## Điều 1. Phạm vi\n\nBên B cung cấp dịch vụ tư vấn chuyển đổi số cho Bên A.\n\n"+
				"| Hạng mục | Giá trị (VND) |\n|---|---|\n| Phí dịch vụ | 100.000.000 |\n| Thuế GTGT | 10.000.000 |\n\n"+
				"_Kết quả mẫu của devmock cho tệp %s (%d trang)._", fh.Filename, n)}
	}
	time.Sleep(time.Duration(400+200*pages) * time.Millisecond)
	writeJSON(w, map[string]any{"backend": "pipeline", "tier": r.URL.Query().Get("tier"), "version": "devmock", "results": results})
	go g.export(uuid.NewString(), k, model, usage{pages: pages}, http.StatusOK)
}

// pdfPages đếm trang của PDF (đếm đối tượng /Type /Page); tệp ảnh tính là một trang.
func pdfPages(b []byte) int64 {
	if !bytes.HasPrefix(b, []byte("%PDF")) {
		return 1
	}
	n := int64(bytes.Count(b, []byte("/Type /Page")) - bytes.Count(b, []byte("/Type /Pages")))
	if m := int64(bytes.Count(b, []byte("/Type/Page")) - bytes.Count(b, []byte("/Type/Pages"))); m > n {
		n = m
	}
	return max(n, 1)
}
