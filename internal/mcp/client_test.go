package mcp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
)

func toolsResponse() map[string]any {
	ro := true
	return map[string]any{"tools": []any{
		map[string]any{"name": "doc", "description": "đọc", "annotations": map[string]any{"readOnlyHint": ro}},
		map[string]any{"name": "ghi", "description": "ghi"},
	}}
}

func serverAddr(t *testing.T, srv *httptest.Server) (string, int) {
	u, _ := url.Parse(srv.URL)
	port, _ := strconv.Atoi(u.Port())
	return u.Hostname(), port
}

func TestStreamableHTTP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     *int   `json:"id"`
			Method string `json:"method"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.ID == nil {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		var result any = map[string]any{}
		if req.Method == "tools/list" {
			result = toolsResponse()
			// Trả kiểu SSE để kiểm tra cả nhánh text/event-stream của Streamable HTTP.
			w.Header().Set("Content-Type", "text/event-stream")
			b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": *req.ID, "result": result})
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", b)
			return
		}
		w.Header().Set("Mcp-Session-Id", "s1")
		json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": *req.ID, "result": result})
	}))
	defer srv.Close()
	host, port := serverAddr(t, srv)
	tools, err := ListTools(t.Context(), Server{Host: host, Port: port, Path: "/mcp", Protocol: "streamable_http"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 2 || !tools[0].ReadOnly || tools[1].ReadOnly {
		t.Fatalf("tool không khai báo readOnlyHint phải coi là ghi dữ liệu: %+v", tools)
	}
}

func TestSSE(t *testing.T) {
	msgs := make(chan []byte, 4)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /sse", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "event: endpoint\ndata: /messages?session=1\n\n")
		w.(http.Flusher).Flush()
		for {
			select {
			case b := <-msgs:
				fmt.Fprintf(w, "event: message\ndata: %s\n\n", b)
				w.(http.Flusher).Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
	mux.HandleFunc("POST /messages", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     *int   `json:"id"`
			Method string `json:"method"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		w.WriteHeader(http.StatusAccepted)
		if req.ID == nil {
			return
		}
		var result any = map[string]any{}
		if req.Method == "tools/list" {
			result = toolsResponse()
		}
		b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": *req.ID, "result": result})
		msgs <- b
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	host, port := serverAddr(t, srv)
	tools, err := ListTools(t.Context(), Server{Host: host, Port: port, Path: "/sse", Protocol: "sse"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 2 {
		t.Fatalf("tools = %+v", tools)
	}
}

func TestUnreachable(t *testing.T) {
	if _, err := ListTools(t.Context(), Server{Host: "127.0.0.1", Port: 9, Protocol: "streamable_http"}); err == nil {
		t.Fatal("phải báo lỗi khi không kết nối được")
	}
}
