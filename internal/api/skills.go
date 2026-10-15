package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"

	"bemaas/internal/auth"
	"bemaas/internal/httpx"
	"bemaas/internal/notify"
	"bemaas/internal/skillpkg"
)

// Skill hub không phân quyền theo vai trò: mọi nhân viên có quyền như nhau (S2).
// Hub không cần nhật ký quản trị; lịch sử phiên bản là đủ (mục 14).

type Skill struct {
	ID            string    `json:"id"`
	Domain        string    `json:"domain"`
	Name          string    `json:"name"`
	Title         string    `json:"title"`
	Kind          string    `json:"kind"`
	Description   string    `json:"description"`
	Trigger       string    `json:"trigger"`
	Author        UserRef   `json:"author"`
	OwnerUnit     string    `json:"owner_unit"`
	Models        []string  `json:"models"`
	Tools         []string  `json:"tools"`
	Verified      bool      `json:"verified"`
	LatestVersion string    `json:"latest_version"`
	Installs      int64     `json:"installs"`
	Likes         int64     `json:"likes"`
	LikedByMe     bool      `json:"liked_by_me"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

const skillSelect = `
	SELECT s.id::text, s.domain, s.name, s.title, s.kind, s.description, s.trigger, u.id, u.email, u.name, s.owner_unit,
	       s.models, s.tools, s.verified, s.latest_version, s.installs,
	       (SELECT count(*) FROM skill_like l WHERE l.skill_id = s.id),
	       EXISTS (SELECT 1 FROM skill_like l WHERE l.skill_id = s.id AND l.user_id = $1),
	       s.created_at, s.updated_at
	FROM skill s JOIN app_user u ON u.id = s.author_user_id`

func scanSkill(r pgx.CollectableRow) (Skill, error) {
	var s Skill
	err := r.Scan(&s.ID, &s.Domain, &s.Name, &s.Title, &s.Kind, &s.Description, &s.Trigger, &s.Author.ID, &s.Author.Email,
		&s.Author.Name, &s.OwnerUnit, &s.Models, &s.Tools, &s.Verified, &s.LatestVersion, &s.Installs, &s.Likes, &s.LikedByMe,
		&s.CreatedAt, &s.UpdatedAt)
	return s, err
}

// GET /skills?q&domain&kind&model&tab=all|liked|mine&sort=installs|likes|updated|name (S5, S6).
func (a *API) listSkills(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	args := []any{p.ID}
	add := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }
	conds := []string{"TRUE"}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		ph := add("%" + strings.ToLower(q) + "%")
		conds = append(conds, "(lower(s.title) LIKE "+ph+" OR lower(s.name) LIKE "+ph+" OR lower(s.description) LIKE "+ph+")")
	}
	if v := c.Query("domain"); v != "" {
		conds = append(conds, "s.domain = "+add(v))
	}
	if v := c.Query("kind"); v != "" {
		conds = append(conds, "s.kind = "+add(v))
	}
	if v := c.Query("model"); v != "" {
		conds = append(conds, add(v)+" = ANY(s.models)")
	}
	switch c.Query("tab") {
	case "liked":
		conds = append(conds, "EXISTS (SELECT 1 FROM skill_like l WHERE l.skill_id = s.id AND l.user_id = $1)")
	case "mine":
		conds = append(conds, "s.author_user_id = $1")
	}
	order := map[string]string{
		"installs": "s.installs DESC", "likes": "17 DESC", "updated": "s.updated_at DESC", "name": "s.title",
	}[c.DefaultQuery("sort", "installs")]
	if order == "" {
		order = "s.installs DESC"
	}
	rows, err := a.db.Query(ctx, skillSelect+" WHERE "+strings.Join(conds, " AND ")+" ORDER BY "+order+" LIMIT 500", args...)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	items, err := pgx.CollectRows(rows, scanSkill)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{"items": items})
}

func (a *API) findSkill(ctx context.Context, userID, id string) (Skill, error) {
	rows, err := a.db.Query(ctx, skillSelect+" WHERE s.id::text = $2", userID, id)
	if err != nil {
		return Skill{}, err
	}
	return pgx.CollectExactlyOneRow(rows, scanSkill)
}

type skillVersion struct {
	Version   string          `json:"version"`
	Changelog string          `json:"changelog"`
	SizeBytes int64           `json:"size_bytes"`
	Files     json.RawMessage `json:"files,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// GET /skills/:id — chi tiết skill, phiên bản, các bộ skill có chứa skill này (S15–S17).
func (a *API) getSkill(ctx context.Context, c *app.RequestContext) {
	s, err := a.findSkill(ctx, auth.From(c).ID, c.Param("id"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err := a.db.Query(ctx, `SELECT version, changelog, size_bytes, created_at FROM skill_version WHERE skill_id::text = $1 ORDER BY created_at DESC`, s.ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	versions, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (skillVersion, error) {
		var v skillVersion
		return v, r.Scan(&v.Version, &v.Changelog, &v.SizeBytes, &v.CreatedAt)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err = a.db.Query(ctx, `SELECT id::text, role_name, unit, scope FROM skill_set WHERE $1::uuid = ANY(skill_ids) ORDER BY role_name`, s.ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	sets, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{
		"skill": s, "versions": versions, "skill_sets": sets,
		"install_command": fmt.Sprintf("maas skills add %s/%s", s.Domain, s.Name),
	})
}

// GET /skills/:id/files?version= — cây tệp của một phiên bản (mặc định phiên bản mới nhất).
func (a *API) skillFiles(ctx context.Context, c *app.RequestContext) {
	var files json.RawMessage
	err := a.db.QueryRow(ctx, `
		SELECT v.files FROM skill_version v JOIN skill s ON s.id = v.skill_id
		WHERE s.id::text = $1 AND v.version = COALESCE(NULLIF($2, ''), s.latest_version)`, c.Param("id"), c.Query("version")).Scan(&files)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Data(http.StatusOK, "application/json", fmt.Appendf(nil, `{"items":%s}`, files))
}

// GET /skills/:id/file?path=&version= — nội dung một tệp để xem và chép (S15).
func (a *API) skillFileContent(ctx context.Context, c *app.RequestContext) {
	ref, _, err := a.packageRef(ctx, c.Param("id"), c.Query("version"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	data, err := a.readPackage(ctx, ref)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	content, err := skillpkg.ReadFile(data, c.Query("path"))
	if err != nil {
		httpx.Fail(c, httpx.ErrNotFound)
		return
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", content)
}

func (a *API) packageRef(ctx context.Context, skillID, version string) (ref, ver string, err error) {
	err = a.db.QueryRow(ctx, `
		SELECT v.package_ref, v.version FROM skill_version v JOIN skill s ON s.id = v.skill_id
		WHERE s.id::text = $1 AND v.version = COALESCE(NULLIF($2, ''), s.latest_version)`, skillID, version).Scan(&ref, &ver)
	return
}

func (a *API) readPackage(ctx context.Context, ref string) ([]byte, error) {
	r, err := a.files.Get(ctx, ref)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(io.LimitReader(r, skillpkg.MaxPackageBytes+1))
}

type skillMeta struct {
	Domain      string   `json:"domain"`
	Name        string   `json:"name"`
	Title       string   `json:"title"`
	Kind        string   `json:"kind"`
	Description string   `json:"description"`
	Trigger     string   `json:"trigger"`
	OwnerUnit   string   `json:"owner_unit"`
	Models      []string `json:"models"`
	Tools       []string `json:"tools"`
	Version     string   `json:"version"`
	Changelog   string   `json:"changelog"`
	WishID      *string  `json:"wish_id"` // skill này đáp ứng một đề xuất ở "Skill đang cần": đề xuất đóng lại
}

var (
	slugRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)
	versionRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
)

// readUpload đọc phần `package` (.zip) của form multipart, kiểm tra tự động và trả nội dung.
func readUpload(c *app.RequestContext) ([]byte, *skillpkg.Result, error) {
	fh, err := c.FormFile("package")
	if err != nil {
		return nil, nil, httpx.BadRequest("Cần tệp .zip ở trường package")
	}
	if fh.Size > skillpkg.MaxPackageBytes {
		return nil, nil, httpx.Unprocessable("PACKAGE_TOO_LARGE", fmt.Sprintf("Gói skill tối đa %d MiB", skillpkg.MaxPackageBytes>>20))
	}
	f, err := fh.Open()
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, skillpkg.MaxPackageBytes+1))
	if err != nil {
		return nil, nil, err
	}
	res, err := skillpkg.Check(data)
	if err != nil {
		return nil, nil, httpx.Unprocessable("PACKAGE_INVALID", err.Error())
	}
	if len(res.Problems) > 0 {
		return nil, nil, httpx.Unprocessable("PACKAGE_CHECK_FAILED", "Gói skill chưa đạt kiểm tra tự động").With("problems", res.Problems)
	}
	return data, res, nil
}

func (a *API) putPackage(ctx context.Context, domain, name, version string, data []byte) (string, error) {
	key := fmt.Sprintf("skills/%s/%s/%s.zip", domain, name, version)
	return key, a.files.Put(ctx, key, bytes.NewReader(data), int64(len(data)), "application/zip")
}

// POST /skills — chia sẻ skill mới (S19, S20). Form multipart: `meta` (JSON) và `package` (.zip).
// Đạt kiểm tra tự động thì skill có trên hub ngay.
func (a *API) createSkill(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	var m skillMeta
	if err := json.Unmarshal([]byte(c.PostForm("meta")), &m); err != nil {
		httpx.Fail(c, httpx.BadRequest("Trường meta phải là JSON hợp lệ"))
		return
	}
	if !slugRe.MatchString(m.Domain) || !slugRe.MatchString(m.Name) {
		httpx.Fail(c, httpx.BadRequest("Lĩnh vực và ID chỉ gồm chữ thường, số và dấu gạch ngang"))
		return
	}
	if m.Kind != "guide" && m.Kind != "script" && m.Kind != "tool" {
		httpx.Fail(c, httpx.BadRequest("kind phải là guide, script hoặc tool"))
		return
	}
	if m.Version == "" {
		m.Version = "1.0.0"
	}
	if !versionRe.MatchString(m.Version) {
		httpx.Fail(c, httpx.BadRequest("Phiên bản có dạng MAJOR.MINOR.PATCH"))
		return
	}
	data, res, err := readUpload(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if m.Title == "" {
		m.Title = res.Manifest.Name
	}
	if m.Description == "" {
		m.Description = res.Manifest.Description
	}
	if m.Models == nil {
		m.Models = []string{}
	}
	if m.Tools == nil {
		m.Tools = []string{}
	}
	var exists bool
	if err := a.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM skill WHERE domain=$1 AND name=$2)`, m.Domain, m.Name).Scan(&exists); err != nil {
		httpx.Fail(c, err)
		return
	}
	if exists {
		httpx.Fail(c, httpx.Conflict("SKILL_ID_TAKEN", "Đã có skill "+m.Domain+"/"+m.Name))
		return
	}
	ref, err := a.putPackage(ctx, m.Domain, m.Name, m.Version, data)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	filesJSON, _ := json.Marshal(res.Files)
	var id string
	err = a.tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO skill (domain, name, title, kind, description, trigger, author_user_id, owner_unit, models, tools, latest_version)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`,
			m.Domain, m.Name, m.Title, m.Kind, m.Description, m.Trigger, p.ID, m.OwnerUnit, m.Models, m.Tools, m.Version).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO skill_version (skill_id, version, changelog, package_ref, size_bytes, files) VALUES ($1::uuid,$2,$3,$4,$5,$6)`,
			id, m.Version, m.Changelog, ref, len(data), filesJSON); err != nil {
			return err
		}
		if m.WishID == nil || *m.WishID == "" {
			return nil
		}
		var proposer, title string
		var taker *string
		err := tx.QueryRow(ctx, `UPDATE skill_wish SET fulfilled_skill_id = $2::uuid, taker = COALESCE(taker, $3)
			WHERE id::text = $1 AND fulfilled_skill_id IS NULL RETURNING proposed_by, taker, title`, *m.WishID, id, p.ID).Scan(&proposer, &taker, &title)
		if err == pgx.ErrNoRows {
			return httpx.Conflict("WISH_CLOSED", "Đề xuất đã đóng hoặc không tồn tại")
		}
		if err != nil {
			return err
		}
		return notify.Send(ctx, tx, []string{proposer}, notify.Message{
			Kind: "wish.fulfilled", Title: "Đề xuất “" + title + "” đã có skill", Body: p.Name + " đã đăng skill " + m.Domain + "/" + m.Name + ".",
			Link: "/skills/" + id,
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

// POST /skills/:id/versions — phiên bản mới, chỉ người chia sẻ. Form: `version`, `changelog`, `package`.
func (a *API) createSkillVersion(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	s, err := a.findSkill(ctx, p.ID, c.Param("id"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if s.Author.ID != p.ID {
		httpx.Fail(c, httpx.ErrForbidden)
		return
	}
	version := c.PostForm("version")
	if !versionRe.MatchString(version) {
		httpx.Fail(c, httpx.BadRequest("Phiên bản có dạng MAJOR.MINOR.PATCH"))
		return
	}
	data, res, err := readUpload(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	ref, err := a.putPackage(ctx, s.Domain, s.Name, version, data)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	filesJSON, _ := json.Marshal(res.Files)
	err = a.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO skill_version (skill_id, version, changelog, package_ref, size_bytes, files) VALUES ($1::uuid,$2,$3,$4,$5,$6)`,
			s.ID, version, c.PostForm("changelog"), ref, len(data), filesJSON); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE skill SET latest_version=$2, updated_at=now() WHERE id::text=$1`, s.ID, version)
		return err
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": s.ID, "version": version})
}

// GET /skills/:id/download?version=&via=zip|cli — trả URL tải có thời hạn ngắn và ghi skill_install.
func (a *API) downloadSkill(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	ref, ver, err := a.packageRef(ctx, id, c.Query("version"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	via := c.DefaultQuery("via", "zip")
	if via != "zip" && via != "cli" && via != "set" {
		via = "zip"
	}
	var domain, name string
	err = a.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO skill_install (skill_id, version, user_id, via) VALUES ($1::uuid,$2,$3,$4)`, id, ver, p.ID, via); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `UPDATE skill SET installs = installs + 1 WHERE id::text = $1 RETURNING domain, name`, id).Scan(&domain, &name)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	url, err := a.files.PresignGet(ctx, ref, fmt.Sprintf("%s-%s-%s.zip", domain, name, ver))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]string{"url": url, "version": ver})
}

