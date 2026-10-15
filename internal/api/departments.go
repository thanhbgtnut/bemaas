package api

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
)

type Department struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Block         string          `json:"block"`
	MonthlyBudget decimal.Decimal `json:"monthly_budget_usd"`
	Status        string          `json:"status"`
	Used          decimal.Decimal `json:"used_usd"`      // chi phí tháng hiện tại
	Allocated     decimal.Decimal `json:"allocated_usd"` // tổng hạn mức các key còn hiệu lực
	Unallocated   decimal.Decimal `json:"unallocated_usd"`
	KeyCount      int64           `json:"key_count"`
	Admins        []UserRef       `json:"admins"`
	CreatedAt     time.Time       `json:"created_at"`
}

type UserRef struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// Key "còn hiệu lực" để tính hạn mức đã chia (B3, B7): chưa thu hồi, chưa hết hạn.
const liveKeyStatuses = `('pending','active','blocked_key','blocked_dept')`

const deptSelect = `
	SELECT d.id::text, d.name, d.block, d.monthly_budget_usd, d.status, d.created_at,
	       COALESCE((SELECT sum(cost_usd) FROM usage_month u WHERE u.department_id = d.id AND u.period = $1), 0),
	       COALESCE((SELECT sum(monthly_limit_usd) FROM api_key k WHERE k.department_id = d.id AND k.status IN ` + liveKeyStatuses + `), 0),
	       (SELECT count(*) FROM api_key k WHERE k.department_id = d.id AND k.status IN ` + liveKeyStatuses + `),
	       COALESCE((SELECT json_agg(json_build_object('id', u.id, 'email', u.email, 'name', u.name) ORDER BY u.name)
	                 FROM department_admin da JOIN app_user u ON u.id = da.user_id WHERE da.department_id = d.id), '[]')
	FROM department d`

func scanDept(r pgx.Row) (*Department, error) {
	var d Department
	err := r.Scan(&d.ID, &d.Name, &d.Block, &d.MonthlyBudget, &d.Status, &d.CreatedAt, &d.Used, &d.Allocated, &d.KeyCount, &d.Admins)
	d.Unallocated = d.MonthlyBudget.Sub(d.Allocated)
	return &d, err
}

// GET /departments — Nền tảng, Kiểm soát thấy mọi phòng; quản trị phòng thấy phòng mình.
func (a *API) listDepartments(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	q, args := deptSelect+` WHERE d.id::text = ANY($2) ORDER BY d.name`, []any{a.period(), p.AdminOf}
	if p.SeesAll() {
		q, args = deptSelect+` ORDER BY d.name`, []any{a.period()}
	}
	rows, err := a.db.Query(ctx, q, args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	defer rows.Close()
	items := []*Department{}
	for rows.Next() {
		d, err := scanDept(rows)
		if err != nil {
			httpx.Fail(c, err)
			return
		}
		items = append(items, d)
	}
	httpx.OK(c, map[string]any{"items": items, "period": a.period()})
}

func (a *API) getDepartment(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if !p.CanManageDept(id) && !p.IsAuditor {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	d, err := scanDept(a.db.QueryRow(ctx, deptSelect+` WHERE d.id::text = $2`, a.period(), id))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"department": d, "period": a.period()})
}

type deptInput struct {
	Name          *string          `json:"name"`
	Block         *string          `json:"block"`
	MonthlyBudget *decimal.Decimal `json:"monthly_budget_usd"`
	Status        *string          `json:"status"`
	AdminEmails   []string         `json:"admin_emails"`
	Reason        string           `json:"reason"`
}

