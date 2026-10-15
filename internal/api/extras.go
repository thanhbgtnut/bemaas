package api

import (
	"context"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
)

// --- Thông báo trong ứng dụng (mục 13) ---------------------------------------

type Notification struct {
	ID        int64      `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      string     `json:"link"`
	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at"`
}

// GET /notifications — 50 thông báo gần nhất và số chưa đọc của người đang đăng nhập.
func (a *API) listNotifications(ctx context.Context, c *app.RequestContext) {
	uid := auth.From(c).ID
	rows, err := a.db.Query(ctx, `
		SELECT id, kind, title, body, link, created_at, read_at FROM notification
		WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, uid)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Notification])
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var unread int64
	if err := a.db.QueryRow(ctx, `SELECT count(*) FROM notification WHERE user_id = $1 AND read_at IS NULL`, uid).Scan(&unread); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items, "unread": unread})
}

// POST /notifications/read — body {"ids":[1,2]} hoặc {} để đánh dấu tất cả đã đọc.
func (a *API) readNotifications(ctx context.Context, c *app.RequestContext) {
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if len(c.Request.Body()) > 0 {
		if err := httpx.Bind(c, &in); err != nil {
			httpx.Fail(c, err)
			return
		}
	}
	sql, args := `UPDATE notification SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, []any{auth.From(c).ID}
	if len(in.IDs) > 0 {
		sql += ` AND id = ANY($2)`
		args = append(args, in.IDs)
	}
	if _, err := a.db.Exec(ctx, sql, args...); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

// --- Ô tìm chung trên header (G3): tìm model và skill -------------------------

func (a *API) search(ctx context.Context, c *app.RequestContext) {
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))
	if len([]rune(q)) < 2 {
		httpx.OK(c, map[string]any{"models": []any{}, "skills": []any{}})
		return
	}
	like := "%" + q + "%"
	rows, err := a.db.Query(ctx, `
		SELECT id, name, provider_team, type FROM model
		WHERE lower(id) LIKE $1 OR lower(name) LIKE $1 OR lower(description) LIKE $1
		ORDER BY name LIMIT 8`, like)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	models, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err = a.db.Query(ctx, `
		SELECT id::text, domain, name, title FROM skill
		WHERE lower(title) LIKE $1 OR lower(name) LIKE $1 OR lower(description) LIKE $1
		ORDER BY installs DESC LIMIT 8`, like)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	skills, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"models": models, "skills": skills})
}

// --- Model card: tab Phiên bản và Thảo luận (M10) -----------------------------

func (a *API) listModelVersions(ctx context.Context, c *app.RequestContext) {
	rows, err := a.db.Query(ctx, `
		SELECT v.version, v.notes, v.created_at, u.name
		FROM model_version v JOIN app_user u ON u.id = v.created_by
		WHERE v.model_id = $1 ORDER BY v.created_at DESC`, c.Param("id"))
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

// POST /models/:id/versions — Nền tảng ghi một phiên bản dịch vụ mới kèm ghi chú thay đổi.
func (a *API) createModelVersion(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in struct {
		Version string `json:"version"`
		Notes   string `json:"notes"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if strings.TrimSpace(in.Version) == "" {
		httpx.Fail(c, httpx.BadRequest("Cần số phiên bản"))
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO model_version (model_id, version, notes, created_by) VALUES ($1,$2,$3,$4)`,
			id, strings.TrimSpace(in.Version), in.Notes, p.ID); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "model.version", TargetType: "model", TargetID: id, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"version": in.Version})
}

func (a *API) listModelComments(ctx context.Context, c *app.RequestContext) {
	rows, err := a.db.Query(ctx, `
		SELECT m.id::text, u.id, u.email, u.name, m.body, m.parent_id::text, m.ts
		FROM model_comment m JOIN app_user u ON u.id = m.user_id WHERE m.model_id = $1 ORDER BY m.ts`, c.Param("id"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (comment, error) {
		var m comment
		return m, r.Scan(&m.ID, &m.User.ID, &m.User.Email, &m.User.Name, &m.Body, &m.ParentID, &m.TS)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

func (a *API) createModelComment(ctx context.Context, c *app.RequestContext) {
	var in struct {
		Body     string  `json:"body"`
		ParentID *string `json:"parent_id"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if strings.TrimSpace(in.Body) == "" || len(in.Body) > 10000 {
		httpx.Fail(c, httpx.BadRequest("Nội dung thảo luận trống hoặc quá dài"))
		return
	}
	var id string
	if err := a.db.QueryRow(ctx, `INSERT INTO model_comment (model_id, user_id, body, parent_id) VALUES ($1,$2,$3,$4::uuid) RETURNING id::text`,
		c.Param("id"), auth.From(c).ID, in.Body, in.ParentID).Scan(&id); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

// --- Vai trò Kiểm soát và quản trị nền tảng (mục 3) ---------------------------

type roleHolder struct {
	UserRef
	Role string `json:"role"`
}

// GET /roles — danh sách người giữ vai trò Quản trị nền tảng và Kiểm soát (Nền tảng).
func (a *API) listRoles(ctx context.Context, c *app.RequestContext) {
	if err := requirePlatform(auth.From(c)); err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err := a.db.Query(ctx, `
		SELECT u.id, u.email, u.name, 'platform' FROM platform_admin r JOIN app_user u ON u.id = r.user_id
		UNION ALL
		SELECT u.id, u.email, u.name, 'auditor' FROM auditor r JOIN app_user u ON u.id = r.user_id
		ORDER BY 4, 3`)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (roleHolder, error) {
		var h roleHolder
		return h, r.Scan(&h.ID, &h.Email, &h.Name, &h.Role)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

// PUT /roles/:role — {"email": "...", "grant": true|false}. role: platform | auditor.
func (a *API) setRole(ctx context.Context, c *app.RequestContext) {
	p, role := auth.From(c), c.Param("role")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	table := map[string]string{"platform": "platform_admin", "auditor": "auditor"}[role]
	if table == "" {
		httpx.Fail(c, httpx.BadRequest("role phải là platform hoặc auditor"))
		return
	}
	var in struct {
		Email string `json:"email"`
		Grant bool   `json:"grant"`
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
			return httpx.BadRequest("Cần email")
		}
		uid = ids[0]
		if !in.Grant && role == "platform" && uid == p.ID {
			return httpx.Unprocessable("CANNOT_REMOVE_SELF", "Không tự gỡ vai trò Quản trị nền tảng của chính mình")
		}
		sql := `INSERT INTO ` + table + ` (user_id) VALUES ($1) ON CONFLICT DO NOTHING`
		if !in.Grant {
			sql = `DELETE FROM ` + table + ` WHERE user_id = $1`
		}
		if _, err := tx.Exec(ctx, sql, uid); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "role." + role, TargetType: "user", TargetID: uid,
			After: map[string]bool{"grant": in.Grant}})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.invalidateUser(ctx, uid)
	httpx.NoContent(c)
}
