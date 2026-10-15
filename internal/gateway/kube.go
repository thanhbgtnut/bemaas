package gateway

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"reflect"
	"strings"
	"time"

	"bemaas/internal/config"
)

// kubeWriter ghi ConfigMap bằng REST API của Kubernetes, chỉ cần quyền get/update trên đúng tên ConfigMap
// (Role `maas-key-sync` ở luu-y-trien-khai.md mục 2). ConfigMap phải được tạo sẵn; MaaS không có quyền create.
type kubeWriter struct {
	client    *http.Client
	apiServer string
	token     string // token đặt trong .env (chạy ngoài cụm)
	tokenFile string // token gắn vào pod (chạy trong cụm), đọc lại mỗi lần vì được xoay vòng
	namespace string
}

func newKubeWriter(cfg config.Kube) (*kubeWriter, error) {
	ca, err := loadCA(cfg)
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, fmt.Errorf("CA của Kubernetes không phải PEM hợp lệ")
	}
	return &kubeWriter{
		client: &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
		}},
		apiServer: strings.TrimRight(cfg.APIServer, "/"),
		token:     strings.TrimSpace(cfg.Token),
		tokenFile: cfg.TokenFile,
		namespace: cfg.Namespace,
	}, nil
}

// loadCA lấy CA từ KUBE_CA_DATA (PEM mã hoá base64, như trường certificate-authority-data của kubeconfig)
// hoặc từ tệp KUBE_CA_FILE.
func loadCA(cfg config.Kube) ([]byte, error) {
	if cfg.CAData != "" {
		ca, err := base64.StdEncoding.DecodeString(strings.TrimSpace(cfg.CAData))
		if err != nil {
			return nil, fmt.Errorf("KUBE_CA_DATA không phải base64 hợp lệ: %w", err)
		}
		return ca, nil
	}
	if cfg.CAFile == "" {
		return nil, fmt.Errorf("cần KUBE_CA_DATA hoặc KUBE_CA_FILE khi gateway.sync.mode=kubernetes")
	}
	ca, err := os.ReadFile(cfg.CAFile)
	if err != nil {
		return nil, fmt.Errorf("đọc CA của Kubernetes: %w", err)
	}
	return ca, nil
}

func (w *kubeWriter) bearer() (string, error) {
	if w.token != "" {
		return w.token, nil
	}
	b, err := os.ReadFile(w.tokenFile)
	if err != nil {
		return "", fmt.Errorf("đọc token service account: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}

type configMap struct {
	APIVersion string            `json:"apiVersion"`
	Kind       string            `json:"kind"`
	Metadata   map[string]any    `json:"metadata"`
	Data       map[string]string `json:"data"`
}

// WriteConfigMap đọc ConfigMap hiện tại rồi ghi đè `data` với resourceVersion vừa đọc (tránh ghi đè lẫn nhau).
// Không đổi thì không ghi.
func (w *kubeWriter) WriteConfigMap(ctx context.Context, name string, data map[string]string) error {
	url := fmt.Sprintf("%s/api/v1/namespaces/%s/configmaps/%s", w.apiServer, w.namespace, name)
	var cm configMap
	if err := w.do(ctx, http.MethodGet, url, nil, &cm); err != nil {
		return err
	}
	if cm.Data == nil {
		cm.Data = map[string]string{}
	}
	if reflect.DeepEqual(cm.Data, data) {
		return nil
	}
	cm.Data = data
	body, _ := json.Marshal(cm)
	return w.do(ctx, http.MethodPut, url, body, nil)
}

// WriteSpec đọc tài nguyên tạo sẵn rồi thay `spec`, giữ nguyên metadata và resourceVersion.
// Quyền cần: get, update trên đúng tên tài nguyên (luu-y-trien-khai.md mục 4a).
func (w *kubeWriter) WriteSpec(ctx context.Context, apiVersion, plural, name string, spec any) error {
	url := fmt.Sprintf("%s/apis/%s/namespaces/%s/%s/%s", w.apiServer, apiVersion, w.namespace, plural, name)
	var obj map[string]any
	if err := w.do(ctx, http.MethodGet, url, nil, &obj); err != nil {
		return err
	}
	want, _ := json.Marshal(spec)
	var wantMap any
	_ = json.Unmarshal(want, &wantMap)
	if reflect.DeepEqual(obj["spec"], wantMap) {
		return nil
	}
	obj["spec"] = wantMap
	body, _ := json.Marshal(obj)
	return w.do(ctx, http.MethodPut, url, body, nil)
}

func (w *kubeWriter) do(ctx context.Context, method, url string, body []byte, out any) error {
	token, err := w.bearer()
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := w.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("kubernetes %s %s: %d %s", method, url, resp.StatusCode, msg)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
