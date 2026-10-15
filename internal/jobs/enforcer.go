// Package jobs chứa các việc chạy nền: Budget Enforcer (mục 10.3).
package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"bemaas/internal/audit"
	"bemaas/internal/cache"
	"bemaas/internal/gateway"
	"bemaas/internal/notify"
)

type Enforcer struct {
	db       *pgxpool.Pool
	cache    *cache.Cache
	sync     *gateway.Syncer
	loc      *time.Location
	interval time.Duration
}

func NewEnforcer(db *pgxpool.Pool, c *cache.Cache, s *gateway.Syncer, loc *time.Location, interval time.Duration) *Enforcer {
	return &Enforcer{db: db, cache: c, sync: s, loc: loc, interval: interval}
}

func (e *Enforcer) Run(ctx context.Context) {
	t := time.NewTicker(e.interval)
	defer t.Stop()
	for {
		e.runOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (e *Enforcer) runOnce(ctx context.Context) {
	unlock, ok := e.cache.TryLock(ctx, "budget-enforcer", e.interval)
	if !ok {
		return
	}
	defer unlock()
	changed, err := e.Enforce(ctx)
	if err != nil {
		slog.Error("budget enforcer lỗi", "err", err)
		return
	}
	if changed > 0 {
		slog.Info("budget enforcer đổi trạng thái key", "count", changed)
		e.sync.Trigger()
	}
}

type transition struct {
	id, dept, from, to, reason string
}

// Enforce chạy một lượt:
//  1. key quá hạn → expired (K5);
//  2. key active có chi phí tháng ≥ hạn mức → blocked_key; phòng có chi phí ≥ ngân sách → mọi key active → blocked_dept (B6);
//  3. key đang khoá mà điều kiện không còn đúng (tăng hạn mức, sang tháng mới) → active.
//
// Ngưỡng 80% và 100% và key sắp hết hạn được gửi thành thông báo trong ứng dụng (mục 13).
func (e *Enforcer) Enforce(ctx context.Context) (int, error) {
	period := time.Now().In(e.loc).Format("2006-01")
	var ts []transition
	err := pgx.BeginFunc(ctx, e.db, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			WITH key_cost AS (
			    SELECT key_id, sum(cost_usd) AS cost FROM usage_month WHERE period = $1 GROUP BY key_id),
			dept_cost AS (
			    SELECT department_id, sum(cost_usd) AS cost FROM usage_month WHERE period = $1 GROUP BY department_id),
			state AS (
			    SELECT k.id, k.department_id, k.status,
			           CASE
			             WHEN k.expires_at IS NOT NULL AND k.expires_at <= now() THEN 'expired'
			             WHEN COALESCE(kc.cost, 0) >= k.monthly_limit_usd THEN 'blocked_key'
			             WHEN COALESCE(dc.cost, 0) >= d.monthly_budget_usd THEN 'blocked_dept'
			             ELSE 'active'
			           END AS want
			    FROM api_key k
			    JOIN department d ON d.id = k.department_id
			    LEFT JOIN key_cost kc ON kc.key_id = k.id
			    LEFT JOIN dept_cost dc ON dc.department_id = k.department_id
			    WHERE k.status IN ('active','blocked_key','blocked_dept')
			       OR (k.status = 'pending' AND k.expires_at IS NOT NULL AND k.expires_at <= now())
			    FOR UPDATE OF k)
			SELECT id::text, department_id::text, status, want FROM state
			WHERE status <> want AND NOT (status = 'pending' AND want <> 'expired')`, period)
		if err != nil {
			return err
		}
		ts, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (transition, error) {
			var t transition
			return t, r.Scan(&t.id, &t.dept, &t.from, &t.to)
		})
		if err != nil {
			return err
		}
		for _, t := range ts {
			if _, err := tx.Exec(ctx, `UPDATE api_key SET status = $2 WHERE id::text = $1`, t.id, t.to); err != nil {
				return err
			}
			reason := map[string]string{
				"expired":      "Key hết thời hạn (K5)",
				"blocked_key":  "Chi phí tháng của key đạt hạn mức (B6)",
				"blocked_dept": "Chi phí tháng của phòng đạt ngân sách (B6)",
				"active":       "Điều kiện khoá không còn đúng",
			}[t.to]
			if err := audit.Write(ctx, tx, audit.Entry{Actor: audit.System, Action: "key.status", TargetType: "api_key",
				TargetID: t.id, DepartmentID: t.dept, Before: map[string]string{"status": t.from},
				After: map[string]string{"status": t.to}, Reason: reason}); err != nil {
				return err
			}
		}
		if err := recordThresholds(ctx, tx, period); err != nil {
			return err
		}
		return notifyExpiring(ctx, tx)
	})
	return len(ts), err
}

// recordThresholds ghi ngưỡng 80% và 100% của key và phòng (mỗi ngưỡng một lần mỗi tháng)
// rồi gửi thông báo cho đúng người nhận theo mục 13.
func recordThresholds(ctx context.Context, tx pgx.Tx, period string) error {
	rows, err := tx.Query(ctx, `
		INSERT INTO threshold_notice (period, target_type, target_id, threshold)
		SELECT $1, 'key', k.id, t.th
		FROM api_key k
		JOIN (SELECT key_id, sum(cost_usd) AS cost FROM usage_month WHERE period = $1 GROUP BY key_id) c ON c.key_id = k.id
		CROSS JOIN (VALUES (80), (100)) t(th)
		WHERE k.monthly_limit_usd > 0 AND c.cost * 100 >= k.monthly_limit_usd * t.th
		UNION ALL
		SELECT $1, 'department', d.id, t.th
		FROM department d
		JOIN (SELECT department_id, sum(cost_usd) AS cost FROM usage_month WHERE period = $1 GROUP BY department_id) c ON c.department_id = d.id
		CROSS JOIN (VALUES (80), (100)) t(th)
		WHERE d.monthly_budget_usd > 0 AND c.cost * 100 >= d.monthly_budget_usd * t.th
		ON CONFLICT DO NOTHING
		RETURNING target_type, target_id::text, threshold`, period)
	if err != nil {
		return err
	}
	type hit struct {
		kind, id string
		th       int
	}
	hits, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (hit, error) {
		var h hit
		return h, r.Scan(&h.kind, &h.id, &h.th)
	})
	if err != nil {
		return err
	}
	for _, h := range hits {
		if err := sendThreshold(ctx, tx, period, h.kind, h.id, h.th); err != nil {
			return err
		}
	}
	return nil
}

func sendThreshold(ctx context.Context, tx pgx.Tx, period, kind, id string, th int) error {
	var name, deptID string
	var owner *string
	var recipients []string
	var err error
	if kind == "key" {
		if err := tx.QueryRow(ctx, `SELECT name, department_id::text, owner_user_id FROM api_key WHERE id::text = $1`, id).
			Scan(&name, &deptID, &owner); err != nil {
			return err
		}
		if recipients, err = notify.DeptAdmins(ctx, tx, deptID); err != nil {
			return err
		}
		if owner != nil {
			recipients = append(recipients, *owner)
		}
		return notify.Send(ctx, tx, recipients, notify.Message{
			Kind: "key.threshold", Title: fmt.Sprintf("Key %s đã dùng %d%% hạn mức tháng", name, th),
			Body: thresholdBody(th), Link: "/budget/departments/" + deptID,
			Dedup: fmt.Sprintf("key.threshold:%s:%s:%d", id, period, th),
		})
	}
	if err := tx.QueryRow(ctx, `SELECT name FROM department WHERE id::text = $1`, id).Scan(&name); err != nil {
		return err
	}
	admins, err := notify.DeptAdmins(ctx, tx, id)
	if err != nil {
		return err
	}
	platform, err := notify.PlatformAdmins(ctx, tx)
	if err != nil {
		return err
	}
	return notify.Send(ctx, tx, append(admins, platform...), notify.Message{
		Kind: "dept.threshold", Title: fmt.Sprintf("%s đã dùng %d%% ngân sách tháng", name, th),
		Body: thresholdBody(th), Link: "/budget/departments/" + id,
		Dedup: fmt.Sprintf("dept.threshold:%s:%s:%d", id, period, th),
	})
}

func thresholdBody(th int) string {
	if th >= 100 {
		return "Lời gọi bị từ chối cho đến khi được tăng hạn mức hoặc sang tháng mới."
	}
	return "Cân nhắc xin tăng hạn mức trước khi bị khoá."
}

// notifyExpiring báo key sắp hết hạn trong 7 ngày (mỗi key một lần cho mỗi ngày hết hạn).
func notifyExpiring(ctx context.Context, tx pgx.Tx) error {
	rows, err := tx.Query(ctx, `
		SELECT id::text, name, department_id::text, owner_user_id, to_char(expires_at, 'YYYY-MM-DD')
		FROM api_key
		WHERE status IN ('active','pending','blocked_key','blocked_dept')
		  AND expires_at > now() AND expires_at <= now() + interval '7 days'`)
	if err != nil {
		return err
	}
	type exp struct {
		id, name, dept, day string
		owner               *string
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (exp, error) {
		var e exp
		return e, r.Scan(&e.id, &e.name, &e.dept, &e.owner, &e.day)
	})
	if err != nil {
		return err
	}
	for _, e := range list {
		recipients, err := notify.DeptAdmins(ctx, tx, e.dept)
		if err != nil {
			return err
		}
		if e.owner != nil {
			recipients = append(recipients, *e.owner)
		}
		if err := notify.Send(ctx, tx, recipients, notify.Message{
			Kind: "key.expiring", Title: "Key " + e.name + " hết hạn ngày " + e.day,
			Body: "Sau ngày này key ngừng hoạt động. Liên hệ quản trị phòng nếu cần gia hạn.",
			Link: "/budget/departments/" + e.dept, Dedup: "key.expiring:" + e.id + ":" + e.day,
		}); err != nil {
			return err
		}
	}
	return nil
}
