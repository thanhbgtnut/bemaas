package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// MCPConfig là nội dung Backend và Policy MaaS ghi xuống agentgateway (spec mục 20.4).
// Tên trường theo tài liệu agentgateway bản Kubernetes; phải đối chiếu với phiên bản đang chạy.
type MCPConfig struct {
	Backend map[string]any `json:"backend"`
	Policy  map[string]any `json:"policy"`
	// Rules: mỗi dòng matchExpressions ở dạng dễ đọc, để hiện ở tab Cấu hình gateway của từng server.
	Rules map[string]string `json:"rules"`
}

type mcpServerRow struct {
	id, host, path, protocol, scope string
	port                            int
	tools                           []string
	depts                           []string
}

// BuildMCP sinh toàn bộ cấu hình từ CSDL. Server tạm dừng không có trong target (T7);
// server chưa có tool mở hoặc chưa có phòng nào được phép không sinh luật (T4).
func (s *Syncer) BuildMCP(ctx context.Context) (*MCPConfig, error) {
	rows, err := s.db.Query(ctx, `
		SELECT s.id, s.host, s.port, s.path, s.protocol, s.scope,
		       COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM mcp_tool t WHERE t.server_id = s.id AND t.enabled), '{}'),
		       COALESCE((SELECT array_agg(d.department_id::text ORDER BY d.department_id) FROM mcp_server_dept d WHERE d.server_id = s.id), '{}')
		FROM mcp_server s WHERE s.enabled ORDER BY s.id`)
	if err != nil {
		return nil, err
	}
	servers, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (mcpServerRow, error) {
		var x mcpServerRow
		return x, r.Scan(&x.id, &x.host, &x.port, &x.path, &x.protocol, &x.scope, &x.tools, &x.depts)
	})
	if err != nil {
		return nil, err
	}

	targets := []map[string]any{}
	exprs := []string{}
	rules := map[string]string{}
	for _, x := range servers {
		proto := "StreamableHTTP"
		if x.protocol == "sse" {
			proto = "SSE"
		}
		targets = append(targets, map[string]any{
			"name":   x.id,
			"static": map[string]any{"host": x.host, "port": x.port, "path": x.path, "protocol": proto},
		})
		if len(x.tools) == 0 || (x.scope == "departments" && len(x.depts) == 0) {
			rules[x.id] = "false  # chưa có tool mở hoặc chưa có phòng được phép"
			continue
		}
		expr := fmt.Sprintf(`mcp.tool.target == %q && mcp.tool.name in [%s]`, x.id, quoteList(x.tools))
		if x.scope == "departments" {
			expr += fmt.Sprintf(` && apiKey.dept_id in [%s]`, quoteList(x.depts))
		}
		exprs = append(exprs, expr)
		rules[x.id] = expr
	}
	if len(exprs) == 0 {
		exprs = []string{"false"} // không có luật nào: từ chối tất cả
	}
	group := strings.SplitN(s.cfg.Kube.AGWAPIVersion, "/", 2)[0]
	return &MCPConfig{
		Backend: map[string]any{
			"mcp": map[string]any{"failureMode": "FailOpen", "prefixMode": "Always", "targets": targets},
		},
		Policy: map[string]any{
			"targetRefs": []map[string]string{{"group": group, "kind": "AgentgatewayBackend", "name": s.cfg.Kube.MCPBackend}},
			"backend": map[string]any{"mcp": map[string]any{"authorization": map[string]any{
				"action": "Allow", "policy": map[string]any{"matchExpressions": exprs},
			}}},
		},
		Rules: rules,
	}, nil
}

// SyncMCP ghi Backend và Policy, rồi lưu nội dung đã ghi cùng thời điểm để hiện ở tab Cấu hình gateway.
func (s *Syncer) SyncMCP(ctx context.Context) error {
	cfg, err := s.BuildMCP(ctx)
	if err != nil {
		return err
	}
	werr := s.writer.WriteSpec(ctx, s.cfg.Kube.AGWAPIVersion, "agentgatewaybackends", s.cfg.Kube.MCPBackend, cfg.Backend)
	if werr == nil {
		werr = s.writer.WriteSpec(ctx, s.cfg.Kube.AGWAPIVersion, "agentgatewaypolicies", s.cfg.Kube.MCPPolicy, cfg.Policy)
	}
	content, _ := json.Marshal(cfg)
	var errText *string
	if werr != nil {
		e := werr.Error()
		errText = &e
	}
	if _, err := s.db.Exec(ctx, `
		INSERT INTO gateway_sync_state (name, synced_at, content, error) VALUES ('mcp', $1, $2, $3)
		ON CONFLICT (name) DO UPDATE SET synced_at = EXCLUDED.synced_at, content = EXCLUDED.content, error = EXCLUDED.error`,
		time.Now(), content, errText); err != nil {
		return err
	}
	return werr
}

func quoteList(xs []string) string {
	sorted := append([]string(nil), xs...)
	sort.Strings(sorted)
	q := make([]string, len(sorted))
	for i, x := range sorted {
		q[i] = fmt.Sprintf("%q", x)
	}
	return strings.Join(q, ", ")
}

// Mode trả chế độ đồng bộ (log | kubernetes) để giao diện ghi rõ cấu hình có thật sự được áp dụng hay không.
func (s *Syncer) Mode() string { return s.cfg.Mode }
