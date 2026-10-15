package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
	"bemaas/internal/notify"
)

type usageRow struct {
	Group        string          `json:"group"`
	Label        string          `json:"label"`
	Requests     int64           `json:"requests"`
	InputTokens  int64           `json:"input_tokens"`
	CacheTokens  int64           `json:"cache_tokens"`
	OutputTokens int64           `json:"output_tokens"`
	Pages        int64           `json:"pages"`
	Cost         decimal.Decimal `json:"cost_usd"`
	// Chỉ có khi group_by=key (U6): cấp cho ai, phòng, hạn mức.
	Owner      *string          `json:"owner,omitempty"`
	Department *string          `json:"department,omitempty"`
	Limit      *decimal.Decimal `json:"limit_usd,omitempty"`
	KeyKind    *string          `json:"key_kind,omitempty"`
}

// usageScope trả điều kiện SQL giới hạn phạm vi theo vai trò (U2): toàn ngân hàng (Nền tảng, Kiểm soát),
// phòng mình (quản trị phòng), key thành viên của mình. Người gọi thu hẹp thêm bằng department_id, key_id.
func usageScope(p *auth.Principal, deptID, keyID string, args *[]any) string {
	add := func(v any) string { *args = append(*args, v); return fmt.Sprintf("$%d", len(*args)) }
	conds := []string{"TRUE"}
	if !p.SeesAll() {
		conds = append(conds, "(e.department_id::text = ANY("+add(p.AdminOf)+
			") OR e.key_id IN (SELECT id FROM api_key WHERE owner_user_id = "+add(p.ID)+" AND kind = 'member'))")
	}
	if deptID != "" {
		conds = append(conds, "e.department_id::text = "+add(deptID))
	}
	if keyID != "" {
		conds = append(conds, "e.key_id::text = "+add(keyID))
	}
	return strings.Join(conds, " AND ")
}

