package api

import (
	"context"
	"encoding/json"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
	"bemaas/internal/mcp"
)

// MCP server và tools (spec mục 20). Quản trị nền tảng quản trị; quản trị phòng và thành viên chỉ xem
// server phòng mình được dùng, không thấy địa chỉ phía sau, tool đang đóng và cấu hình gateway (T10).

type MCPServer struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	OwnerUnit     string     `json:"owner_unit"`
	Host          string     `json:"host,omitempty"`
	Port          int        `json:"port,omitempty"`
	Path          string     `json:"path,omitempty"`
	Protocol      string     `json:"protocol"`
	Enabled       bool       `json:"enabled"`
	Scope         string     `json:"scope"`
	Health        string     `json:"health"`
	LastError     *string    `json:"last_error,omitempty"`
	LastScannedAt *time.Time `json:"last_scanned_at"`
	ToolsOpen     int        `json:"tools_open"`
	ToolsTotal    int        `json:"tools_total,omitempty"`
	Calls30d      int64      `json:"calls_30d"`
	Departments   []DeptRef  `json:"departments,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type DeptRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type MCPTool struct {
	Name        string     `json:"name"`
	GatewayName string     `json:"gateway_name"` // <server>_<tool> (T2)
	Description string     `json:"description"`
	ReadOnly    bool       `json:"read_only"`
	Enabled     bool       `json:"enabled"`
	FirstSeenAt time.Time  `json:"first_seen_at"`
	ReviewedAt  *time.Time `json:"reviewed_at"`
	Calls30d    int64      `json:"calls_30d"`
}

const mcpServerSelect = `
	SELECT s.id, s.name, s.description, s.owner_unit, s.host, s.port, s.path, s.protocol, s.enabled, s.scope, s.health,
	       s.last_error, s.last_scanned_at, s.created_at,
	       (SELECT count(*) FROM mcp_tool t WHERE t.server_id = s.id AND t.enabled),
	       (SELECT count(*) FROM mcp_tool t WHERE t.server_id = s.id),
	       COALESCE((SELECT sum(calls) FROM mcp_tool_usage u WHERE u.server_id = s.id AND u.period > current_date - 30), 0),
	       COALESCE((SELECT json_agg(json_build_object('id', d.id, 'name', d.name) ORDER BY d.name)
	                 FROM mcp_server_dept sd JOIN department d ON d.id = sd.department_id WHERE sd.server_id = s.id), '[]')
	FROM mcp_server s`

func scanMCPServer(r pgx.CollectableRow) (MCPServer, error) {
	var s MCPServer
	err := r.Scan(&s.ID, &s.Name, &s.Description, &s.OwnerUnit, &s.Host, &s.Port, &s.Path, &s.Protocol, &s.Enabled, &s.Scope,
		&s.Health, &s.LastError, &s.LastScannedAt, &s.CreatedAt, &s.ToolsOpen, &s.ToolsTotal, &s.Calls30d, &s.Departments)
	return s, err
}

// visibleWhere: người không phải Nền tảng/Kiểm soát chỉ thấy server đang bật, mở cho mọi phòng
// hoặc cho một trong các phòng của họ.
func visibleWhere(p *auth.Principal, args *[]any) string {
	if p.SeesAll() {
		return "TRUE"
	}
	depts := append(append([]string{}, p.MemberOf...), p.AdminOf...)
	*args = append(*args, depts)
	return `s.enabled AND (s.scope = 'all' OR EXISTS (SELECT 1 FROM mcp_server_dept sd WHERE sd.server_id = s.id AND sd.department_id::text = ANY($1)))`
}

// redact bỏ địa chỉ phía sau và thông tin quản trị với người không phải Nền tảng (T10).
func redact(p *auth.Principal, s *MCPServer) {
	if p.IsPlatform {
		return
	}
	s.Host, s.Port, s.Path, s.LastError, s.ToolsTotal, s.Departments = "", 0, "", nil, 0, nil
}

func (a *API) listMCPServers(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	var args []any
	rows, err := a.db.Query(ctx, mcpServerSelect+" WHERE "+visibleWhere(p, &args)+" ORDER BY s.name", args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, scanMCPServer)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	for i := range items {
		redact(p, &items[i])
	}
	out := map[string]any{"items": items, "gateway_base_url": a.cfg.Gateway.BaseURL}
	if p.IsPlatform {
		var syncedAt *time.Time
		var syncErr *string
		_ = a.db.QueryRow(ctx, `SELECT synced_at, error FROM gateway_sync_state WHERE name = 'mcp'`).Scan(&syncedAt, &syncErr)
		out["sync"] = map[string]any{"synced_at": syncedAt, "error": syncErr, "mode": a.sync.Mode()}
	}
	httpx.OK(c, out)
}

func (a *API) getMCPServer(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	args := []any{}
	where := visibleWhere(p, &args)
	args = append(args, id)
	rows, err := a.db.Query(ctx, mcpServerSelect+" WHERE "+where+" AND s.id = $"+strconv.Itoa(len(args)), args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	s, err := pgx.CollectExactlyOneRow(rows, scanMCPServer)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	toolWhere := "server_id = $1"
	if !p.IsPlatform {
		toolWhere += " AND enabled" // không lộ tool đang đóng (T8, T10)
	}
	rows, err = a.db.Query(ctx, `
		SELECT name, description, read_only, enabled, first_seen_at, reviewed_at,
		       COALESCE((SELECT sum(calls) FROM mcp_tool_usage u WHERE u.server_id = t.server_id AND u.tool_name = t.name AND u.period > current_date - 30), 0)
		FROM mcp_tool t WHERE `+toolWhere+` ORDER BY name`, id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	tools, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (MCPTool, error) {
		var t MCPTool
		err := r.Scan(&t.Name, &t.Description, &t.ReadOnly, &t.Enabled, &t.FirstSeenAt, &t.ReviewedAt, &t.Calls30d)
		t.GatewayName = id + "_" + t.Name
		return t, err
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	out := map[string]any{
		"server": s, "tools": tools,
		"endpoint": strings.TrimRight(a.cfg.Gateway.BaseURL, "/") + "/mcp",
	}
	if p.IsPlatform {
		// Số key đang hoạt động gọi được server này (20.3, tab Phạm vi sử dụng).
		var keys int64
		_ = a.db.QueryRow(ctx, `
			SELECT count(*) FROM api_key k WHERE k.status = 'active'
			  AND ($2 = 'all' OR k.department_id IN (SELECT department_id FROM mcp_server_dept WHERE server_id = $1))`,
			id, s.Scope).Scan(&keys)
		out["active_keys"] = keys
		var content json.RawMessage
		if a.db.QueryRow(ctx, `SELECT content FROM gateway_sync_state WHERE name = 'mcp'`).Scan(&content) == nil {
			var cfg struct {
				Rules   map[string]string `json:"rules"`
				Backend struct {
					MCP struct {
						Targets []map[string]any `json:"targets"`
					} `json:"mcp"`
				} `json:"backend"`
			}
			if json.Unmarshal(content, &cfg) == nil {
				var target any
				for _, t := range cfg.Backend.MCP.Targets {
					if t["name"] == id {
						target = t
					}
				}
				out["gateway"] = map[string]any{"target": target, "rule": cfg.Rules[id]}
			}
		}
	}
	redact(p, &s)
	out["server"] = s
	httpx.OK(c, out)
}

var serverIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)

type mcpServerInput struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	OwnerUnit   *string `json:"owner_unit"`
	Host        *string `json:"host"`
	Port        *int    `json:"port"`
	Path        *string `json:"path"`
	Protocol    *string `json:"protocol"`
	Enabled     *bool   `json:"enabled"`
}

func strv(p *string, def string) string {
	if p == nil {
		return def
	}
	return strings.TrimSpace(*p)
}

// POST /mcp-servers — kết nối thử và quét tool; server mới chưa phòng nào dùng được, tool mới đóng (T4).
func (a *API) createMCPServer(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in mcpServerInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if !serverIDRe.MatchString(in.ID) {
		httpx.Fail(c, httpx.BadRequest("Tên server chỉ gồm chữ thường, số, gạch ngang (T2)"))
		return
	}
	srv := mcp.Server{Host: strv(in.Host, ""), Path: strv(in.Path, "/mcp"), Protocol: strv(in.Protocol, "streamable_http")}
	if in.Port != nil {
		srv.Port = *in.Port
	}
	if srv.Host == "" || srv.Port <= 0 || srv.Port > 65535 || strv(in.Name, "") == "" {
		httpx.Fail(c, httpx.BadRequest("Cần tên hiển thị, host và cổng hợp lệ"))
		return
	}
	if srv.Protocol != "streamable_http" && srv.Protocol != "sse" {
		httpx.Fail(c, httpx.BadRequest("Giao thức phải là streamable_http hoặc sse"))
		return
	}
	var exists bool
	if err := a.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM mcp_server WHERE id = $1)`, in.ID).Scan(&exists); err != nil {
		httpx.Fail(c, err)
		return
	}
	if exists {
		httpx.Fail(c, httpx.Conflict("MCP_NAME_TAKEN", "Đã có server tên "+in.ID))
		return
	}
	tools, err := mcp.ListTools(ctx, srv)
	if err != nil {
		httpx.Fail(c, httpx.Unprocessable("MCP_UNREACHABLE", "Không kết nối được MCP server: "+err.Error()))
		return
	}
	var res mcp.ScanResult
	err = a.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO mcp_server (id, name, description, owner_unit, host, port, path, protocol, enabled, scope, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'departments',$9)`,
			in.ID, strv(in.Name, ""), strv(in.Description, ""), strv(in.OwnerUnit, ""), srv.Host, srv.Port, srv.Path, srv.Protocol, p.ID); err != nil {
			return err
		}
		if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "mcp.create", TargetType: "mcp_server", TargetID: in.ID, After: in}); err != nil {
			return err
		}
		var err error
		res, err = mcp.SaveTools(ctx, tx, in.ID, p.ID, tools)
		return err
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.Created(c, map[string]any{"id": in.ID, "scan": res})
}

// PATCH /mcp-servers/:id — sửa thông tin, địa chỉ; bật hoặc tạm dừng (T7). Tên server không đổi (T2).
func (a *API) updateMCPServer(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in mcpServerInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var b mcpServerInput
		var name, desc, unit, host, path, proto string
		var port int
		var enabled bool
		if err := tx.QueryRow(ctx, `SELECT name, description, owner_unit, host, port, path, protocol, enabled FROM mcp_server WHERE id = $1 FOR UPDATE`, id).
			Scan(&name, &desc, &unit, &host, &port, &path, &proto, &enabled); err != nil {
			return err
		}
		b = mcpServerInput{Name: &name, Description: &desc, OwnerUnit: &unit, Host: &host, Port: &port, Path: &path, Protocol: &proto, Enabled: &enabled}
		after := mcpServerInput{
			Name: ptr(strv(in.Name, name)), Description: ptr(strv(in.Description, desc)), OwnerUnit: ptr(strv(in.OwnerUnit, unit)),
			Host: ptr(strv(in.Host, host)), Path: ptr(strv(in.Path, path)), Protocol: ptr(strv(in.Protocol, proto)),
			Port: &port, Enabled: &enabled,
		}
		if in.Port != nil {
			after.Port = in.Port
		}
		if in.Enabled != nil {
			after.Enabled = in.Enabled
		}
		if *after.Protocol != "streamable_http" && *after.Protocol != "sse" {
			return httpx.BadRequest("Giao thức phải là streamable_http hoặc sse")
		}
		if _, err := tx.Exec(ctx, `UPDATE mcp_server SET name=$2, description=$3, owner_unit=$4, host=$5, port=$6, path=$7, protocol=$8, enabled=$9 WHERE id=$1`,
			id, *after.Name, *after.Description, *after.OwnerUnit, *after.Host, *after.Port, *after.Path, *after.Protocol, *after.Enabled); err != nil {
			return err
		}
		action := "mcp.update"
		if *after.Enabled != enabled {
			action = map[bool]string{true: "mcp.resume", false: "mcp.pause"}[*after.Enabled]
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: action, TargetType: "mcp_server", TargetID: id, Before: b, After: after})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

func ptr[T any](v T) *T { return &v }

// DELETE /mcp-servers/:id — gỡ hẳn server (giao diện bắt xác nhận).
func (a *API) deleteMCPServer(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM mcp_server WHERE id = $1`, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "mcp.delete", TargetType: "mcp_server", TargetID: id})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

