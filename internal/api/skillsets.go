package api

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"

	"bemaas/internal/audit"
	"bemaas/internal/auth"
	"bemaas/internal/httpx"
	"bemaas/internal/skillpkg"
)

// Bộ skill theo vai trò (S9–S12). Ai phụ trách chọn skill vào bộ chưa chốt (câu hỏi mở 13);
// tạm thời Quản trị nền tảng sửa bộ. Ai cũng xem và cài được (S10).

type skillSetInput struct {
	RoleName string   `json:"role_name"`
	Unit     string   `json:"unit"`
	Scope    string   `json:"scope"`
	SkillIDs []string `json:"skill_ids"`
}

func (in *skillSetInput) validate() error {
	if strings.TrimSpace(in.RoleName) == "" {
		return httpx.BadRequest("Cần tên vai trò")
	}
	if !slices.Contains([]string{"nghiep_vu", "cntt"}, in.Scope) {
		return httpx.BadRequest("scope phải là nghiep_vu hoặc cntt")
	}
	if in.SkillIDs == nil {
		in.SkillIDs = []string{}
	}
	return nil
}

func (a *API) createSkillSet(ctx context.Context, c *app.RequestContext) {
	p := auth.From(c)
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in skillSetInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if err := in.validate(); err != nil {
		httpx.Fail(c, err)
		return
	}
	var id string
	err := a.tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO skill_set (role_name, unit, scope, skill_ids) VALUES ($1,$2,$3,$4::uuid[]) RETURNING id::text`,
			strings.TrimSpace(in.RoleName), in.Unit, in.Scope, in.SkillIDs).Scan(&id); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "skill_set.create", TargetType: "skill_set", TargetID: id, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, map[string]string{"id": id})
}

func (a *API) updateSkillSet(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	var in skillSetInput
	if err := httpx.Bind(c, &in); err != nil {
		httpx.Fail(c, err)
		return
	}
	if err := in.validate(); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE skill_set SET role_name=$2, unit=$3, scope=$4, skill_ids=$5::uuid[] WHERE id::text=$1`,
			id, strings.TrimSpace(in.RoleName), in.Unit, in.Scope, in.SkillIDs)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "skill_set.update", TargetType: "skill_set", TargetID: id, After: in})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

func (a *API) deleteSkillSet(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	if err := requirePlatform(p); err != nil {
		httpx.Fail(c, err)
		return
	}
	err := a.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE skill_wish SET skill_set_id = NULL WHERE skill_set_id::text = $1`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM skill_set WHERE id::text = $1`, id); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Entry{Actor: p.ID, Action: "skill_set.delete", TargetType: "skill_set", TargetID: id})
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.NoContent(c)
}

// GET /skill-sets/:id/download — một tệp .zip chứa phiên bản mới nhất của mọi skill trong bộ,
// mỗi skill một thư mục <lĩnh vực>/<id>/. Mỗi skill tăng lượt cài 1 (tiêu chí 9 và 8).
func (a *API) downloadSkillSet(ctx context.Context, c *app.RequestContext) {
	p, id := auth.From(c), c.Param("id")
	var roleName string
	if err := a.db.QueryRow(ctx, `SELECT role_name FROM skill_set WHERE id::text = $1`, id).Scan(&roleName); err != nil {
		httpx.Fail(c, err)
		return
	}
	rows, err := a.db.Query(ctx, `
		SELECT s.id::text, s.domain, s.name, s.latest_version, v.package_ref
		FROM skill s JOIN skill_version v ON v.skill_id = s.id AND v.version = s.latest_version
		WHERE s.id IN (SELECT unnest(skill_ids) FROM skill_set WHERE id::text = $1) ORDER BY s.domain, s.name`, id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	type pkg struct{ id, domain, name, version, ref string }
	pkgs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pkg, error) {
		var x pkg
		return x, r.Scan(&x.id, &x.domain, &x.name, &x.version, &x.ref)
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if len(pkgs) == 0 {
		httpx.Fail(c, httpx.Unprocessable("SKILL_SET_EMPTY", "Bộ skill chưa có skill nào"))
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, x := range pkgs {
		data, err := a.readPackage(ctx, x.ref)
		if err != nil {
			httpx.Fail(c, err)
			return
		}
		err = skillpkg.Walk(data, func(name string, r io.Reader) error {
			w, err := zw.Create(fmt.Sprintf("%s/%s/%s", x.domain, x.name, name))
			if err != nil {
				return err
			}
			_, err = io.Copy(w, r)
			return err
		})
		if err != nil {
			httpx.Fail(c, err)
			return
		}
	}
	if err := zw.Close(); err != nil {
		httpx.Fail(c, err)
		return
	}
	err = a.tx(ctx, func(tx pgx.Tx) error {
		for _, x := range pkgs {
			if _, err := tx.Exec(ctx, `INSERT INTO skill_install (skill_id, version, user_id, via) VALUES ($1::uuid,$2,$3,'set')`, x.id, x.version, p.ID); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `UPDATE skill SET installs = installs + 1 WHERE id::text = $1`, x.id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="bo-skill-%s.zip"`, id[:8]))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
