// Package skillpkg kiểm tra gói skill (.zip) trước khi đăng (S1, S20): có SKILL.md hợp lệ,
// không chứa mật khẩu, khoá API, token, không chứa dữ liệu khách hàng. Không chạy script nào trong gói (mục 15).
package skillpkg

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"path"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	MaxPackageBytes = 20 << 20 // 20 MiB
	maxFileBytes    = 5 << 20
	maxFiles        = 500
)

type File struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type Manifest struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

type Result struct {
	Manifest Manifest
	Files    []File
	Problems []string // rỗng nghĩa là đạt
}

// Check đọc gói zip trong bộ nhớ và trả kết quả kiểm tra.
func Check(data []byte) (*Result, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("tệp không phải .zip hợp lệ: %w", err)
	}
	if len(zr.File) > maxFiles {
		return nil, fmt.Errorf("gói có quá %d tệp", maxFiles)
	}
	res := &Result{}
	root := commonRoot(zr.File)
	var skillMD []byte
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := strings.TrimPrefix(f.Name, root)
		if strings.Contains(name, "..") || path.IsAbs(name) {
			res.Problems = append(res.Problems, "Đường dẫn không hợp lệ: "+f.Name)
			continue
		}
		if f.UncompressedSize64 > maxFileBytes {
			res.Problems = append(res.Problems, fmt.Sprintf("Tệp %s lớn hơn %d MiB", name, maxFileBytes>>20))
			continue
		}
		res.Files = append(res.Files, File{Path: name, Size: int64(f.UncompressedSize64)})
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		content, err := io.ReadAll(io.LimitReader(rc, maxFileBytes))
		rc.Close()
		if err != nil {
			return nil, err
		}
		if name == "SKILL.md" {
			skillMD = content
		}
		res.Problems = append(res.Problems, scan(name, content)...)
	}
	if skillMD == nil {
		res.Problems = append(res.Problems, "Thiếu tệp SKILL.md ở thư mục gốc của gói")
		return res, nil
	}
	m, err := parseFrontmatter(skillMD)
	if err != nil {
		res.Problems = append(res.Problems, "SKILL.md: "+err.Error())
		return res, nil
	}
	res.Manifest = *m
	return res, nil
}

// ReadFile trả nội dung một tệp trong gói (để xem ở tab Tệp, S15).
func ReadFile(data []byte, name string) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	root := commonRoot(zr.File)
	for _, f := range zr.File {
		if strings.TrimPrefix(f.Name, root) == name && !f.FileInfo().IsDir() {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(io.LimitReader(rc, maxFileBytes))
		}
	}
	return nil, fmt.Errorf("không có tệp %s", name)
}

// commonRoot: nhiều người nén cả thư mục skill nên mọi tệp nằm dưới một thư mục chung; bỏ thư mục đó.
func commonRoot(files []*zip.File) string {
	var root string
	for i, f := range files {
		first, _, found := strings.Cut(f.Name, "/")
		if !found {
			return ""
		}
		if i == 0 {
			root = first
		} else if first != root {
			return ""
		}
	}
	if root == "" {
		return ""
	}
	return root + "/"
}

func parseFrontmatter(b []byte) (*Manifest, error) {
	s := strings.TrimLeft(strings.TrimPrefix(string(b), "\uFEFF"), " \t\r\n")
	if !strings.HasPrefix(s, "---") {
		return nil, fmt.Errorf("thiếu frontmatter (khối --- ở đầu tệp)")
	}
	rest := strings.TrimPrefix(s, "---")
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return nil, fmt.Errorf("frontmatter chưa đóng bằng ---")
	}
	var m Manifest
	if err := yaml.Unmarshal([]byte(rest[:end]), &m); err != nil {
		return nil, fmt.Errorf("frontmatter không phải YAML hợp lệ: %w", err)
	}
	if strings.TrimSpace(m.Name) == "" || strings.TrimSpace(m.Description) == "" {
		return nil, fmt.Errorf("frontmatter cần có name và description")
	}
	return &m, nil
}

var secretPatterns = []struct {
	label string
	re    *regexp.Regexp
}{
	{"khoá riêng (private key)", regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`)},
	{"AWS access key", regexp.MustCompile(`\b(AKIA|ASIA)[0-9A-Z]{16}\b`)},
	{"API key MaaS", regexp.MustCompile(`\bmk-(live|test)-[A-Za-z0-9]{32}\b`)},
	{"token dạng sk-/ghp_/xox", regexp.MustCompile(`\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})\b`)},
	{"JWT", regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`)},
	{"mật khẩu hoặc khoá gán trực tiếp", regexp.MustCompile(`(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*["']?[^\s"'<>{}$]{6,}`)},
}

// Dữ liệu khách hàng: số thẻ (qua kiểm tra Luhn) và số CCCD 12 chữ số. Đây là heuristic, có thể báo nhầm.
var (
	cardRe = regexp.MustCompile(`\b(?:\d[ -]?){15,18}\d\b`)
	cccdRe = regexp.MustCompile(`\b0\d{11}\b`)
)

func scan(name string, content []byte) []string {
	if !isText(content) {
		return nil
	}
	var problems []string
	s := string(content)
	for _, p := range secretPatterns {
		if p.re.MatchString(s) {
			problems = append(problems, fmt.Sprintf("%s: có thể chứa %s", name, p.label))
		}
	}
	for _, m := range cardRe.FindAllString(s, -1) {
		if luhn(m) {
			problems = append(problems, name+": có thể chứa số thẻ")
			break
		}
	}
	if cccdRe.MatchString(s) {
		problems = append(problems, name+": có thể chứa số CCCD")
	}
	return problems
}

func isText(b []byte) bool {
	if len(b) > 8000 {
		b = b[:8000]
	}
	return !bytes.ContainsRune(b, 0)
}

func luhn(s string) bool {
	var digits []int
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits = append(digits, int(r-'0'))
		}
	}
	if len(digits) < 16 || len(digits) > 19 {
		return false
	}
	sum := 0
	for i := len(digits) - 1; i >= 0; i-- {
		d := digits[i]
		if (len(digits)-1-i)%2 == 1 {
			if d *= 2; d > 9 {
				d -= 9
			}
		}
		sum += d
	}
	return sum%10 == 0
}

// Walk duyệt từng tệp trong gói (đã bỏ thư mục gốc chung), bỏ qua đường dẫn không an toàn.
func Walk(data []byte, fn func(name string, r io.Reader) error) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	root := commonRoot(zr.File)
	for _, f := range zr.File {
		name := strings.TrimPrefix(f.Name, root)
		if f.FileInfo().IsDir() || strings.Contains(name, "..") || path.IsAbs(name) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		err = fn(name, io.LimitReader(rc, maxFileBytes))
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
