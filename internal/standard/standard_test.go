package standard

import (
	"encoding/json"
	"os"
	"testing"
)

// Mỗi thao tác của mỗi chuẩn có 1–2 ví dụ mẫu (P10), và danh mục mã hoá được thành JSON cho GET /standards.
func TestCatalog(t *testing.T) {
	seen := map[string]bool{}
	for _, s := range All {
		if seen[s.ID] {
			t.Errorf("trùng id chuẩn %s", s.ID)
		}
		seen[s.ID] = true
		if s.Unit != UnitToken && s.Unit != UnitPage {
			t.Errorf("%s: đơn vị %q không hợp lệ", s.ID, s.Unit)
		}
		for _, op := range s.Ops {
			if n := len(op.Examples); n < 1 || n > 2 {
				t.Errorf("%s/%s: cần 1–2 ví dụ, đang có %d", s.ID, op.ID, n)
			}
			for _, ex := range op.Examples {
				for name, raw := range map[string]json.RawMessage{"body": ex.Body, "state": ex.State, "questions": ex.Questions} {
					if len(raw) > 0 && !json.Valid(raw) {
						t.Errorf("%s/%s/%s: %s không phải JSON hợp lệ", s.ID, op.ID, ex.Title, name)
					}
				}
				for _, f := range append(ex.Images, ex.File) {
					if f == "" {
						continue
					}
					if _, err := os.Stat("../../web/public" + f); err != nil {
						t.Errorf("%s/%s/%s: không có tệp mẫu %s", s.ID, op.ID, ex.Title, f)
					}
				}
				if len(ex.Images) > 0 && op.ImageAccept == "" {
					t.Errorf("%s/%s/%s: ví dụ có ảnh nhưng thao tác không nhận ảnh", s.ID, op.ID, ex.Title)
				}
				if op.Kind == KindSystemOne && (len(ex.State) == 0 || len(ex.Questions) == 0) {
					t.Errorf("%s/%s/%s: ví dụ SystemOne cần state và questions", s.ID, op.ID, ex.Title)
				}
			}
		}
	}
	if _, err := json.Marshal(All); err != nil {
		t.Fatal(err)
	}
}
