// Package gateway đồng bộ trạng thái key và bảng giá từ PostgreSQL xuống agentgateway (mục 10.7).
// CSDL MaaS là nguồn gốc; ConfigMap chỉ là bản sao. Mỗi lượt đối soát ghi lại toàn bộ trạng thái mong muốn,
// nên một lần lỗi không làm mất key: lượt sau ghi lại đầy đủ.
package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"bemaas/internal/cache"
	"bemaas/internal/config"
)

// Writer ghi dữ liệu ConfigMap. Có hai bản: ghi log (local) và Kubernetes.
type Writer interface {
	WriteConfigMap(ctx context.Context, name string, data map[string]string) error
	// WriteSpec thay `spec` của một tài nguyên tạo sẵn (CRD của agentgateway).
	WriteSpec(ctx context.Context, apiVersion, plural, name string, spec any) error
}

type Syncer struct {
	db       *pgxpool.Pool
	cache    *cache.Cache
	writer   Writer
	cfg      config.GatewaySync
	trigger  chan struct{}
	lastSync atomic.Int64 // unix giây của lần đồng bộ thành công gần nhất
}

func NewSyncer(cfg config.GatewaySync, db *pgxpool.Pool, c *cache.Cache) (*Syncer, error) {
	var w Writer
	switch cfg.Mode {
	case "log":
		w = logWriter{}
	case "kubernetes":
		kw, err := newKubeWriter(cfg.Kube)
		if err != nil {
			return nil, err
		}
		w = kw
	default:
		return nil, fmt.Errorf("gateway.sync.mode không hợp lệ: %q", cfg.Mode)
	}
	return &Syncer{db: db, cache: c, writer: w, cfg: cfg, trigger: make(chan struct{}, 1)}, nil
}

// Trigger yêu cầu đồng bộ sớm (sau khi cấp, thu hồi, đổi, khoá key hoặc sửa bảng giá).
func (s *Syncer) Trigger() {
	select {
	case s.trigger <- struct{}{}:
	default:
	}
}

func (s *Syncer) LastSync() time.Time { return time.Unix(s.lastSync.Load(), 0) }

// Run đối soát định kỳ và mỗi khi có Trigger. Chỉ một bản sao chạy tại một thời điểm (khoá Redis).
func (s *Syncer) Run(ctx context.Context) {
	t := time.NewTicker(s.cfg.Interval)
	defer t.Stop()
	s.syncOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-s.trigger:
		}
		s.syncOnce(ctx)
	}
}

func (s *Syncer) syncOnce(ctx context.Context) {
	unlock, ok := s.cache.TryLock(ctx, "gateway-sync", 30*time.Second)
	if !ok {
		return
	}
	defer unlock()
	if err := s.SyncKeys(ctx); err != nil {
		slog.Error("gateway sync key lỗi", "err", err)
		return
	}
	if err := s.SyncCatalog(ctx); err != nil {
		slog.Error("gateway sync bảng giá lỗi", "err", err)
		return
	}
	if err := s.SyncMCP(ctx); err != nil {
		slog.Error("gateway sync MCP lỗi", "err", err)
		return
	}
	s.lastSync.Store(time.Now().Unix())
}

type keyEntry struct {
	KeyHash  string            `json:"keyHash"`
	Metadata map[string]string `json:"metadata"`
}

// SyncKeys ghi mọi key `active` vào ConfigMap key (cách B ở mục 10.4: key không hoạt động thì không có dòng).
// Metadata chỉ chứa mã định danh, không có họ tên hay email.
func (s *Syncer) SyncKeys(ctx context.Context) error {
	rows, err := s.db.Query(ctx, `
		SELECT id::text, key_hash, department_id::text, kind, COALESCE(owner_user_id, '')
		FROM api_key
		WHERE status = 'active' AND key_hash IS NOT NULL AND (expires_at IS NULL OR expires_at > now())`)
	if err != nil {
		return err
	}
	defer rows.Close()
	data := map[string]string{}
	for rows.Next() {
		var id, hash, dept, kind, owner string
		if err := rows.Scan(&id, &hash, &dept, &kind, &owner); err != nil {
			return err
		}
		if kind == "app" {
			owner = "app:" + id
		}
		b, _ := json.Marshal(keyEntry{KeyHash: hash, Metadata: map[string]string{
			"key_id": id, "owner_id": owner, "dept_id": dept, "kind": map[string]string{"member": "user", "app": "app"}[kind],
		}})
		data[id] = string(b)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return s.writer.WriteConfigMap(ctx, s.cfg.Kube.KeyConfigMap, data)
}

// CatalogModel là một dòng trong catalog.json. Định dạng chính xác của agentgateway cần kiểm chứng
// trên cụm (luu-y-trien-khai.md mục 3–4) trước khi bật mode kubernetes.
type CatalogModel struct {
	Provider  string          `json:"provider"`
	Model     string          `json:"model"`
	Input     decimal.Decimal `json:"input,omitzero"`
	Output    decimal.Decimal `json:"output,omitzero"`
	CacheRead decimal.Decimal `json:"cacheRead,omitzero"`
	PerPage   decimal.Decimal `json:"perPage,omitzero"`
}

func (s *Syncer) BuildCatalog(ctx context.Context) ([]CatalogModel, error) {
	rows, err := s.db.Query(ctx, `
		SELECT p.provider_id, m.id, p.input, p.output, p.cache_read, p.per_page
		FROM model_price p JOIN model m ON m.id = p.model_id ORDER BY m.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CatalogModel{}
	for rows.Next() {
		var c CatalogModel
		if err := rows.Scan(&c.Provider, &c.Model, &c.Input, &c.Output, &c.CacheRead, &c.PerPage); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Model < out[j].Model })
	return out, rows.Err()
}

func (s *Syncer) SyncCatalog(ctx context.Context) error {
	models, err := s.BuildCatalog(ctx)
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(map[string]any{"models": models}, "", "  ")
	if err != nil {
		return err
	}
	return s.writer.WriteConfigMap(ctx, s.cfg.Kube.CatalogConfigMap, map[string]string{"catalog.json": string(b)})
}

type logWriter struct{}

func (logWriter) WriteSpec(_ context.Context, apiVersion, plural, name string, _ any) error {
	slog.Debug("gateway sync (mode log): bỏ qua ghi tài nguyên", "apiVersion", apiVersion, "kind", plural, "name", name)
	return nil
}

func (logWriter) WriteConfigMap(_ context.Context, name string, data map[string]string) error {
	slog.Debug("gateway sync (mode log): bỏ qua ghi ConfigMap", "configmap", name, "entries", len(data))
	return nil
}