// POST /departments — tạo phòng, chỉ định quản trị phòng (Nền tảng).
func (a *API) createDepartment(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in deptInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
		httpx.Fail(c, httpx.BadRequest("Cần tên phòng"))
		return
	}
	budget := decimal.Zero
	if in.MonthlyBudget != nil {
		budget = in.MonthlyBudget.Round(2)
	}
	if budget.IsNegative() {
		httpx.Fail(c, httpx.BadRequest("Ngân sách không được âm"))
		return
	}
	block := ""
	if in.Block != nil {
		block = *in.Block
	}
	var id string
	var adminIDs []string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO department (name, block, monthly_budget_usd) VALUES ($1, $2, $3) RETURNING id::text`,
			strings.TrimSpace(*in.Name), block, budget).Scan(&id); err != nil {
			return err
		}
		var err error
		if adminIDs, err = replaceAdmins(ctx, tx, id, in.AdminEmails); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "department.create", TargetType: "department", TargetID: id,
			DepartmentID: id, After: map[string]any{"name": *in.Name, "block": block, "monthly_budget_usd": budget, "admins": adminIDs}})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.invalidateUser(ctx, adminIDs...)
	httpx.Created(c, map[string]string{"id": id})
}

// PATCH /departments/:id — sửa tên, khối, ngân sách, trạng thái (Nền tảng).
// Không được giảm ngân sách xuống dưới tổng hạn mức đã chia (B4).
func (a *API) updateDepartment(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in deptInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if in.Status != nil && !slices.Contains([]string{"active", "suspended"}, *in.Status) {
		httpx.Fail(c, httpx.BadRequest("status phải là active hoặc suspended"))
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var before struct {
			Name, Block, Status string
			Budget              decimal.Decimal
		}
		if err := tx.QueryRow(ctx, `SELECT name, block, status, monthly_budget_usd FROM department WHERE id::text = $1 FOR UPDATE`, id).
			Scan(&before.Name, &before.Block, &before.Status, &before.Budget); err != nil {
			return err
		}
		after := before
		if in.Name != nil {
			after.Name = strings.TrimSpace(*in.Name)
		}
		if in.Block != nil {
			after.Block = *in.Block
		}
		if in.Status != nil {
			after.Status = *in.Status
		}
		if in.MonthlyBudget != nil {
			after.Budget = in.MonthlyBudget.Round(2)
			if after.Budget.IsNegative() {
				return httpx.BadRequest("Ngân sách không được âm")
			}
			allocated, err := allocated(ctx, tx, id, "")
			if err != nil {
				return err
			}
			if after.Budget.LessThan(allocated) {
				return httpx.Unprocessable("BUDGET_BELOW_ALLOCATED", "Ngân sách mới thấp hơn tổng hạn mức đã chia cho key. Hãy giảm hạn mức key trước.").
					With("allocated_usd", allocated)
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE department SET name=$2, block=$3, status=$4, monthly_budget_usd=$5 WHERE id::text=$1`,
			id, after.Name, after.Block, after.Status, after.Budget); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "department.update", TargetType: "department", TargetID: id,
			DepartmentID: id, Before: before, After: after, Reason: in.Reason})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger() // ngân sách đổi có thể mở khoá hoặc khoá key ở lượt Enforcer kế tiếp
	httpx.NoContent(c)
}

// PUT /departments/:id/admins — chỉ định danh sách quản trị phòng (Nền tảng).
func (a *API) setDepartmentAdmins(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in struct {
		Emails []string `json:"emails"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	var affected []string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var old []string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(array_agg(user_id), '{}') FROM department_admin WHERE department_id::text = $1`, id).Scan(&old); err != nil {
			return err
		}
		ids, err := replaceAdmins(ctx, tx, id, in.Emails)
		if err != nil {
			return err
		}
		affected = append(old, ids...)
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "department.admins", TargetType: "department", TargetID: id,
			DepartmentID: id, Before: old, After: ids})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.invalidateUser(ctx, affected...)
	httpx.NoContent(c)
}

func replaceAdmins(ctx context.Context, tx pgx.Tx, deptID string, emails []string) ([]string, error) {
	ids, err := usersByEmail(ctx, tx, emails)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM department_admin WHERE department_id::text = $1`, deptID); err != nil {
		return nil, err
	}
	for _, uid := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO department_admin (department_id, user_id) VALUES ($1::uuid, $2)`, deptID, uid); err != nil {
			return nil, err
		}
	}
	return ids, nil
}

