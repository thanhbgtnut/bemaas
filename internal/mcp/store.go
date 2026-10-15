package mcp

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"bemaas/internal/audit"
)

// ScanResult cho biết lần quét thêm, bớt bao nhiêu tool.
type ScanResult struct {
	Tools   int      `json:"tools"`
	Added   []string `json:"added"`
	Removed []string `json:"removed"`
}

// SaveTools đồng bộ bảng mcp_tool với danh sách vừa quét:
// tool mới ở trạng thái đóng (T4), tool không còn trên server thì bỏ, tool cũ giữ công tắc.
// actor là người bấm "Quét lại tool", hoặc audit.System khi job quét định kỳ.
func SaveTools(ctx context.Context, tx pgx.Tx, serverID, actor string, tools []Tool) (ScanResult, error) {
	res := ScanResult{Tools: len(tools)}
	seen := map[string]bool{}
	for _, t := range tools {
		seen[t.Name] = true
		var inserted bool
		err := tx.QueryRow(ctx, `
			INSERT INTO mcp_tool (server_id, name, description, read_only, enabled)
			VALUES ($1, $2, $3, $4, false)
			ON CONFLICT (server_id, name) DO UPDATE SET description = EXCLUDED.description, read_only = EXCLUDED.read_only
			RETURNING (xmax = 0)`, serverID, t.Name, t.Description, t.ReadOnly).Scan(&inserted)
		if err != nil {
			return res, err
		}
		if inserted {
			res.Added = append(res.Added, t.Name)
		}
	}
	rows, err := tx.Query(ctx, `SELECT name FROM mcp_tool WHERE server_id = $1`, serverID)
	if err != nil {
		return res, err
	}
	existing, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return res, err
	}
	for _, name := range existing {
		if !seen[name] {
			if _, err := tx.Exec(ctx, `DELETE FROM mcp_tool WHERE server_id = $1 AND name = $2`, serverID, name); err != nil {
				return res, err
			}
			res.Removed = append(res.Removed, name)
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE mcp_server SET last_scanned_at = now(), health = 'ok', last_error = NULL WHERE id = $1`, serverID); err != nil {
		return res, err
	}
	if len(res.Added) > 0 || len(res.Removed) > 0 {
		if err := audit.Write(ctx, tx, audit.Entry{Actor: actor, Action: "mcp.scan", TargetType: "mcp_server", TargetID: serverID,
			After: map[string]any{"added": res.Added, "removed": res.Removed}, Reason: "Quét tools/list"}); err != nil {
			return res, err
		}
	}
	return res, nil
}

// MarkDown ghi trạng thái "Không kết nối được" (T11).
func MarkDown(ctx context.Context, db *pgxpool.Pool, serverID string, cause error) error {
	_, err := db.Exec(ctx, `UPDATE mcp_server SET health = 'down', last_error = $2 WHERE id = $1`, serverID, cause.Error())
	return err
}

// ScanAll quét lại mọi server: cập nhật trạng thái kết nối và phát hiện tool mới (T3, T11).
// Trả true nếu danh sách tool thay đổi, để Gateway Sync ghi lại cấu hình.
func ScanAll(ctx context.Context, db *pgxpool.Pool) (bool, error) {
	rows, err := db.Query(ctx, `SELECT id, host, port, path, protocol FROM mcp_server ORDER BY id`)
	if err != nil {
		return false, err
	}
	type srv struct {
		id string
		s  Server
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (srv, error) {
		var x srv
		return x, r.Scan(&x.id, &x.s.Host, &x.s.Port, &x.s.Path, &x.s.Protocol)
	})
	if err != nil {
		return false, err
	}
	changed := false
	for _, x := range list {
		tools, err := ListTools(ctx, x.s)
		if err != nil {
			slog.Warn("MCP server không kết nối được", "server", x.id, "err", err)
			if err := MarkDown(ctx, db, x.id, err); err != nil {
				return changed, err
			}
			continue
		}
		err = pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			res, err := SaveTools(ctx, tx, x.id, audit.System, tools)
			if len(res.Added)+len(res.Removed) > 0 {
				changed = true
			}
			return err
		})
		if err != nil {
			return changed, err
		}
	}
	return changed, nil
}

// RunScanner chạy ScanAll định kỳ; chỉ một bản sao chạy nhờ lock do người gọi truyền vào.
func RunScanner(ctx context.Context, db *pgxpool.Pool, every time.Duration, lock func(context.Context) (func(), bool), onChange func()) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if unlock, ok := lock(ctx); ok {
			changed, err := ScanAll(ctx, db)
			unlock()
			if err != nil {
				slog.Error("quét MCP server lỗi", "err", err)
			}
			if changed {
				onChange()
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
