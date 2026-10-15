package main

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// MCP server giả (Streamable HTTP, trả JSON) cho Phòng Thẩm định: ba tool chỉ đọc, một tool ghi dữ liệu,
// và một tool không khai báo readOnlyHint (MaaS phải coi là có thể ghi, T5).
func mcpRoutes() http.Handler {
	ro := func(v bool) map[string]any { return map[string]any{"readOnlyHint": v} }
	tools := []map[string]any{
		{"name": "tim_ho_so", "description": "Tìm hồ sơ tín dụng theo mã khách hàng hoặc số hợp đồng", "annotations": ro(true),
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{"q": map[string]string{"type": "string"}}}},
		{"name": "lay_ho_so", "description": "Lấy chi tiết một hồ sơ tín dụng (đã che dữ liệu cá nhân)", "annotations": ro(true),
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{"id": map[string]string{"type": "string"}}}},
		{"name": "tai_san_bao_dam", "description": "Danh sách tài sản bảo đảm của một hồ sơ", "annotations": ro(true),
			"inputSchema": map[string]any{"type": "object"}},
		{"name": "cap_nhat_trang_thai", "description": "Cập nhật trạng thái thẩm định của hồ sơ", "annotations": ro(false),
			"inputSchema": map[string]any{"type": "object"}},
		{"name": "ghi_chu_ho_so", "description": "Thêm ghi chú vào hồ sơ (server không khai báo readOnlyHint)",
			"inputSchema": map[string]any{"type": "object"}},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /mcp", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     *json.RawMessage `json:"id"`
			Method string           `json:"method"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			http.Error(w, "invalid", http.StatusBadRequest)
			return
		}
		if req.ID == nil { // thông báo, không cần trả lời
			w.WriteHeader(http.StatusAccepted)
			return
		}
		var result any
		switch req.Method {
		case "initialize":
			w.Header().Set("Mcp-Session-Id", uuid.NewString())
			result = map[string]any{"protocolVersion": "2025-03-26", "capabilities": map[string]any{"tools": map[string]any{}},
				"serverInfo": map[string]string{"name": "ho-so-tin-dung", "version": "1.0.0"}}
		case "tools/list":
			result = map[string]any{"tools": tools}
		case "tools/call":
			result = map[string]any{"content": []any{map[string]string{"type": "text", "text": "Kết quả mẫu từ devmock."}}}
		default:
			writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": req.ID, "error": map[string]any{"code": -32601, "message": "method not found"}})
			return
		}
		writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
	})
	return mux
}