// usersByEmail tìm người dùng đã từng đăng nhập. Người chưa đăng nhập lần nào chưa có trong app_user.
func usersByEmail(ctx context.Context, tx pgx.Tx, emails []string) ([]string, error) {
	ids := []string{}
	for _, e := range emails {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" {
			continue
		}
		var id string
		if err := tx.QueryRow(ctx, `SELECT id FROM app_user WHERE lower(email) = $1`, e).Scan(&id); err != nil {
			return nil, httpx.Unprocessable("USER_NOT_FOUND", "Không tìm thấy người dùng "+e+". Người này cần đăng nhập MaaS ít nhất một lần.").With("email", e)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

type Member struct {
	UserRef
	JoinedAt time.Time `json:"joined_at"`
	IsAdmin  bool      `json:"is_admin"`
}

func (a *API) listMembers(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if !p.CanManageDept(id) && !p.IsAuditor {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	rows, err := a.db.Query(ctx, `
		SELECT u.id, u.email, u.name, m.joined_at,
		       EXISTS (SELECT 1 FROM department_admin da WHERE da.department_id = m.department_id AND da.user_id = u.id)
		FROM member m JOIN app_user u ON u.id = m.user_id
		WHERE m.department_id::text = $1 AND m.left_at IS NULL ORDER BY u.name`, id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Member, error) {
		var m Member
		return m, r.Scan(&m.ID, &m.Email, &m.Name, &m.JoinedAt, &m.IsAdmin)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

// POST /departments/:id/members — thêm thành viên (Nền tảng, quản trị phòng đó).
func (a *API) addMember(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if !p.CanManageDept(id) {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	var uid string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		ids, err := usersByEmail(ctx, tx, []string{in.Email})
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			return httpx.BadRequest("Cần email thành viên")
		}
		uid = ids[0]
		tag, err := tx.Exec(ctx, `INSERT INTO member (department_id, user_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`, id, uid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.Conflict("ALREADY_MEMBER", "Người này đã là thành viên của phòng")
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "member.add", TargetType: "user", TargetID: uid, DepartmentID: id})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.invalidateUser(ctx, uid)
	httpx.Created(c, map[string]string{"user_id": uid})
}

// DELETE /departments/:id/members/:userId — bớt thành viên; thu hồi mọi key thành viên của họ trong phòng (K7).
func (a *API) removeMember(ctx context.Context, c *app.RequestContext) {
	p, id, uid := auth.From(c), c.Param("id"), c.Param("userId")
	if !p.CanManageDept(id) {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE member SET left_at = now() WHERE department_id::text = $1 AND user_id = $2 AND left_at IS NULL`, id, uid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "member.remove", TargetType: "user", TargetID: uid, DepartmentID: id}); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			UPDATE api_key SET status = 'revoked', revoked_at = now()
			WHERE department_id::text = $1 AND owner_user_id = $2 AND kind = 'member' AND status IN `+liveKeyStatuses+`
			RETURNING id::text`, id, uid)
		if err != nil {
			return err
		}
		keyIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		for _, k := range keyIDs {
			if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.revoke", TargetType: "api_key", TargetID: k,
				DepartmentID: id, After: map[string]string{"status": "revoked"}, Reason: "Thành viên rời phòng (K7)"}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.invalidateUser(ctx, uid)
	a.sync.Trigger()
	httpx.NoContent(c)
}

// GET /users?q= — tìm người dùng đã đăng nhập để thêm vào phòng (quản trị phòng, Nền tảng).
func (a *API) searchUsers(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if !p.IsPlatform && len(p.AdminOf) == 0 {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	q := "%" + strings.ToLower(strings.TrimSpace(c.Query("q"))) + "%"
	rows, err := a.db.Query(ctx, `SELECT id, email, name FROM app_user WHERE lower(email) LIKE $1 OR lower(name) LIKE $1 ORDER BY name LIMIT 20`, q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, pgx.RowToStructByPos[UserRef])
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

// allocated tính tổng hạn mức các key còn hiệu lực của phòng, trừ key exceptKeyID (khi sửa chính key đó).
func allocated(ctx context.Context, tx pgx.Tx, deptID, exceptKeyID string) (decimal.Decimal, error) {
	var sum decimal.Decimal
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(sum(monthly_limit_usd), 0) FROM api_key
		WHERE department_id::text = $1 AND status IN `+liveKeyStatuses+` AND id::text <> $2`, deptID, exceptKeyID).Scan(&sum)
	return sum, err
}
