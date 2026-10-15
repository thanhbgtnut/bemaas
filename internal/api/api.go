// Package api chứa các handler Hertz cho `/api/v1` (mục 12 và 20.5 của spec).
// Máy chủ kiểm tra quyền ở từng API theo (vai trò, phòng, chủ key); giao diện chỉ ẩn nút.
package api

import (
	"context"
	"strconv"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"bemaas/internal/auth"
	"bemaas/internal/cache"
	"bemaas/internal/config"
	"bemaas/internal/gateway"
	"bemaas/internal/httpx"
	"bemaas/internal/storage"
)

type API struct {
	cfg   *config.Config
	db    *pgxpool.Pool
	cache *cache.Cache
	files *storage.Store
	sync  *gateway.Syncer
	loc   *time.Location
}

func New(cfg *config.Config, db *pgxpool.Pool, c *cache.Cache, files *storage.Store, sync *gateway.Syncer, loc *time.Location) *API {
	return &API{cfg: cfg, db: db, cache: c, files: files, sync: sync, loc: loc}
}

// RegisterPublic: các API không cần đăng nhập (giao diện cần để biết cách đăng nhập).
func (a *API) RegisterPublic(g *route.RouterGroup) {
	g.GET("/config", a.publicConfig)
}

// Register: các API cần access token Keycloak.
func (a *API) Register(g *route.RouterGroup) {
	g.GET("/me", a.me)
	g.GET("/notifications", a.listNotifications)
	g.POST("/notifications/read", a.readNotifications)
	g.GET("/search", a.search)
	g.GET("/roles", a.listRoles)
	g.PUT("/roles/:role", a.setRole)

	// Models và Playground
	g.GET("/models", a.listModels)
	g.POST("/models", a.createModel)
	g.GET("/models/:id", a.getModel)
	g.PATCH("/models/:id", a.updateModel)
	g.PUT("/models/enabled", a.setModelsEnabled)
	g.PUT("/models/:id/like", a.likeModel)
	g.DELETE("/models/:id/like", a.unlikeModel)
	g.GET("/standards", a.listStandards)
	g.GET("/models/:id/versions", a.listModelVersions)
	g.POST("/models/:id/versions", a.createModelVersion)
	g.GET("/models/:id/comments", a.listModelComments)
	g.POST("/models/:id/comments", a.createModelComment)
	g.GET("/model-prices", a.listPrices)
	g.PUT("/model-prices", a.putPrices)
	g.GET("/gateway/catalog", a.gatewayCatalog)

	// Skill hub
	g.GET("/skills", a.listSkills)
	g.POST("/skills", a.createSkill)
	g.GET("/skills/:id", a.getSkill)
	g.GET("/skills/:id/files", a.skillFiles)
	g.GET("/skills/:id/file", a.skillFileContent)
	g.POST("/skills/:id/versions", a.createSkillVersion)
	g.GET("/skills/:id/download", a.downloadSkill)
	g.PUT("/skills/:id/like", a.likeSkill)
	g.DELETE("/skills/:id/like", a.unlikeSkill)
	g.GET("/skills/:id/comments", a.listSkillComments)
	g.POST("/skills/:id/comments", a.createSkillComment)
	g.GET("/skill-sets", a.listSkillSets)
	g.POST("/skill-sets", a.createSkillSet)
	g.GET("/skill-sets/:id", a.getSkillSet)
	g.PUT("/skill-sets/:id", a.updateSkillSet)
	g.DELETE("/skill-sets/:id", a.deleteSkillSet)
	g.GET("/skill-sets/:id/download", a.downloadSkillSet)
	g.GET("/skill-wishes", a.listWishes)
	g.POST("/skill-wishes", a.createWish)
	g.PUT("/skill-wishes/:id/vote", a.voteWish)
	g.DELETE("/skill-wishes/:id/vote", a.unvoteWish)
	g.POST("/skill-wishes/:id/take", a.takeWish)

	// Ngân sách, key, chi phí
	g.GET("/departments", a.listDepartments)
	g.POST("/departments", a.createDepartment)
	g.GET("/departments/:id", a.getDepartment)
	g.PATCH("/departments/:id", a.updateDepartment)
	g.PUT("/departments/:id/admins", a.setDepartmentAdmins)
	g.GET("/departments/:id/members", a.listMembers)
	g.POST("/departments/:id/members", a.addMember)
	g.DELETE("/departments/:id/members/:userId", a.removeMember)
	g.GET("/departments/:id/keys", a.listDepartmentKeys)
	g.POST("/departments/:id/keys", a.createKey)
	g.PATCH("/keys/:id", a.updateKey)
	g.POST("/keys/:id/claim", a.claimKey)
	g.POST("/keys/:id/rotate", a.rotateKey)
	g.POST("/keys/:id/revoke", a.revokeKey)
	g.GET("/me/keys", a.myKeys)
	g.GET("/usage", a.usage)
	g.GET("/limit-requests", a.listLimitRequests)
	g.POST("/limit-requests", a.createLimitRequest)
	g.POST("/limit-requests/:id/approve", a.approveLimitRequest)
	g.POST("/limit-requests/:id/reject", a.rejectLimitRequest)
	g.GET("/audit-log", a.auditLog)
	g.GET("/users", a.searchUsers)

	// MCP server và tools (mục 20.5)
	g.GET("/mcp-servers", a.listMCPServers)
	g.POST("/mcp-servers", a.createMCPServer)
	g.GET("/mcp-servers/:id", a.getMCPServer)
	g.PATCH("/mcp-servers/:id", a.updateMCPServer)
	g.DELETE("/mcp-servers/:id", a.deleteMCPServer)
	g.POST("/mcp-servers/:id/scan", a.scanMCPServer)
	g.PUT("/mcp-servers/:id/tools", a.setMCPTools)
	g.PUT("/mcp-servers/:id/scope", a.setMCPScope)
	g.GET("/mcp-gateway-config", a.mcpGatewayConfig)
}

func (a *API) publicConfig(_ context.Context, c *app.RequestContext) {
	httpx.OK(c, map[string]any{
		"oidc": map[string]string{
			"issuer":    a.cfg.OIDC.Issuer,
			"client_id": a.cfg.OIDC.ClientID,
		},
		"gateway_base_url": a.cfg.Gateway.BaseURL,
	})
}

func (a *API) me(_ context.Context, c *app.RequestContext) {
	httpx.OK(c, auth.From(c))
}

// period trả kỳ tính tiền hiện tại YYYY-MM theo múi giờ cấu hình (B2).
func (a *API) period() string { return time.Now().In(a.loc).Format("2006-01") }

// periodStart trả mốc 00:00 ngày 1 của tháng hiện tại.
func (a *API) periodStart() time.Time {
	now := time.Now().In(a.loc)
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, a.loc)
}

func (a *API) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, a.db, fn)
}

// invalidateUser xoá cache vai trò của người dùng sau khi đổi quyền hoặc phòng.
func (a *API) invalidateUser(ctx context.Context, userIDs ...string) {
	for _, id := range userIDs {
		a.cache.Del(ctx, auth.PrincipalCacheKey(id))
	}
}

func queryInt(c *app.RequestContext, name string, def, max int) int {
	n, err := strconv.Atoi(c.Query(name))
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func requirePlatform(p *auth.Principal) error {
	if !p.IsPlatform {
		return httpx.ErrForbidden
	}
	return nil
}