// POST /mcp-servers/:id/scan — quét lại tools/list; tool mới ở trạng thái đóng.
func (a *API) scanMCPServer(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var srv mcp.Server
	if err := a.db.QueryRow(ctx, `SELECT host, port, path, protocol FROM mcp_server WHERE id = $1`, id).
		Scan(&srv.Host, &srv.Port, &srv.Path, &srv.Protocol); err != nil {
		httpx.Fail(c, err)
		return
	}
	tools, err := mcp.ListTools(ctx, srv)
	if err != nil {
		_ = mcp.MarkDown(ctx, a.db, id, err)
		httpx.Fail(c, httpx.Unprocessable("MCP_UNREACHABLE", "Không kết nối được MCP server: "+err.Error()))
		return
	}
	var res mcp.ScanResult
	err = a.tx(ctx, func(tx pgx.Tx) (err error) {
		res, err = mcp.SaveTools(ctx, tx, id, p.ID, tools)
		return err
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.OK(c, res)
}

// PUT /mcp-servers/:id/tools — {"changes": {"tool": true}} mở, đóng một hoặc nhiều tool (T5).
func (a *API) setMCPTools(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in struct {
		Changes map[string]bool `json:"changes"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		for name, on := range in.Changes {
			var before bool
			if err := tx.QueryRow(ctx, `SELECT enabled FROM mcp_tool WHERE server_id = $1 AND name = $2 FOR UPDATE`, id, name).Scan(&before); err != nil {
				return httpx.ErrNotFound.With("tool", name)
			}
			if before == on {
				continue
			}
			if _, err := tx.Exec(ctx, `UPDATE mcp_tool SET enabled = $3, reviewed_at = now() WHERE server_id = $1 AND name = $2`, id, name, on); err != nil {
				return err
			}
			if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: map[bool]string{true: "mcp.tool.open", false: "mcp.tool.close"}[on],
				TargetType: "mcp_tool", TargetID: id + "_" + name, Before: map[string]bool{"enabled": before}, After: map[string]bool{"enabled": on}}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

// PUT /mcp-servers/:id/scope — {"scope": "all"|"departments", "department_ids": [...]} (T6).
func (a *API) setMCPScope(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in struct {
		Scope         string   `json:"scope"`
		DepartmentIDs []string `json:"department_ids"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if !slices.Contains([]string{"all", "departments"}, in.Scope) {
		httpx.Fail(c, httpx.BadRequest("scope phải là all hoặc departments"))
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var before string
		if err := tx.QueryRow(ctx, `SELECT scope FROM mcp_server WHERE id = $1 FOR UPDATE`, id).Scan(&before); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE mcp_server SET scope = $2 WHERE id = $1`, id, in.Scope); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM mcp_server_dept WHERE server_id = $1`, id); err != nil {
			return err
		}
		if in.Scope == "departments" {
			for _, d := range in.DepartmentIDs {
				if _, err := tx.Exec(ctx, `INSERT INTO mcp_server_dept (server_id, department_id) VALUES ($1, $2::uuid)`, id, d); err != nil {
					return err
				}
			}
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "mcp.scope", TargetType: "mcp_server", TargetID: id,
			Before: map[string]string{"scope": before}, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

// GET /mcp-gateway-config — nội dung Backend và Policy đang áp dụng, thời điểm đồng bộ (Nền tảng).
func (a *API) mcpGatewayConfig(ctx context.Context, c *app.RequestContext) {
	if err := requirePlatform(auth.From(c)); err != nil {
		httpx.Fail(c, err)
		return
	}
	var content json.RawMessage
	var syncedAt *time.Time
	var syncErr *string
	err := a.db.QueryRow(ctx, `SELECT content, synced_at, error FROM gateway_sync_state WHERE name = 'mcp'`).Scan(&content, &syncedAt, &syncErr)
	if err == pgx.ErrNoRows {
		cfg, err := a.sync.BuildMCP(ctx)
		if err != nil {
			httpx.Fail(c, err)
			return
		}
		content, _ = json.Marshal(cfg)
	} else if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{
		"config": content, "synced_at": syncedAt, "error": syncErr, "mode": a.sync.Mode(),
		"backend_name": a.cfg.Gateway.Sync.Kube.MCPBackend, "policy_name": a.cfg.Gateway.Sync.Kube.MCPPolicy,
		"api_version": a.cfg.Gateway.Sync.Kube.AGWAPIVersion,
	})
}
