// Package config nạp cấu hình theo cách của WeKnora: config.yaml chỉ giữ cấu trúc và chỗ giữ chỗ
// `${BIẾN}` (hoặc `${BIẾN:-mặc định}`); giá trị thật nằm trong biến môi trường, nạp từ tệp .env.
// Mọi thông tin bí mật (mật khẩu CSDL, Redis, khoá S3, token Kubernetes) chỉ nằm trong .env.
package config

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   Server   `yaml:"server"`
	Database Database `yaml:"database"`
	Redis    Redis    `yaml:"redis"`
	S3       S3       `yaml:"s3"`
	OIDC     OIDC     `yaml:"oidc"`
	Gateway  Gateway  `yaml:"gateway"`
	Ingest   Ingest   `yaml:"ingest"`
	Jobs     Jobs     `yaml:"jobs"`
	Log      Log      `yaml:"log"`
}

type Server struct {
	Addr     string `yaml:"addr"`
	Timezone string `yaml:"timezone"`
	// PlatformAdmins: email được gán Quản trị nền tảng khi đăng nhập (khởi tạo hệ thống).
	PlatformAdmins StringList `yaml:"platform_admins"`
}

type Database struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
	SSLMode  string `yaml:"sslmode"`
	MaxConns int32  `yaml:"max_conns"`
}

// DSN ghép chuỗi kết nối; mật khẩu có ký tự đặc biệt vẫn đúng vì được mã hoá URL.
func (d Database) DSN() string {
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(d.User, d.Password),
		Host:     fmt.Sprintf("%s:%d", d.Host, d.Port),
		Path:     "/" + d.Name,
		RawQuery: url.Values{"sslmode": {d.SSLMode}}.Encode(),
	}
	return u.String()
}

type Redis struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
	Prefix   string `yaml:"prefix"`
}

type S3 struct {
	Endpoint  string        `yaml:"endpoint"`
	Region    string        `yaml:"region"`
	Bucket    string        `yaml:"bucket"`
	AccessKey string        `yaml:"access_key"`
	SecretKey string        `yaml:"secret_key"`
	UseSSL    bool          `yaml:"use_ssl"`
	PathStyle bool          `yaml:"path_style"`
	URLExpiry time.Duration `yaml:"url_expiry"`
}

type OIDC struct {
	Issuer   string `yaml:"issuer"`    // URL realm của Keycloak
	ClientID string `yaml:"client_id"` // client public mà giao diện React dùng (PKCE)
	Audience string `yaml:"audience"`  // giá trị `aud` bắt buộc trong access token
}

type Gateway struct {
	BaseURL string      `yaml:"base_url"` // địa chỉ agentgateway mà client gọi model
	KeyEnv  string      `yaml:"key_env"`  // live | test, phần giữa của key mk-<env>-…
	Sync    GatewaySync `yaml:"sync"`
}

// GatewaySync: cách MaaS ghi key và bảng giá xuống agentgateway trên Kubernetes (luu-y-trien-khai.md mục 2).
type GatewaySync struct {
	Mode     string        `yaml:"mode"` // log | kubernetes
	Interval time.Duration `yaml:"interval"`
	Kube     Kube          `yaml:"kube"`
}

// Kube: tài khoản service account `maas-key-sync` dùng để sửa ConfigMap.
// Chạy trong cụm: để trống Token và CAData, dùng TokenFile và CAFile gắn sẵn vào pod.
// Chạy ngoài cụm: đặt Token (token có thời hạn) và CAData (CA của API server, base64) trong .env.
type Kube struct {
	APIServer        string `yaml:"api_server"`
	Namespace        string `yaml:"namespace"`
	Token            string `yaml:"token"`
	TokenFile        string `yaml:"token_file"`
	CAData           string `yaml:"ca_data"`
	CAFile           string `yaml:"ca_file"`
	KeyConfigMap     string `yaml:"key_configmap"`
	CatalogConfigMap string `yaml:"catalog_configmap"`
	// Tài nguyên MCP (mục 20.4): một AgentgatewayBackend và một AgentgatewayPolicy do MaaS ghi.
	AGWAPIVersion string `yaml:"agw_api_version"` // group/version của CRD agentgateway, ví dụ agentgateway.dev/v1alpha1
	MCPBackend    string `yaml:"mcp_backend"`
	MCPPolicy     string `yaml:"mcp_policy"`
}

