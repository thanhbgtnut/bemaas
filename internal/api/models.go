package api

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/cache"
	"bemaas/internal/httpx"
	"bemaas/internal/standard"
)

type Price struct {
	ProviderID string          `json:"provider_id"`
	Input      decimal.Decimal `json:"input"`
	Output     decimal.Decimal `json:"output"`
	CacheRead  decimal.Decimal `json:"cache_read"`
	PerPage    decimal.Decimal `json:"per_page"`
}

type Model struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	ProviderTeam  string          `json:"provider_team"`
	Type          string          `json:"type"`
	Standard      string          `json:"standard"`
	Unit          string          `json:"unit"`
	Modes         []string        `json:"modes"`
	UseCases      []string        `json:"use_cases"`
	Status        string          `json:"status"`
	DataLevel     string          `json:"data_level"`
	Deploy        string          `json:"deploy"`
	Endpoint      string          `json:"endpoint"`
	ContextLength *int            `json:"context_length"`
	Enabled       bool            `json:"enabled"`
	Description   string          `json:"description"`
	Card          string          `json:"card,omitempty"`
	Governance    json.RawMessage `json:"governance,omitempty"`
	Price         *Price          `json:"price"`
	Calls30d      int64           `json:"calls_30d"`
	Likes         int64           `json:"likes"`
	LikedByMe     bool            `json:"liked_by_me"`
}

const modelListKey = "models:list"

const modelSelect = `
	SELECT m.id, m.name, m.provider_team, m.type, m.modes, m.use_cases, m.status, m.data_level, m.deploy,
	       m.endpoint, m.context_length, m.enabled, m.standard, m.description,
	       p.provider_id, p.input, p.output, p.cache_read, p.per_page,
	       (SELECT count(*) FROM usage_event u WHERE u.model_id = m.id AND u.ts > now() - interval '30 days'),
	       (SELECT count(*) FROM model_like l WHERE l.model_id = m.id)
	FROM model m LEFT JOIN model_price p ON p.model_id = m.id`

func scanModel(row pgx.Row) (*Model, error) {
	var m Model
	var provider *string
	var in, out, cr, pp *decimal.Decimal
	err := row.Scan(&m.ID, &m.Name, &m.ProviderTeam, &m.Type, &m.Modes, &m.UseCases, &m.Status, &m.DataLevel, &m.Deploy,
		&m.Endpoint, &m.ContextLength, &m.Enabled, &m.Standard, &m.Description,
		&provider, &in, &out, &cr, &pp, &m.Calls30d, &m.Likes)
	if err != nil {
		return nil, err
	}
	if std, ok := standard.Get(m.Standard); ok {
		m.Unit = std.Unit
	}
	if provider != nil {
		m.Price = &Price{ProviderID: *provider, Input: *in, Output: *out, CacheRead: *cr, PerPage: *pp}
	}
	return &m, nil
}

