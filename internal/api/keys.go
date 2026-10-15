package api

import (
	"context"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bemaas/internal/apikey"
	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
	"bemaas/internal/notify"
)

// Key không bao giờ chứa bí mật; chỉ có 4 ký tự cuối (K3).
type Key struct {
	ID            string          `json:"id"`
	DepartmentID  string          `json:"department_id"`
	Department    string          `json:"department_name"`
	Kind          string          `json:"kind"`
	Owner         *UserRef        `json:"owner"`
	Name          string          `json:"name"`
	Last4         *string         `json:"last4"`
	MonthlyLimit  decimal.Decimal `json:"monthly_limit_usd"`
	Used          decimal.Decimal `json:"used_usd"`
	AllowedModels []string        `json:"allowed_models"`
	ExpiresAt     *time.Time      `json:"expires_at"`
	Status        string          `json:"status"`
	CreatedBy     string          `json:"created_by"`
	CreatedAt     time.Time       `json:"created_at"`
	ClaimedAt     *time.Time      `json:"claimed_at"`
	RevokedAt     *time.Time      `json:"revoked_at"`
	LastUsedAt    *time.Time      `json:"last_used_at"`
}

const keySelect = `
	SELECT k.id::text, k.department_id::text, d.name, k.kind, u.id, u.email, u.name, k.name, k.last4,
	       k.monthly_limit_usd,
	       COALESCE((SELECT sum(cost_usd) FROM usage_month um WHERE um.key_id = k.id AND um.period = $1), 0),
	       k.allowed_models, k.expires_at, k.status, k.created_by, k.created_at, k.claimed_at, k.revoked_at, k.last_used_at
	FROM api_key k JOIN department d ON d.id = k.department_id LEFT JOIN app_user u ON u.id = k.owner_user_id`

func scanKey(r pgx.Row) (*Key, error) {
	var k Key
	var oid, oemail, oname *string
	err := r.Scan(&k.ID, &k.DepartmentID, &k.Department, &k.Kind, &oid, &oemail, &oname, &k.Name, &k.Last4,
		&k.MonthlyLimit, &k.Used, &k.AllowedModels, &k.ExpiresAt, &k.Status, &k.CreatedBy, &k.CreatedAt,
		&k.ClaimedAt, &k.RevokedAt, &k.LastUsedAt)
	if oid != nil {
		k.Owner = &UserRef{ID: *oid, Email: *oemail, Name: *oname}
	}
	return &k, err
}