func (a *API) likeSkill(ctx context.Context, c *app.RequestContext) {
	if _, err := a.db.Exec(ctx, `INSERT INTO skill_like (skill_id, user_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
		c.Param("id"), auth.From(c).ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

func (a *API) unlikeSkill(ctx context.Context, c *app.RequestContext) {
	if _, err := a.db.Exec(ctx, `DELETE FROM skill_like WHERE skill_id::text = $1 AND user_id = $2`, c.Param("id"), auth.From(c).ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

type comment struct {
	ID       string    `json:"id"`
	User     UserRef   `json:"user"`
	Body     string    `json:"body"`
	ParentID *string   `json:"parent_id"`
	TS       time.Time `json:"ts"`
}

func (a *API) listSkillComments(ctx context.Context, c *app.RequestContext) {
	rows, err := a.db.Query(ctx, `
		SELECT c.id::text, u.id, u.email, u.name, c.body, c.parent_id::text, c.ts
		FROM skill_comment c JOIN app_user u ON u.id = c.user_id WHERE c.skill_id::text = $1 ORDER BY c.ts`, c.Param("id"))
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

func (a *API) createSkillComment(ctx context.Context, c *app.RequestContext) {
	var in struct {
		Body     string  `json:"body"`
		ParentID *string `json:"parent_id"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if strings.TrimSpace(in.Body) == "" || len(in.Body) > 10000 {
		httpx.Fail(c, httpx.BadRequest("Nội dung góp ý trống hoặc quá dài"))
		return
	}
	p := auth.From(c)
	var id string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO skill_comment (skill_id, user_id, body, parent_id) VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING id::text`,
			c.Param("id"), p.ID, in.Body, in.ParentID).Scan(&id); err != nil {
			return err
		}
		var author, title string
		if err := tx.QueryRow(ctx, `SELECT author_user_id, title FROM skill WHERE id::text = $1`, c.Param("id")).Scan(&author, &title); err != nil {
			return err
		}
		if author == p.ID {
			return nil
		}
		return notify.Send(ctx, tx, []string{author}, notify.Message{
			Kind: "skill.comment", Title: "Góp ý mới trên skill " + title, Body: p.Name + ": " + in.Body,
			Link: "/skills/" + c.Param("id") + "?tab=comments",
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

// --- Bộ skill theo vai trò (S9–S11) và Skill đang cần (S13, S14) ---------------

func (a *API) listSkillSets(ctx context.Context, c *app.RequestContext) {
	args, where := []any{}, "TRUE"
	if s := c.Query("scope"); s != "" {
		args, where = append(args, s), "scope = $1"
	}
	rows, err := a.db.Query(ctx, `SELECT id::text, role_name, unit, scope, cardinality(skill_ids) AS skill_count FROM skill_set WHERE `+where+` ORDER BY role_name`, args...)
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

func (a *API) getSkillSet(ctx context.Context, c *app.RequestContext) {
	var set struct {
		ID, RoleName, Unit, Scope string
	}
	if err := a.db.QueryRow(ctx, `SELECT id::text, role_name, unit, scope FROM skill_set WHERE id::text = $1`, c.Param("id")).
		Scan(&set.ID, &set.RoleName, &set.Unit, &set.Scope); err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err := a.db.Query(ctx, skillSelect+` WHERE s.id IN (SELECT unnest(skill_ids) FROM skill_set WHERE id::text = $2) ORDER BY s.title`,
		auth.From(c).ID, set.ID)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	skills, err := pgx.CollectRows(rows, scanSkill)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, map[string]any{
		"id": set.ID, "role_name": set.RoleName, "unit": set.Unit, "scope": set.Scope, "skills": skills,
	})
}

func (a *API) listWishes(ctx context.Context, c *app.RequestContext) {
	rows, err := a.db.Query(ctx, `
		SELECT w.id::text, w.title, w.description, w.skill_set_id::text, w.few_experts, w.created_at,
		       pu.name AS proposed_by, tu.name AS taker, w.taker = $1 AS taken_by_me,
		       w.fulfilled_skill_id::text AS fulfilled_skill_id,
		       (SELECT domain || '/' || name FROM skill WHERE id = w.fulfilled_skill_id) AS fulfilled_skill,
		       (SELECT role_name FROM skill_set WHERE id = w.skill_set_id) AS skill_set,
		       (SELECT count(*) FROM skill_wish_vote v WHERE v.wish_id = w.id) AS votes,
		       EXISTS (SELECT 1 FROM skill_wish_vote v WHERE v.wish_id = w.id AND v.user_id = $1) AS voted_by_me
		FROM skill_wish w JOIN app_user pu ON pu.id = w.proposed_by LEFT JOIN app_user tu ON tu.id = w.taker
		ORDER BY (w.fulfilled_skill_id IS NOT NULL), votes DESC, w.created_at DESC`, auth.From(c).ID)
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

func (a *API) createWish(ctx context.Context, c *app.RequestContext) {
	var in struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		SkillSetID  *string `json:"skill_set_id"`
		FewExperts  bool    `json:"few_experts"`
	}
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if strings.TrimSpace(in.Title) == "" {
		httpx.Fail(c, httpx.BadRequest("Cần tiêu đề đề xuất"))
		return
	}
	var id string
	if err := a.db.QueryRow(ctx, `INSERT INTO skill_wish (title, description, skill_set_id, proposed_by, few_experts) VALUES ($1,$2,$3::uuid,$4,$5) RETURNING id::text`,
		in.Title, in.Description, in.SkillSetID, auth.From(c).ID, in.FewExperts).Scan(&id); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

func (a *API) voteWish(ctx context.Context, c *app.RequestContext) {
	if _, err := a.db.Exec(ctx, `INSERT INTO skill_wish_vote (wish_id, user_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
		c.Param("id"), auth.From(c).ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

func (a *API) unvoteWish(ctx context.Context, c *app.RequestContext) {
	if _, err := a.db.Exec(ctx, `DELETE FROM skill_wish_vote WHERE wish_id::text = $1 AND user_id = $2`, c.Param("id"), auth.From(c).ID); err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

// POST /skill-wishes/:id/take — "Tôi sẽ viết".
func (a *API) takeWish(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	err := a.tx(ctx, func(tx pgx.Tx) error {
		var proposer, title string
		err := tx.QueryRow(ctx, `UPDATE skill_wish SET taker = $2 WHERE id::text = $1 AND taker IS NULL AND fulfilled_skill_id IS NULL
			RETURNING proposed_by, title`, c.Param("id"), p.ID).Scan(&proposer, &title)
		if err == pgx.ErrNoRows {
			return httpx.Conflict("WISH_TAKEN", "Đề xuất đã có người nhận viết hoặc không tồn tại")
		}
		if err != nil || proposer == p.ID {
			return err
		}
		return notify.Send(ctx, tx, []string{proposer}, notify.Message{
			Kind: "wish.taken", Title: "Đề xuất “" + title + "” đã có người nhận viết", Body: p.Name + " sẽ viết skill này.",
			Link: "/skills?tab=wanted",
		})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}
