package skillpkg

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func makeZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(body))
	}
	zw.Close()
	return buf.Bytes()
}

const goodSkill = "---\nname: tom-tat-ho-so\ndescription: Tóm tắt hồ sơ tín dụng\n---\n# Hướng dẫn\n"

func TestCheckOK(t *testing.T) {
	res, err := Check(makeZip(t, map[string]string{
		"tom-tat/SKILL.md":         goodSkill,
		"tom-tat/scripts/run.py":   "print('hello')\n",
		"tom-tat/reference/doc.md": "Tài liệu tham chiếu\n",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Problems) > 0 {
		t.Fatalf("không mong có lỗi: %v", res.Problems)
	}
	if res.Manifest.Name != "tom-tat-ho-so" || len(res.Files) != 3 {
		t.Fatalf("kết quả sai: %+v", res)
	}
	b, err := ReadFile(makeZip(t, map[string]string{"x/SKILL.md": goodSkill}), "SKILL.md")
	if err != nil || !strings.Contains(string(b), "tom-tat-ho-so") {
		t.Fatalf("ReadFile: %v", err)
	}
}

func TestCheckProblems(t *testing.T) {
	cases := map[string]map[string]string{
		"Thiếu tệp SKILL.md": {"README.md": "x"},
		"frontmatter":        {"SKILL.md": "# không có frontmatter"},
		"mật khẩu":           {"SKILL.md": goodSkill, "cfg.env": "password = Sup3rSecret!"},
		"API key MaaS":       {"SKILL.md": goodSkill + "mk-live-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345\n"},
		"số thẻ":             {"SKILL.md": goodSkill + "Thẻ 4111 1111 1111 1111\n"},
		"CCCD":               {"SKILL.md": goodSkill + "CCCD 001203004567\n"},
	}
	for want, files := range cases {
		res, err := Check(makeZip(t, files))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(strings.Join(res.Problems, "|"), want) {
			t.Errorf("%s: không phát hiện, problems=%v", want, res.Problems)
		}
	}
}