func (a *API) queryKeys(ctx context.Context, where string, args ...any) ([]*Key, error) {
	rows, err := a.db.Query(ctx, keySelect+" WHERE "+where+" ORDER BY k.created_at DESC", append([]any{a.period()}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Key{}
	for rows.Next() {
		k, err := scanKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// GET /departments/:id/keys — Nền tảng, quản trị phòng đó. Không bao giờ trả bí mật.
func (a *API) listDepartmentKeys(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if !p.CanManageDept(id) && !p.IsAuditor {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	keys, err := a.queryKeys(ctx, "k.department_id::text = $2", id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": keys})
}

// GET /me/keys — key thành viên của chính mình kèm số đã dùng.
func (a *API) myKeys(ctx context.Context, c *app.RequestContext) {
	keys, err := a.queryKeys(ctx, "k.owner_user_id = $2 AND k.kind = 'member'", auth.From(c).ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": keys})
}

type keyInput struct {
	Kind          string           `json:"kind"`
	OwnerUserID   string           `json:"owner_user_id"`
	Name          *string          `json:"name"`
	MonthlyLimit  *decimal.Decimal `json:"monthly_limit_usd"`
	AllowedModels []string         `json:"allowed_models"`
	ExpiresInDays *int             `json:"expires_in_days"` // 30, 90, 365 hoặc 0 = không hết hạn (K5)
}

func expiry(days *int) (*time.Time, error) {
	if days == nil || *days == 0 {
		return nil, nil
	}
	switch *days {
	case 30, 90, 365:
		t := time.Now().Add(time.Duration(*days) * 24 * time.Hour)
		return &t, nil
	}
	return nil, httpx.BadRequest("Thời hạn key chỉ nhận 30, 90, 365 ngày hoặc 0 (không hết hạn)")
}

// checkModels: model được dùng phải là tập con của các model đang bật (K4).
func checkModels(ctx context.Context, tx pgx.Tx, ids []string) error {
	if len(ids) == 0 {
		return httpx.BadRequest("Chọn ít nhất một model cho key")
	}
	var bad []string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(array_agg(x), '{}') FROM unnest($1::text[]) x
		WHERE NOT EXISTS (SELECT 1 FROM model m WHERE m.id = x AND m.enabled)`, ids).Scan(&bad); err != nil {
		return err
	}
	if len(bad) > 0 {
		return httpx.Unprocessable("MODEL_NOT_ENABLED", "Model chưa bật hoặc không tồn tại: "+strings.Join(bad, ", ")).With("models", bad)
	}
	return nil
}

// checkLimit áp B3: tổng hạn mức các key còn hiệu lực ≤ ngân sách phòng. Khoá dòng phòng để hai yêu cầu song song không cùng vượt.
func checkLimit(ctx context.Context, tx pgx.Tx, deptID, exceptKeyID string, limit decimal.Decimal) error {
	if limit.IsNegative() {
		return httpx.BadRequest("Hạn mức không được âm")
	}
	var budget decimal.Decimal
	if err := tx.QueryRow(ctx, `SELECT monthly_budget_usd FROM department WHERE id::text = $1 FOR UPDATE`, deptID).Scan(&budget); err != nil {
		return err
	}
	used, err := allocated(ctx, tx, deptID, exceptKeyID)
	if err != nil {
		return err
	}
	if remaining := budget.Sub(used); limit.GreaterThan(remaining) {
		return httpx.Unprocessable("LIMIT_EXCEEDS_UNALLOCATED", "Hạn mức vượt phần ngân sách còn chia được của phòng").
			With("unallocated_usd", remaining)
	}
	return nil
}

// POST /departments/:id/keys — cấp key (Nền tảng: mọi phòng; quản trị phòng: phòng mình).
// Key ứng dụng: trả `secret` một lần. Key thành viên: trạng thái `pending`, chờ chủ key nhận (K2).
func (a *API) createKey(ctx context.Context, c *app.RequestContext) {
	p, deptID := auth.From(c), c.Param("id")
	if !p.CanManageDept(deptID) {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	var in keyInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if in.Kind != "member" && in.Kind != "app" {
		httpx.Fail(c, httpx.BadRequest("kind phải là member hoặc app"))
		return
	}
	if in.Name == nil || strings.TrimSpace(*in.Name) == "" || in.MonthlyLimit == nil {
		httpx.Fail(c, httpx.BadRequest("Cần tên key và hạn mức tháng"))
		return
	}
	exp, err := expiry(in.ExpiresInDays)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	limit := in.MonthlyLimit.Round(2)

	var keyID, secret string
	err = a.tx(ctx, func(tx pgx.Tx) error {
		var owner *string
		if in.Kind == "member" {
			var ok bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM member WHERE department_id::text = $1 AND user_id = $2 AND left_at IS NULL)`,
				deptID, in.OwnerUserID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return httpx.Unprocessable("OWNER_NOT_MEMBER", "Người nhận key phải là thành viên của phòng")
			}
			owner = &in.OwnerUserID
		}
		if err := checkModels(ctx, tx, in.AllowedModels); err != nil {
			return err
		}
		if err := checkLimit(ctx, tx, deptID, "", limit); err != nil {
			return err
		}
		status := "pending"
		var hash, last4 *string
		if in.Kind == "app" {
			k := apikey.Generate(a.cfg.Gateway.KeyEnv)
			secret, status, hash, last4 = k.Secret, "active", &k.Hash, &k.Last4
		}
		err := tx.QueryRow(ctx, `
			INSERT INTO api_key (department_id, kind, owner_user_id, name, key_hash, last4, monthly_limit_usd, allowed_models,
			                     expires_at, status, created_by, claimed_at)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $10 = 'active' THEN now() END)
			RETURNING id::text`,
			deptID, in.Kind, owner, strings.TrimSpace(*in.Name), hash, last4, limit, in.AllowedModels, exp, status, p.ID).Scan(&keyID)
		if err != nil {
			if strings.Contains(err.Error(), "api_key_name_uniq") {
				return httpx.Conflict("KEY_NAME_TAKEN", "Phòng đã có key cùng tên")
			}
			return err
		}
		if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.create", TargetType: "api_key", TargetID: keyID, DepartmentID: deptID,
			After: map[string]any{"kind": in.Kind, "owner": owner, "name": *in.Name, "monthly_limit_usd": limit,
				"allowed_models": in.AllowedModels, "expires_at": exp, "status": status}}); err != nil {
			return err
		}
		if owner == nil {
			return nil
		}
		return notify.Send(ctx, tx, []string{*owner}, notify.Message{
			Kind: "key.pending", Title: "Bạn được cấp key " + strings.TrimSpace(*in.Name),
			Body: "Hạn mức " + limit.StringFixed(2) + " USD/tháng. Bấm “Nhận key” để lấy key đầy đủ (chỉ hiện một lần).",
			Link: "/budget?tab=mine",
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if secret != "" {
		a.sync.Trigger()
	}
	out := map[string]any{"id": keyID}
	if secret != "" {
		out["secret"] = secret
	}
	httpx.Created(c, out)
}

type keyRow struct {
	DeptID, Kind, Status string
	Owner                *string
	Limit                decimal.Decimal
	Models               []string
	ExpiresAt            *time.Time
	Name                 string
}

func lockKey(ctx context.Context, tx pgx.Tx, id string) (*keyRow, error) {
	var k keyRow
	err := tx.QueryRow(ctx, `
		SELECT department_id::text, kind, status, owner_user_id, monthly_limit_usd, allowed_models, expires_at, name
		FROM api_key WHERE id::text = $1 FOR UPDATE`, id).
		Scan(&k.DeptID, &k.Kind, &k.Status, &k.Owner, &k.Limit, &k.Models, &k.ExpiresAt, &k.Name)
	return &k, err
}

func (k *keyRow) live() bool {
	return k.Status != "revoked" && k.Status != "expired"
}

func (k *keyRow) ownedBy(uid string) bool { return k.Owner != nil && *k.Owner == uid }

// PATCH /keys/:id — sửa hạn mức, model, thời hạn, tên (Nền tảng, quản trị phòng của key).
// Hạn mức thấp hơn số đã dùng thì key bị khoá ngay (B5); tăng lại thì mở khoá (B8).
func (a *API) updateKey(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	var in keyInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		k, err := lockKey(ctx, tx, id)
		if err != nil {
			return err
		}
		if !p.CanManageDept(k.DeptID) {
			return httpx.ErrForbidden
		}
		if !k.live() {
			return httpx.Conflict("KEY_NOT_LIVE", "Key đã thu hồi hoặc hết hạn, không sửa được")
		}
		before := *k
		if in.Name != nil {
			k.Name = strings.TrimSpace(*in.Name)
		}
		if in.AllowedModels != nil {
			if err := checkModels(ctx, tx, in.AllowedModels); err != nil {
				return err
			}
			k.Models = in.AllowedModels
		}
		if in.ExpiresInDays != nil {
			if k.ExpiresAt, err = expiry(in.ExpiresInDays); err != nil {
				return err
			}
		}
		if in.MonthlyLimit != nil {
			k.Limit = in.MonthlyLimit.Round(2)
			if k.Limit.GreaterThan(before.Limit) {
				if err := checkLimit(ctx, tx, k.DeptID, id, k.Limit); err != nil {
					return err
				}
			}
			var used decimal.Decimal
			if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(cost_usd), 0) FROM usage_month WHERE key_id::text = $1 AND period = $2`,
				id, a.period()).Scan(&used); err != nil {
				return err
			}
			switch {
			case k.Status == "active" && used.GreaterThanOrEqual(k.Limit):
				k.Status = "blocked_key"
			case k.Status == "blocked_key" && used.LessThan(k.Limit):
				k.Status = "active"
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE api_key SET name=$2, monthly_limit_usd=$3, allowed_models=$4, expires_at=$5, status=$6 WHERE id::text=$1`,
			id, k.Name, k.Limit, k.Models, k.ExpiresAt, k.Status); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.update", TargetType: "api_key", TargetID: id, DepartmentID: k.DeptID,
			Before: before, After: k})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}

// POST /keys/:id/claim — chủ key nhận key thành viên: sinh bí mật, trả một lần, chuyển `active` (K2).
func (a *API) claimKey(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	var secret string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		k, err := lockKey(ctx, tx, id)
		if err != nil {
			return err
		}
		if !k.ownedBy(p.ID) {
			return httpx.ErrForbidden
		}
		if k.Status != "pending" {
			return httpx.Conflict("KEY_ALREADY_CLAIMED", "Key đã được nhận")
		}
		gen := apikey.Generate(a.cfg.Gateway.KeyEnv)
		secret = gen.Secret
		if _, err := tx.Exec(ctx, `UPDATE api_key SET key_hash=$2, last4=$3, status='active', claimed_at=now() WHERE id::text=$1`,
			id, gen.Hash, gen.Last4); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.claim", TargetType: "api_key", TargetID: id, DepartmentID: k.DeptID,
			Before: map[string]string{"status": "pending"}, After: map[string]string{"status": "active"}})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.OK(c, map[string]string{"id": id, "secret": secret})
}

