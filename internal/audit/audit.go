// Package audit ghi nhật ký thao tác (mục 14): chỉ thêm, không sửa, không xoá.
package audit

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgconn"
)

const System = "system"

type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type Entry struct {
	Actor        string
	Action       string // ví dụ: key.create, key.revoke, department.budget
	TargetType   string
	TargetID     string
	DepartmentID string // rỗng nếu không thuộc phòng nào
	Before       any
	After        any
	Reason       string
}

// Write ghi trong cùng transaction với thay đổi, để không có thay đổi nào thiếu nhật ký.
func Write(ctx context.Context, db Execer, e Entry) error {
	var dept *string
	if e.DepartmentID != "" {
		dept = &e.DepartmentID
	}
	_, err := db.Exec(ctx, `
		INSERT INTO audit_log (actor_user_id, action, target_type, target_id, department_id, before, after, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''))`,
		e.Actor, e.Action, e.TargetType, e.TargetID, dept, toJSON(e.Before), toJSON(e.After), e.Reason)
	return err
}

func toJSON(v any) []byte {
	if v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	return b
}