// Ingest: Ingester nhận access log OTLP của agentgateway (mục 10.2).
// Tên thuộc tính trong log phải đối chiếu với cấu hình `frontend.accessLog.attributes` trên cụm
// (luu-y-trien-khai.md mục 3–4), nên để trong .env thay vì viết cứng.
type Ingest struct {
	Token string      `yaml:"token"` // bearer mà OTLP exporter của gateway gửi kèm
	Attrs IngestAttrs `yaml:"attrs"`
}

type IngestAttrs struct {
	RequestID    string `yaml:"request_id"`
	KeyID        string `yaml:"key_id"`
	DeptID       string `yaml:"dept_id"`
	Model        string `yaml:"model"`
	InputTokens  string `yaml:"input_tokens"`
	CacheTokens  string `yaml:"cache_tokens"`
	OutputTokens string `yaml:"output_tokens"`
	Pages        string `yaml:"pages"`
	Cost         string `yaml:"cost"`
	Status       string `yaml:"status"`
	MCPTarget    string `yaml:"mcp_target"`
	MCPTool      string `yaml:"mcp_tool"`
}

// Log: luôn ghi stdout; đặt File thì ghi thêm vào tệp, xoay bằng lumberjack.
type Log struct {
	File    string `yaml:"file"`     // để trống: chỉ ghi stdout
	MaxSize int    `yaml:"max_size"` // MB, đầy thì xoay sang tệp mới
	MaxAge  int    `yaml:"max_age"`  // số ngày giữ tệp đã xoay; 0: giữ mãi
}

type Jobs struct {
	EnforcerInterval time.Duration `yaml:"enforcer_interval"`
	MCPScanInterval  time.Duration `yaml:"mcp_scan_interval"`
}

// StringList nhận cả danh sách YAML lẫn chuỗi cách nhau bằng dấu phẩy (giá trị lấy từ .env).
type StringList []string

func (s *StringList) UnmarshalYAML(n *yaml.Node) error {
	if n.Kind == yaml.SequenceNode {
		var list []string
		if err := n.Decode(&list); err != nil {
			return err
		}
		*s = list
		return nil
	}
	*s = nil
	for _, v := range strings.Split(n.Value, ",") {
		if v = strings.TrimSpace(v); v != "" {
			*s = append(*s, v)
		}
	}
	return nil
}

// FindConfig trả đường dẫn config: tham số truyền vào, hoặc ./configs/config.yaml, ./config.yaml.
func FindConfig(path string) (string, error) {
	if path != "" {
		return path, nil
	}
	for _, p := range []string{"configs/config.yaml", "config.yaml", "/etc/bemaas/config.yaml"} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("không tìm thấy config.yaml (thử ./configs/config.yaml, ./config.yaml, /etc/bemaas/config.yaml)")
}

// Load nạp .env (nếu có) vào biến môi trường, đọc config.yaml, thay `${BIẾN}` rồi parse.
// Biến đã có sẵn trong môi trường (ví dụ gắn từ Secret trên Kubernetes) được ưu tiên hơn .env.
func Load(path, envFile string) (*Config, error) {
	if envFile != "" {
		if err := godotenv.Load(envFile); err != nil && !os.IsNotExist(err) {
			return nil, fmt.Errorf("đọc %s: %w", envFile, err)
		}
	}
	path, err := FindConfig(path)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("đọc config %s: %w", path, err)
	}
	expanded, missing := expand(string(raw))
	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := cfg.validate(); err != nil {
		if len(missing) > 0 {
			err = fmt.Errorf("%w (biến môi trường chưa đặt: %s)", err, strings.Join(missing, ", "))
		}
		return nil, err
	}
	return &cfg, nil
}