// POST /keys/:id/rotate — đổi key: key cũ mất hiệu lực ngay, key mới giữ hạn mức và số đã dùng (K6).
// Chủ key với key thành viên; quản trị phòng với key ứng dụng. Quản trị nền tảng không đổi key.
func (a *API) rotateKey(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	var secret string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		k, err := lockKey(ctx, tx, id)
		if err != nil {
			return err
		}
		allowed := (k.Kind == "member" && k.ownedBy(p.ID)) || (k.Kind == "app" && p.IsDeptAdmin(k.DeptID))
		if !allowed {
			return httpx.ErrForbidden
		}
		if !k.live() || k.Status == "pending" {
			return httpx.Conflict("KEY_NOT_ROTATABLE", "Chỉ đổi được key đang hoạt động hoặc đang bị khoá")
		}
		gen := apikey.Generate(a.cfg.Gateway.KeyEnv)
		secret = gen.Secret
		if _, err := tx.Exec(ctx, `UPDATE api_key SET key_hash=$2, last4=$3 WHERE id::text=$1`, id, gen.Hash, gen.Last4); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.rotate", TargetType: "api_key", TargetID: id, DepartmentID: k.DeptID})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.OK(c, map[string]string{"id": id, "secret": secret})
}

// POST /keys/:id/revoke — Nền tảng: mọi key; quản trị phòng: key của phòng mình; thành viên: key của mình.
// Hạn mức của key trả về phần còn chia được (B7).
func (a *API) revokeKey(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	var in struct {
		Reason string `json:"reason"`
	}
	if len(c.Request.Body()) > 0 {
		if err := httpx.Bind(c, &in); err != nil {
			httpx.Fail(c, err)
			return
		}
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		k, err := lockKey(ctx, tx, id)
		if err != nil {
			return err
		}
		if !p.CanManageDept(k.DeptID) && !k.ownedBy(p.ID) {
			return httpx.ErrForbidden
		}
		if !k.live() {
			return httpx.Conflict("KEY_NOT_LIVE", "Key đã thu hồi hoặc hết hạn")
		}
		if _, err := tx.Exec(ctx, `UPDATE api_key SET status='revoked', revoked_at=now() WHERE id::text=$1`, id); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "key.revoke", TargetType: "api_key", TargetID: id, DepartmentID: k.DeptID,
			Before: map[string]string{"status": k.Status}, After: map[string]string{"status": "revoked"}, Reason: in.Reason})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.sync.Trigger()
	httpx.NoContent(c)
}
