// Package auth xác thực access token OIDC do Keycloak cấp và nạp vai trò MaaS từ PostgreSQL.
// Vai trò lưu ở CSDL MaaS, không dùng role của Keycloak (mục 1, Công nghệ bắt buộc).
package auth

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5/pgxpool"

	"bemaas/internal/cache"
	"bemaas/internal/config"
	"bemaas/internal/httpx"
)

// Principal là người đang gọi API cùng các vai trò của họ.
type Principal struct {
	ID         string   `json:"id"`
	Email      string   `json:"email"`
	Name       string   `json:"name"`
	IsPlatform bool     `json:"is_platform_admin"`
	IsAuditor  bool     `json:"is_auditor"`
	AdminOf    []string `json:"admin_of"`  // id phòng mà người này là quản trị
	MemberOf   []string `json:"member_of"` // id phòng mà người này là thành viên
}

func (p *Principal) IsDeptAdmin(deptID string) bool { return slices.Contains(p.AdminOf, deptID) }

// CanManageDept: Quản trị nền tảng, hoặc quản trị của đúng phòng đó.
func (p *Principal) CanManageDept(deptID string) bool { return p.IsPlatform || p.IsDeptAdmin(deptID) }

// SeesAll: người xem được dữ liệu toàn ngân hàng (Nền tảng, Kiểm soát).
func (p *Principal) SeesAll() bool { return p.IsPlatform || p.IsAuditor }

type claims struct {
	Sub               string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
}

type Authenticator struct {
	verifier       *oidc.IDTokenVerifier
	db             *pgxpool.Pool
	cache          *cache.Cache
	platformAdmins []string
}

func New(ctx context.Context, cfg config.OIDC, platformAdmins []string, db *pgxpool.Pool, c *cache.Cache) (*Authenticator, error) {
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("không đọc được cấu hình OIDC của %s: %w", cfg.Issuer, err)
	}
	// go-oidc kiểm chữ ký theo JWKS của realm, cùng `iss`, `aud`, `exp`.
	v := provider.Verifier(&oidc.Config{ClientID: cfg.Audience})
	admins := make([]string, 0, len(platformAdmins))
	for _, e := range platformAdmins {
		admins = append(admins, strings.ToLower(strings.TrimSpace(e)))
	}
	return &Authenticator{verifier: v, db: db, cache: c, platformAdmins: admins}, nil
}

const principalKey = "principal"

// Middleware bắt buộc có `Authorization: Bearer <access token>` hợp lệ.
func (a *Authenticator) Middleware() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		raw := string(c.GetHeader("Authorization"))
		token, ok := strings.CutPrefix(raw, "Bearer ")
		if !ok || token == "" {
			httpx.Fail(c, httpx.ErrUnauthorized)
			return
		}
		idt, err := a.verifier.Verify(ctx, token)
		if err != nil {
			httpx.Fail(c, httpx.ErrUnauthorized)
			return
		}
		var cl claims
		if err := idt.Claims(&cl); err != nil || cl.Sub == "" {
			httpx.Fail(c, httpx.ErrUnauthorized)
			return
		}
		p, err := cache.GetOrLoad(ctx, a.cache, PrincipalCacheKey(cl.Sub), time.Minute, func(ctx context.Context) (*Principal, error) {
			return a.load(ctx, cl)
		})
		if err != nil {
			httpx.Fail(c, err)
			return
		}
		c.Set(principalKey, p)
		c.Next(ctx)
	}
}

func PrincipalCacheKey(userID string) string { return "me:" + userID }

// From lấy Principal đã được Middleware gắn vào request.
func From(c *app.RequestContext) *Principal {
	v, _ := c.Get(principalKey)
	p, _ := v.(*Principal)
	return p
}

// load ghi nhận người dùng (lần đầu đăng nhập thì tạo) và đọc vai trò.
func (a *Authenticator) load(ctx context.Context, cl claims) (*Principal, error) {
	name := cl.Name
	if name == "" {
		name = cl.PreferredUsername
	}
	p := &Principal{ID: cl.Sub, Email: cl.Email, Name: name, AdminOf: []string{}, MemberOf: []string{}}

	_, err := a.db.Exec(ctx, `
		INSERT INTO app_user (id, email, name) VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, last_login_at = now()`,
		p.ID, p.Email, p.Name)
	if err != nil {
		return nil, err
	}
	if p.Email != "" && slices.Contains(a.platformAdmins, strings.ToLower(p.Email)) {
		if _, err := a.db.Exec(ctx, `INSERT INTO platform_admin (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, p.ID); err != nil {
			return nil, err
		}
	}
	err = a.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM platform_admin WHERE user_id = $1),
		       EXISTS (SELECT 1 FROM auditor WHERE user_id = $1),
		       COALESCE((SELECT array_agg(department_id::text) FROM department_admin WHERE user_id = $1), '{}'),
		       COALESCE((SELECT array_agg(department_id::text) FROM member WHERE user_id = $1 AND left_at IS NULL), '{}')`,
		p.ID).Scan(&p.IsPlatform, &p.IsAuditor, &p.AdminOf, &p.MemberOf)
	if err != nil {
		return nil, err
	}
	return p, nil
}