var placeholder = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}`)

// expand thay `${BIẾN}` và `${BIẾN:-mặc định}` bằng giá trị biến môi trường. Bỏ qua dòng chú thích.
// Trong config.yaml không bọc `${…}` trong dấu nháy: giá trị tự được bọc khi cần (yamlScalar).
// Biến chưa đặt và không có mặc định thì thành chuỗi rỗng, và được trả về để báo lỗi rõ hơn.
func expand(content string) (string, []string) {
	seen := map[string]bool{}
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		lines[i] = placeholder.ReplaceAllStringFunc(line, func(m string) string {
			sub := placeholder.FindStringSubmatch(m)
			if v, ok := os.LookupEnv(sub[1]); ok && v != "" {
				return yamlScalar(v)
			}
			if sub[2] != "" {
				return yamlScalar(sub[3])
			}
			seen[sub[1]] = true
			return ""
		})
	}
	missing := make([]string, 0, len(seen))
	for k := range seen {
		missing = append(missing, k)
	}
	sort.Strings(missing)
	return strings.Join(lines, "\n"), missing
}

// yamlScalar bọc giá trị trong dấu nháy khi có ký tự đặc biệt của YAML (mật khẩu có #, :, @…),
// để giá trị đọc ra đúng như trong .env.
func yamlScalar(v string) string {
	if strings.ContainsAny(v, "#:{}[],&*!|>'\"%@`") || strings.TrimSpace(v) != v {
		return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(v) + `"`
	}
	return v
}

func (c *Config) validate() error {
	var missing []string
	need := func(v, name string) {
		if v == "" {
			missing = append(missing, name)
		}
	}
	need(c.Server.Addr, "server.addr")
	need(c.Database.Host, "database.host")
	need(c.Database.Name, "database.name")
	need(c.Redis.Addr, "redis.addr")
	need(c.S3.Endpoint, "s3.endpoint")
	need(c.S3.Bucket, "s3.bucket")
	need(c.OIDC.Issuer, "oidc.issuer")
	need(c.OIDC.ClientID, "oidc.client_id")
	need(c.Ingest.Token, "ingest.token (INGEST_TOKEN)")
	if c.Gateway.Sync.Mode == "kubernetes" {
		need(c.Gateway.Sync.Kube.APIServer, "gateway.sync.kube.api_server")
		need(c.Gateway.Sync.Kube.Namespace, "gateway.sync.kube.namespace")
		if c.Gateway.Sync.Kube.Token == "" && c.Gateway.Sync.Kube.TokenFile == "" {
			missing = append(missing, "gateway.sync.kube.token hoặc token_file")
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("thiếu cấu hình: %s", strings.Join(missing, ", "))
	}
	if c.OIDC.Audience == "" {
		c.OIDC.Audience = c.OIDC.ClientID
	}
	if c.Gateway.KeyEnv != "live" && c.Gateway.KeyEnv != "test" {
		return fmt.Errorf("gateway.key_env phải là live hoặc test")
	}
	if c.Gateway.Sync.Mode != "log" && c.Gateway.Sync.Mode != "kubernetes" {
		return fmt.Errorf("gateway.sync.mode phải là log hoặc kubernetes")
	}
	if c.Gateway.Sync.Interval <= 0 || c.Jobs.EnforcerInterval <= 0 || c.Jobs.MCPScanInterval <= 0 {
		return fmt.Errorf("gateway.sync.interval, jobs.enforcer_interval và jobs.mcp_scan_interval phải lớn hơn 0")
	}
	if c.Ingest.Attrs.KeyID == "" || c.Ingest.Attrs.Model == "" {
		return fmt.Errorf("thiếu ingest.attrs.key_id hoặc ingest.attrs.model")
	}
	return nil
}
