// Package mcp là client tối thiểu để MaaS quét danh sách tool của MCP server (T3)
// và kiểm tra kết nối (T11). MaaS không gọi tool thay agent; agent gọi qua agentgateway.
package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const protocolVersion = "2025-03-26"

type Tool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ReadOnly    bool   `json:"read_only"`
}

type Server struct {
	Host     string
	Port     int
	Path     string
	Protocol string // streamable_http | sse
}

func (s Server) URL() string {
	p := s.Path
	if p == "" {
		p = "/mcp"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return fmt.Sprintf("http://%s:%d%s", s.Host, s.Port, p)
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

type rpcMsg struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int            `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  any             `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type toolsResult struct {
	Tools []struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Annotations struct {
			ReadOnlyHint *bool `json:"readOnlyHint"`
		} `json:"annotations"`
	} `json:"tools"`
	NextCursor string `json:"nextCursor"`
}

// ListTools kết nối, khởi tạo phiên MCP và lấy toàn bộ tools/list (theo trang).
// Tool không khai báo readOnlyHint được coi là có thể ghi dữ liệu (T5): an toàn hơn là coi là chỉ đọc.
func ListTools(ctx context.Context, s Server) ([]Tool, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	var t transport
	var err error
	switch s.Protocol {
	case "sse":
		t, err = dialSSE(ctx, s.URL())
	default:
		t = &streamable{url: s.URL()}
	}
	if err != nil {
		return nil, err
	}
	defer t.close()

	if _, err := t.call(ctx, 1, "initialize", map[string]any{
		"protocolVersion": protocolVersion,
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]string{"name": "bemaas", "version": "1"},
	}); err != nil {
		return nil, fmt.Errorf("initialize: %w", err)
	}
	if err := t.notify(ctx, "notifications/initialized"); err != nil {
		return nil, err
	}
	var out []Tool
	cursor := ""
	for page := 0; page < 50; page++ {
		params := map[string]any{}
		if cursor != "" {
			params["cursor"] = cursor
		}
		raw, err := t.call(ctx, 2+page, "tools/list", params)
		if err != nil {
			return nil, fmt.Errorf("tools/list: %w", err)
		}
		var r toolsResult
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, fmt.Errorf("tools/list trả dữ liệu không hợp lệ: %w", err)
		}
		for _, x := range r.Tools {
			ro := x.Annotations.ReadOnlyHint != nil && *x.Annotations.ReadOnlyHint
			out = append(out, Tool{Name: x.Name, Description: x.Description, ReadOnly: ro})
		}
		if r.NextCursor == "" {
			break
		}
		cursor = r.NextCursor
	}
	return out, nil
}

type transport interface {
	call(ctx context.Context, id int, method string, params any) (json.RawMessage, error)
	notify(ctx context.Context, method string) error
	close()
}

// --- Streamable HTTP -------------------------------------------------------

type streamable struct {
	url     string
	session string
}

func (t *streamable) post(ctx context.Context, msg rpcMsg) (*http.Response, error) {
	body, _ := json.Marshal(msg)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("MCP-Protocol-Version", protocolVersion)
	if t.session != "" {
		req.Header.Set("Mcp-Session-Id", t.session)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		t.session = sid
	}
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return resp, nil
}

func (t *streamable) call(ctx context.Context, id int, method string, params any) (json.RawMessage, error) {
	resp, err := t.post(ctx, rpcMsg{JSONRPC: "2.0", ID: &id, Method: method, Params: params})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		return readSSEResult(bufio.NewReader(resp.Body), id)
	}
	var m rpcMsg
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&m); err != nil {
		return nil, fmt.Errorf("phản hồi không phải JSON-RPC: %w", err)
	}
	return result(m)
}

func (t *streamable) notify(ctx context.Context, method string) error {
	resp, err := t.post(ctx, rpcMsg{JSONRPC: "2.0", Method: method})
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (t *streamable) close() {}

// --- SSE (giao thức cũ): GET /sse nhận sự kiện "endpoint", POST lời gọi tới endpoint đó,
// kết quả trả về qua luồng SSE. ---------------------------------------------

type sseConn struct {
	resp     *http.Response
	reader   *bufio.Reader
	endpoint string
}

func dialSSE(ctx context.Context, sseURL string) (*sseConn, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sseURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	// Luồng SSE mở lâu: không dùng timeout của httpClient, để ctx quyết định.
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d khi mở luồng SSE", resp.StatusCode)
	}
	c := &sseConn{resp: resp, reader: bufio.NewReader(resp.Body)}
	for {
		ev, data, err := nextEvent(c.reader)
		if err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("không nhận được sự kiện endpoint: %w", err)
		}
		if ev == "endpoint" {
			base, _ := url.Parse(sseURL)
			ref, err := url.Parse(strings.TrimSpace(data))
			if err != nil {
				resp.Body.Close()
				return nil, err
			}
			c.endpoint = base.ResolveReference(ref).String()
			return c, nil
		}
	}
}

func (c *sseConn) send(ctx context.Context, msg rpcMsg) error {
	body, _ := json.Marshal(msg)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

func (c *sseConn) call(ctx context.Context, id int, method string, params any) (json.RawMessage, error) {
	if err := c.send(ctx, rpcMsg{JSONRPC: "2.0", ID: &id, Method: method, Params: params}); err != nil {
		return nil, err
	}
	return readSSEResult(c.reader, id)
}

func (c *sseConn) notify(ctx context.Context, method string) error {
	return c.send(ctx, rpcMsg{JSONRPC: "2.0", Method: method})
}

func (c *sseConn) close() { c.resp.Body.Close() }

// --- Đọc SSE ----------------------------------------------------------------

func nextEvent(r *bufio.Reader) (event, data string, err error) {
	var lines []string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return "", "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if len(lines) == 0 && event == "" {
				continue
			}
			return event, strings.Join(lines, "\n"), nil
		}
		switch {
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			lines = append(lines, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
}

func readSSEResult(r *bufio.Reader, id int) (json.RawMessage, error) {
	for {
		_, data, err := nextEvent(r)
		if err != nil {
			return nil, err
		}
		var m rpcMsg
		if json.Unmarshal([]byte(data), &m) != nil || m.ID == nil || *m.ID != id {
			continue // thông báo hoặc phản hồi của lời gọi khác
		}
		return result(m)
	}
}

func result(m rpcMsg) (json.RawMessage, error) {
	if m.Error != nil {
		return nil, fmt.Errorf("lỗi %d: %s", m.Error.Code, m.Error.Message)
	}
	if m.Result == nil {
		return nil, errors.New("phản hồi không có result")
	}
	return m.Result, nil
}