func (a *API) loadModels(ctx context.Context) ([]*Model, error) {
	rows, err := a.db.Query(ctx, modelSelect+` ORDER BY m.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Model{}
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (a *API) likedModels(ctx context.Context, userID string) ([]string, error) {
	var ids []string
	err := a.db.QueryRow(ctx, `SELECT COALESCE(array_agg(model_id), '{}') FROM model_like WHERE user_id = $1`, userID).Scan(&ids)
	return ids, err
}

// GET /models — danh mục model (M1–M5). Lọc và sắp xếp làm ở giao diện vì danh mục nhỏ.
func (a *API) listModels(ctx context.Context, c *app.RequestContext) {
	models, err := cache.GetOrLoad(ctx, a.cache, modelListKey, 2*time.Minute, a.loadModels)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	liked, err := a.likedModels(ctx, auth.From(c).ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	for _, m := range models {
		m.LikedByMe = slices.Contains(liked, m.ID)
	}
	httpx.OK(c, map[string]any{"items": models})
}

type dailyPoint struct {
	Day   string `json:"day"`
	Calls int64  `json:"calls"`
}

// GET /models/:id — model card (M10–M12).
func (a *API) getModel(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	m, err := scanModel(a.db.QueryRow(ctx, modelSelect+` WHERE m.id = $1`, id))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if err := a.db.QueryRow(ctx, `SELECT card, governance FROM model WHERE id = $1`, id).Scan(&m.Card, &m.Governance); err != nil {
		httpx.Fail(c, err)
		return
	}
	liked, err := a.likedModels(ctx, auth.From(c).ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	m.LikedByMe = slices.Contains(liked, id)

	rows, err := a.db.Query(ctx, `
		SELECT to_char(d, 'YYYY-MM-DD'), COALESCE(cnt, 0)
		FROM generate_series((now() AT TIME ZONE $2)::date - 29, (now() AT TIME ZONE $2)::date, interval '1 day') d
		LEFT JOIN (SELECT (ts AT TIME ZONE $2)::date AS day, count(*) AS cnt FROM usage_event
		           WHERE model_id = $1 AND ts > now() - interval '31 days' GROUP BY 1) u ON u.day = d::date
		ORDER BY d`, id, a.loc.String())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	daily, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (dailyPoint, error) {
		var p dailyPoint
		return p, r.Scan(&p.Day, &p.Calls)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}

	rows, err = a.db.Query(ctx, `SELECT id::text, domain, name, title FROM skill WHERE $1 = ANY(models) ORDER BY installs DESC LIMIT 20`, id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	skills, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{
		"model": m, "daily_calls": daily, "skills": skills,
		"gateway_base_url": a.cfg.Gateway.BaseURL,
	})
}

type modelInput struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	ProviderTeam  string          `json:"provider_team"`
	Standard      string          `json:"standard"`
	Modes         []string        `json:"modes"`
	UseCases      []string        `json:"use_cases"`
	Status        string          `json:"status"`
	DataLevel     string          `json:"data_level"`
	Deploy        string          `json:"deploy"`
	Endpoint      string          `json:"endpoint"`
	ContextLength *int            `json:"context_length"`
	Type          string          `json:"-"` // suy ra từ chuẩn, không nhận từ client
	Description   string          `json:"description"`
	Card          string          `json:"card"`
	Governance    json.RawMessage `json:"governance"`
}

func (m *modelInput) normalize(id string) error {
	if m.Name == "" || m.ProviderTeam == "" {
		return httpx.BadRequest("Cần tên model và đội cung cấp")
	}
	std, ok := standard.Get(m.Standard)
	if !ok {
		return httpx.BadRequest("standard phải là một trong: " + strings.Join(standard.IDs(), ", "))
	}
	// Chuẩn chỉ có một thao tác thì model hỗ trợ thao tác đó; chuẩn nhiều thao tác (OpenAI) phải chọn ít nhất một.
	ops := std.OpIDs()
	if len(ops) == 1 {
		m.Modes = ops
	}
	if len(m.Modes) == 0 {
		return httpx.BadRequest("Chọn ít nhất một thao tác của chuẩn " + std.Name)
	}
	for _, op := range m.Modes {
		if !slices.Contains(ops, op) {
			return httpx.BadRequest("Chuẩn " + std.Name + " không có thao tác " + op)
		}
	}
	if m.Endpoint == "" {
		m.Endpoint = std.Endpoint(id)
	}
	m.Type = std.LegacyType(m.Modes)
	if m.Status == "" {
		m.Status = "beta"
	}
	if m.DataLevel == "" {
		m.DataLevel = "noi_bo"
	}
	if m.UseCases == nil {
		m.UseCases = []string{}
	}
	if len(m.Governance) == 0 {
		m.Governance = json.RawMessage(`{}`)
	}
	return nil
}

// POST /models — khai báo model mới (Nền tảng). Không có trong bảng API của spec; cần để nạp danh mục.
func (a *API) createModel(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	var in modelInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	if in.ID == "" {
		httpx.Fail(c, httpx.BadRequest("Cần id model"))
		return
	}
	if err := in.normalize(in.ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO model (id, name, provider_team, type, standard, modes, use_cases, status, data_level, deploy, endpoint,
			                   context_length, description, card, governance)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			in.ID, in.Name, in.ProviderTeam, in.Type, in.Standard, in.Modes, in.UseCases, in.Status, in.DataLevel, in.Deploy, in.Endpoint,
			in.ContextLength, in.Description, in.Card, in.Governance)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "model.create", TargetType: "model", TargetID: in.ID, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	httpx.Created(c, map[string]string{"id": in.ID})
}

// PATCH /models/:id — sửa thông tin model (Nền tảng). Gửi đủ các trường như khi tạo.
func (a *API) updateModel(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in modelInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	id := c.Param("id")
	if err := in.normalize(id); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE model SET name=$2, provider_team=$3, type=$4, standard=$5, modes=$6, use_cases=$7, status=$8, data_level=$9,
			       deploy=$10, endpoint=$11, context_length=$12, description=$13, card=$14,
			       governance=$15, updated_at=now()
			WHERE id = $1`,
			id, in.Name, in.ProviderTeam, in.Type, in.Standard, in.Modes, in.UseCases, in.Status, in.DataLevel, in.Deploy, in.Endpoint,
			in.ContextLength, in.Description, in.Card, in.Governance)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "model.update", TargetType: "model", TargetID: id, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	httpx.NoContent(c)
}

