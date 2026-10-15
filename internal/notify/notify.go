// Package notify ghi thông báo trong ứng dụng (mục 13). Kênh email hoặc chat nội bộ chưa chốt
// (câu hỏi mở 7); khi chốt thì thêm bộ gửi đọc bảng notification, không phải sửa nơi phát sự kiện.
package notify

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type Message struct {
	Kind  string
	Title string
	Body  string
	Link  string
	// Dedup: cùng người nhận và cùng Dedup thì chỉ ghi một lần (ví dụ ngưỡng 80% của key trong một tháng).
	Dedup string
}

// Send ghi thông báo cho từng người nhận; người nhận trùng chỉ nhận một lần.
func Send(ctx context.Context, db DB, userIDs []string, m Message) error {
	seen := map[string]bool{}
	for _, uid := range userIDs {
		if uid == "" || seen[uid] {
			continue
		}
		seen[uid] = true
		var dedup *string
		if m.Dedup != "" {
			dedup = &m.Dedup
		}
		if _, err := db.Exec(ctx, `
			INSERT INTO notification (user_id, kind, title, body, link, dedup_key) VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING`,
			uid, m.Kind, m.Title, m.Body, m.Link, dedup); err != nil {
			return err
		}
	}
	return nil
}

// DeptAdmins trả danh sách quản trị của một phòng.
func DeptAdmins(ctx context.Context, db DB, deptID string) ([]string, error) {
	return ids(ctx, db, `SELECT user_id FROM department_admin WHERE department_id::text = $1`, deptID)
}

// PlatformAdmins trả danh sách quản trị nền tảng.
func PlatformAdmins(ctx context.Context, db DB) ([]string, error) {
	return ids(ctx, db, `SELECT user_id FROM platform_admin`)
}

func ids(ctx context.Context, db DB, sql string, args ...any) ([]string, error) {
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