// GET /usage?from&to&group_by=model|key|department|day — máy chủ tự giới hạn phạm vi theo vai trò.
func (a *API) usage(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	to := time.Now()
	from := to.AddDate(0, 0, -30)
	var err error
	if s := c.Query("from"); s != "" {
		if from, err = time.ParseInLocation("2006-01-02", s, a.loc); err != nil {
			httpx.Fail(c, httpx.BadRequest("from phải có dạng YYYY-MM-DD"))
			return
		}
	}
	if s := c.Query("to"); s != "" {
		if to, err = time.ParseInLocation("2006-01-02", s, a.loc); err != nil {
			httpx.Fail(c, httpx.BadRequest("to phải có dạng YYYY-MM-DD"))
			return
		}
		to = to.AddDate(0, 0, 1) // bao gồm cả ngày `to`
	}
	if !from.Before(to) || to.Sub(from) > 400*24*time.Hour {
		httpx.Fail(c, httpx.BadRequest("Khoảng thời gian không hợp lệ (tối đa 400 ngày)"))
		return
	}

	args := []any{from, to}
	scope := usageScope(p, c.Query("department_id"), c.Query("key_id"), &args)

	day := "to_char(e.ts AT TIME ZONE %s, 'YYYY-MM-DD')"
	groups := map[string][3]string{ // nhóm, nhãn, join
		"model":      {"e.model_id", "max(COALESCE(m.name, e.model_id))", "LEFT JOIN model m ON m.id = e.model_id"},
		"key":        {"e.key_id::text", "max(k.name)", "JOIN api_key k ON k.id = e.key_id"},
		"department": {"e.department_id::text", "max(d.name)", "JOIN department d ON d.id = e.department_id"},
		"day":        {day, day, ""},
	}
	groupBy := c.DefaultQuery("group_by", "model")
	g, ok := groups[groupBy]
	if !ok {
		httpx.Fail(c, httpx.BadRequest("group_by phải là model, key, department hoặc day"))
		return
	}
	if groupBy == "day" { // ngày theo múi giờ cấu hình (B2)
		args = append(args, a.loc.String())
		g[0] = fmt.Sprintf(day, fmt.Sprintf("$%d", len(args)))
		g[1] = g[0]
	}
	order := "8 DESC"
	if groupBy == "day" {
		order = "1"
	}
	sql := fmt.Sprintf(`
		SELECT %s, %s, count(*), COALESCE(sum(e.input_tokens),0), COALESCE(sum(e.cache_tokens),0),
		       COALESCE(sum(e.output_tokens),0), COALESCE(sum(e.pages),0), COALESCE(sum(e.cost_usd),0)
		FROM usage_event e %s
		WHERE e.ts >= $1 AND e.ts < $2 AND %s
		GROUP BY 1 ORDER BY %s`, g[0], g[1], g[2], scope, order)
	rows, err := a.db.Query(ctx, sql, args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (usageRow, error) {
		var u usageRow
		return u, r.Scan(&u.Group, &u.Label, &u.Requests, &u.InputTokens, &u.CacheTokens, &u.OutputTokens, &u.Pages, &u.Cost)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var total usageRow
	for _, r := range items {
		total.Requests += r.Requests
		total.InputTokens += r.InputTokens
		total.CacheTokens += r.CacheTokens
		total.OutputTokens += r.OutputTokens
		total.Pages += r.Pages
		total.Cost = total.Cost.Add(r.Cost)
	}
	if groupBy == "key" {
		for i := range items {
			var owner, dept, kind string
			var limit decimal.Decimal
			if err := a.db.QueryRow(ctx, `
				SELECT COALESCE(u.name, ''), d.name, k.kind, k.monthly_limit_usd
				FROM api_key k JOIN department d ON d.id = k.department_id LEFT JOIN app_user u ON u.id = k.owner_user_id
				WHERE k.id::text = $1`, items[i].Group).Scan(&owner, &dept, &kind, &limit); err == nil {
				items[i].Owner, items[i].Department, items[i].KeyKind, items[i].Limit = &owner, &dept, &kind, &limit
			}
		}
	}
	budget, err := a.scopeBudget(ctx, p)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var lastEvent *time.Time
	_ = a.db.QueryRow(ctx, `SELECT max(ts) FROM usage_event`).Scan(&lastEvent)
	httpx.OK(c, map[string]any{"items": items, "total": total, "from": from, "to": to, "updated_at": lastEvent, "budget": budget})
}

// scopeBudget trả ngân sách tháng và số đã dùng của phạm vi người xem (U4): toàn ngân hàng, các phòng
// mình quản trị, hoặc tổng hạn mức các key thành viên của mình.
func (a *API) scopeBudget(ctx context.Context, p *auth.Principal) (map[string]any, error) {
	var limit, used decimal.Decimal
	var label string
	var err error
	switch {
	case p.SeesAll():
		label = "Toàn ngân hàng"
		err = a.db.QueryRow(ctx, `
			SELECT COALESCE((SELECT sum(monthly_budget_usd) FROM department), 0),
			       COALESCE((SELECT sum(cost_usd) FROM usage_month WHERE period = $1), 0)`, a.period()).Scan(&limit, &used)
	case len(p.AdminOf) > 0:
		label = "Phòng của tôi"
		err = a.db.QueryRow(ctx, `
			SELECT COALESCE((SELECT sum(monthly_budget_usd) FROM department WHERE id::text = ANY($2)), 0),
			       COALESCE((SELECT sum(cost_usd) FROM usage_month WHERE period = $1 AND department_id::text = ANY($2)), 0)`,
			a.period(), p.AdminOf).Scan(&limit, &used)
	default:
		label = "Key của tôi"
		err = a.db.QueryRow(ctx, `
			SELECT COALESCE((SELECT sum(monthly_limit_usd) FROM api_key WHERE owner_user_id = $2 AND kind = 'member' AND status IN `+liveKeyStatuses+`), 0),
			       COALESCE((SELECT sum(m.cost_usd) FROM usage_month m JOIN api_key k ON k.id = m.key_id
			                 WHERE m.period = $1 AND k.owner_user_id = $2 AND k.kind = 'member'), 0)`,
			a.period(), p.ID).Scan(&limit, &used)
	}
	return map[string]any{"scope": label, "period": a.period(), "limit_usd": limit, "used_usd": used}, err
}

// --- Yêu cầu tăng hạn mức, ngân sách (R1) -----------------------------------

type LimitRequest struct {
	ID           string          `json:"id"`
	Kind         string          `json:"kind"`
	TargetID     string          `json:"target_id"`
	TargetName   string          `json:"target_name"`
	DepartmentID string          `json:"department_id"`
	Requested    decimal.Decimal `json:"requested_usd"`
	Reason       string          `json:"reason"`
	Status       string          `json:"status"`
	RequestedBy  UserRef         `json:"requested_by"`
	CreatedAt    time.Time       `json:"created_at"`
	DecidedBy    *string         `json:"decided_by"`
	DecidedAt    *time.Time      `json:"decided_at"`
	DecisionNote *string         `json:"decision_note"`
}

func (a *API) listLimitRequests(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	where, args := "r.requested_by = $1 OR r.department_id::text = ANY($2)", []any{p.ID, p.AdminOf}
	if p.SeesAll() {
		where, args = "TRUE", nil
	}
	rows, err := a.db.Query(ctx, `
		SELECT r.id::text, r.kind, r.target_id::text,
		       COALESCE((SELECT name FROM api_key WHERE id = r.target_id), (SELECT name FROM department WHERE id = r.target_id), ''),
		       r.department_id::text, r.requested_usd, r.reason, r.status, u.id, u.email, u.name, r.created_at,
		       r.decided_by, r.decided_at, r.decision_note
		FROM limit_request r JOIN app_user u ON u.id = r.requested_by
		WHERE `+where+` ORDER BY r.created_at DESC LIMIT 200`, args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (LimitRequest, error) {
		var l LimitRequest
		return l, r.Scan(&l.ID, &l.Kind, &l.TargetID, &l.TargetName, &l.DepartmentID, &l.Requested, &l.Reason, &l.Status,
			&l.RequestedBy.ID, &l.RequestedBy.Email, &l.RequestedBy.Name, &l.CreatedAt, &l.DecidedBy, &l.DecidedAt, &l.DecisionNote)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

// POST /limit-requests — thành viên xin tăng hạn mức key của mình; quản trị phòng xin tăng ngân sách phòng.
func (a *API) createLimitRequest(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	var in struct {
		Kind      string          `json:"kind"`
		TargetID  string          `json:"target_id"`
		Requested decimal.Decimal `json:"requested_usd"`
		Reason    string          `json:"reason"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if strings.TrimSpace(in.Reason) == "" || !in.Requested.IsPositive() {
		httpx.Fail(c, httpx.BadRequest("Cần mức đề nghị và lý do"))
		return
	}
	var id, deptID string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		switch in.Kind {
		case "key_limit":
			var owner *string
			if err := tx.QueryRow(ctx, `SELECT department_id::text, owner_user_id FROM api_key WHERE id::text = $1`, in.TargetID).Scan(&deptID, &owner); err != nil {
				return err
			}
			if owner == nil || *owner != p.ID {
				return httpx.ErrForbidden
			}
		case "dept_budget":
			deptID = in.TargetID
			if !p.IsDeptAdmin(deptID) {
				return httpx.ErrForbidden
			}
		default:
			return httpx.BadRequest("kind phải là key_limit hoặc dept_budget")
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO limit_request (kind, target_id, department_id, requested_usd, reason, requested_by)
			VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6) RETURNING id::text`,
			in.Kind, in.TargetID, deptID, in.Requested.Round(2), in.Reason, p.ID).Scan(&id); err != nil {
			return err
		}
		if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "limit_request.create", TargetType: "limit_request", TargetID: id,
			DepartmentID: deptID, After: in}); err != nil {
			return err
		}
		// Người duyệt: hạn mức key do quản trị phòng duyệt, ngân sách phòng do quản trị nền tảng duyệt (R1).
		approvers, err := notify.DeptAdmins(ctx, tx, deptID)
		title := "Yêu cầu tăng hạn mức key"
		if in.Kind == "dept_budget" {
			approvers, err = notify.PlatformAdmins(ctx, tx)
			title = "Yêu cầu tăng ngân sách phòng"
		}
		if err != nil {
			return err
		}
		return notify.Send(ctx, tx, approvers, notify.Message{
			Kind: "limit_request.created", Title: title,
			Body: p.Name + " đề nghị " + in.Requested.StringFixed(2) + " USD/tháng: " + in.Reason,
			Link: "/budget?tab=requests",
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

func (a *API) approveLimitRequest(ctx context.Context, c *app.RequestContext) {
	a.decideLimitRequest(ctx, c, true)
}
func (a *API) rejectLimitRequest(ctx context.Context, c *app.RequestContext) {
	a.decideLimitRequest(ctx, c, false)
}

// Duyệt: yêu cầu hạn mức key do quản trị phòng (hoặc Nền tảng) duyệt và vẫn phải qua B3;
// yêu cầu ngân sách phòng do Nền tảng duyệt.
func (a *API) decideLimitRequest(ctx context.Context, c *app.RequestContext, approve bool) {
	p, id := auth.From(c), c.Param("id")
	var in struct {
		Note string `json:"note"`
	}
	if len(c.Request.Body()) > 0 {
		if err := httpx.Bind(c, &in); err != nil {
			httpx.Fail(c, err)
			return
		}
	}
	if !approve && strings.TrimSpace(in.Note) == "" {
		httpx.Fail(c, httpx.BadRequest("Từ chối cần kèm lý do"))
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var kind, target, dept, status, requester string
		var requested decimal.Decimal
		if err := tx.QueryRow(ctx, `SELECT kind, target_id::text, department_id::text, status, requested_usd, requested_by FROM limit_request WHERE id::text = $1 FOR UPDATE`, id).
			Scan(&kind, &target, &dept, &status, &requested, &requester); err != nil {
			return err
		}
		if status != "open" {
			return httpx.Conflict("REQUEST_DECIDED", "Yêu cầu đã được xử lý")
		}
		if (kind == "key_limit" && !p.CanManageDept(dept)) || (kind == "dept_budget" && !p.IsPlatform) {
			return httpx.ErrForbidden
		}
		if approve {
			switch kind {
			case "key_limit":
				if err := checkLimit(ctx, tx, dept, target, requested); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					UPDATE api_key SET monthly_limit_usd = $2,
					       status = CASE WHEN status = 'blocked_key' THEN 'active' ELSE status END
					WHERE id::text = $1`, target, requested); err != nil {
					return err
				}
				if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.update", TargetType: "api_key", TargetID: target,
					DepartmentID: dept, After: map[string]any{"monthly_limit_usd": requested}, Reason: "Duyệt yêu cầu " + id}); err != nil {
					return err
				}
			case "dept_budget":
				if _, err := tx.Exec(ctx, `UPDATE department SET monthly_budget_usd = GREATEST(monthly_budget_usd, $2) WHERE id::text = $1`, target, requested); err != nil {
					return err
				}
				if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "department.update", TargetType: "department", TargetID: target,
					DepartmentID: dept, After: map[string]any{"monthly_budget_usd": requested}, Reason: "Duyệt yêu cầu " + id}); err != nil {
					return err
				}
			}
		}
		newStatus := map[bool]string{true: "approved", false: "rejected"}[approve]
		if _, err := tx.Exec(ctx, `UPDATE limit_request SET status=$2, decided_by=$3, decided_at=now(), decision_note=NULLIF($4,'') WHERE id::text=$1`,
			id, newStatus, p.ID, in.Note); err != nil {
			return err
		}
		if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "limit_request." + newStatus, TargetType: "limit_request", TargetID: id,
			DepartmentID: dept, Reason: in.Note}); err != nil {
			return err
		}
		title := "Yêu cầu tăng hạn mức đã được duyệt"
		if !approve {
			title = "Yêu cầu tăng hạn mức bị từ chối"
		}
		return notify.Send(ctx, tx, []string{requester}, notify.Message{
			Kind: "limit_request." + newStatus, Title: title,
			Body: "Mức đề nghị " + requested.StringFixed(2) + " USD/tháng. " + in.Note,
			Link: "/budget?tab=requests",
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

// GET /audit-log — Nền tảng, Kiểm soát: tất cả; quản trị phòng: phòng mình; thành viên: của mình.
func (a *API) auditLog(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	where, args := "(l.actor_user_id = $1 OR l.department_id::text = ANY($2))", []any{p.ID, p.AdminOf}
	if p.SeesAll() {
		where, args = "TRUE", nil
	}
	if d := c.Query("department_id"); d != "" {
		args = append(args, d)
		where += fmt.Sprintf(" AND l.department_id::text = $%d", len(args))
	}
	args = append(args, queryInt(c, "limit", 100, 500))
	rows, err := a.db.Query(ctx, `
		SELECT l.id, l.ts, l.actor_user_id, COALESCE(u.name, l.actor_user_id) AS name, l.action, l.target_type, l.target_id,
		       l.department_id::text AS department_id, l.before, l.after, l.reason
		FROM audit_log l LEFT JOIN app_user u ON u.id = l.actor_user_id
		WHERE `+where+fmt.Sprintf(` ORDER BY l.id DESC LIMIT $%d`, len(args)), args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}