// PUT /models/enabled — bật, tắt hàng loạt (M6, M8). Body: {"changes": {"model-id": true}}.
func (a *API) setModelsEnabled(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
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
		for id, on := range in.Changes {
			var before bool
			if err := tx.QueryRow(ctx, `SELECT enabled FROM model WHERE id = $1 FOR UPDATE`, id).Scan(&before); err != nil {
				return httpx.ErrNotFound.With("model_id", id)
			}
			if before == on {
				continue
			}
			if _, err := tx.Exec(ctx, `UPDATE model SET enabled = $2, updated_at = now() WHERE id = $1`, id, on); err != nil {
				return err
			}
			if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "model.enabled", TargetType: "model", TargetID: id,
				Before: map[string]bool{"enabled": before}, After: map[string]bool{"enabled": on}}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	a.sync.Trigger()
	httpx.NoContent(c)
}

func (a *API) likeModel(ctx context.Context, c *app.RequestContext) {
	_, err := a.db.Exec(ctx, `INSERT INTO model_like (model_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		c.Param("id"), auth.From(c).ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	httpx.NoContent(c)
}

func (a *API) unlikeModel(ctx context.Context, c *app.RequestContext) {
	if _, err := a.db.Exec(ctx, `DELETE FROM model_like WHERE model_id = $1 AND user_id = $2`, c.Param("id"), auth.From(c).ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	httpx.NoContent(c)
}

// GET /standards — danh mục chuẩn API (M14): thao tác, endpoint mặc định, đơn vị tính giá, ví dụ mẫu.
func (a *API) listStandards(ctx context.Context, c *app.RequestContext) {
	httpx.OK(c, map[string]any{"items": standard.All})
}

type priceRow struct {
	ModelID string `json:"model_id"`
	Price
}

func (a *API) listPrices(ctx context.Context, c *app.RequestContext) {
	rows, err := a.db.Query(ctx, `SELECT model_id, provider_id, input, output, cache_read, per_page FROM model_price ORDER BY model_id`)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (priceRow, error) {
		var p priceRow
		return p, r.Scan(&p.ModelID, &p.ProviderID, &p.Input, &p.Output, &p.CacheRead, &p.PerPage)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

// PUT /model-prices — sửa bảng giá (Nền tảng); kích hoạt sinh lại catalog.json cho gateway.
func (a *API) putPrices(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in struct {
		Items []priceRow `json:"items"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		for _, r := range in.Items {
			for _, v := range []decimal.Decimal{r.Input, r.Output, r.CacheRead, r.PerPage} {
				if v.IsNegative() {
					return httpx.BadRequest("Đơn giá không được âm")
				}
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO model_price (model_id, provider_id, input, output, cache_read, per_page) VALUES ($1,$2,$3,$4,$5,$6)
				ON CONFLICT (model_id) DO UPDATE SET provider_id=$2, input=$3, output=$4, cache_read=$5, per_page=$6, updated_at=now()`,
				r.ModelID, r.ProviderID, r.Input, r.Output, r.CacheRead, r.PerPage)
			if err != nil {
				return err
			}
			if err := audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "model.price", TargetType: "model", TargetID: r.ModelID, After: r.Price}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	a.cache.Del(ctx, modelListKey)
	a.sync.Trigger()
	httpx.NoContent(c)
}

// GET /gateway/catalog — xem catalog.json đang sinh cho gateway và lần đồng bộ gần nhất (Nền tảng).
func (a *API) gatewayCatalog(ctx context.Context, c *app.RequestContext) {
	if err := requirePlatform(auth.From(c)); err != nil {
		httpx.Fail(c, err)
		return
	}
	models, err := a.sync.BuildCatalog(ctx)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"models": models, "last_sync": a.sync.LastSync()})
}
