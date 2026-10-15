# bemaas

Nền tảng MaaS nội bộ theo [docs/spec-maas.md](docs/spec-maas.md). Một binary Go chứa:

- API `/api/v1` viết bằng **Hertz**, xác thực bằng access token **Keycloak (OIDC)**;
- giao diện **React + Tailwind CSS** đã build, nhúng vào binary bằng `embed.FS` (`web/embed.go`);
- **Gateway Sync** (ghi key và bảng giá xuống ConfigMap của agentgateway) và **Budget Enforcer** chạy nền.

Dữ liệu ở **PostgreSQL**, cache ở **Redis**, gói skill ở kho **tương thích S3**. Mọi khoá và mật khẩu nằm trong config.

## Chạy local

Cần Go 1.26, Node 22, Docker.

```sh
cp .env.example .env # sửa giá trị nếu cần; make tự tạo nếu chưa có
make infra-up        # PostgreSQL :5432, Redis :6380, S3 (SeaweedFS) :9000, Keycloak :8180
make seed            # migration + danh mục model, bảng giá, phòng mẫu
make build           # build giao diện vào web/dist rồi build bin/bemaas
./bin/bemaas         # đọc ./config.yaml và ./.env; giữ terminal này mở
make devmock         # terminal khác: gateway và MCP server giả để chạy thử trọn vòng
```

Lúc khởi động, server chờ tối đa 60 giây cho PostgreSQL, S3 và Keycloak sẵn sàng, nên chạy ngay sau `make infra-up` cũng được.

Mở http://localhost:8080 và đăng nhập bằng một trong các tài khoản mẫu (realm `maas`, xem `deploy/keycloak/realm-maas.json`):

| Tài khoản | Mật khẩu | Vai trò sau khi chạy `make seed-demo` |
|---|---|---|
| `admin` | `admin123` | Quản trị nền tảng (do `server.platform_admins` trong config) |
| `truongphong` | `truongphong123` | Quản trị Phòng Phát triển Kênh số |
| `nhanvien` | `nhanvien123` | Thành viên, có một key chờ nhận |

Vai trò lưu trong PostgreSQL, không lấy từ Keycloak. Người dùng chỉ có trong CSDL sau lần đăng nhập đầu, nên đăng nhập cả ba tài khoản một lần rồi mới chạy `make seed-demo` (gán phòng, tạo key, sinh 30 ngày dữ liệu sử dụng).

Khi sửa giao diện: chạy `make run` (backend :8080) và `make dev-web` (Vite :5173, proxy `/api` sang :8080), mở http://localhost:5173.

## Cấu trúc

```
cmd/bemaas/            main: nạp config, migration, chạy server và job nền
internal/config/       nạp .env, thay ${BIẾN} trong config.yaml, kiểm tra giá trị bắt buộc
internal/db/           kết nối pgx, migration nhúng (migrations/*.sql = mục 11, 20.5 của spec)
internal/cache/        Redis: cache có TTL, khoá phân tán cho job; Redis lỗi thì đọc thẳng CSDL
internal/storage/      S3 (minio-go): lưu gói skill, URL tải có thời hạn
internal/auth/         kiểm access token Keycloak (JWKS, iss, aud, exp), nạp vai trò MaaS
internal/api/          handler Hertz cho mục 12 của spec
internal/apikey/       sinh key mk-<live|test>-<32 ký tự>, băm sha256
internal/skillpkg/     kiểm tra gói skill: SKILL.md, mật khẩu/khoá/token, số thẻ, CCCD
internal/gateway/      Gateway Sync: mode `log` (local) hoặc `kubernetes` (ghi ConfigMap)
internal/jobs/         Budget Enforcer (mục 10.3), thông báo ngưỡng và key sắp hết hạn
internal/ingest/       Ingester: access log OTLP → usage_event, usage_month, mcp_tool_usage
internal/mcp/          client MCP (quét tools/list) và job quét định kỳ
internal/notify/       thông báo trong ứng dụng (mục 13)
internal/standard/     danh mục chuẩn API của model (OpenAI, Anthropic, SystemOne, TurboOCR, MinerU)
cmd/devmock/           CHỈ LOCAL: agentgateway và MCP server giả
internal/audit/        nhật ký thao tác, chỉ thêm (trigger chặn UPDATE/DELETE)
web/                   React + Tailwind (Vite); build ra web/dist rồi nhúng vào binary
deploy/                docker compose local, realm Keycloak, dữ liệu mẫu
```

## Config: `.env` ánh xạ vào `config.yaml`

Làm như WeKnora:
- `config.yaml` được commit, chỉ chứa cấu trúc và chỗ giữ chỗ `${BIẾN}` hoặc `${BIẾN:-mặc định}`. Không bọc `${…}` trong dấu nháy; giá trị có ký tự đặc biệt (`:`, `#`, `@`…) được tự bọc khi nạp.
- `.env` (không commit, mẫu ở `.env.example`) chứa giá trị thật, được nạp vào biến môi trường lúc khởi động. Biến có sẵn trong môi trường được ưu tiên hơn `.env`, nên trên Kubernetes chỉ cần gắn biến từ ConfigMap/Secret.
- `docker compose` ở `deploy/` đọc chung `.env` (`make infra-up` truyền `--env-file`), nên mật khẩu PostgreSQL, khoá S3, tài khoản Keycloak local chỉ khai báo một lần.
- Thiếu biến bắt buộc thì server dừng và báo đúng tên biến chưa đặt.

Các nhóm biến trong `.env.example`: server, PostgreSQL, Redis, S3, Keycloak, agentgateway (`GATEWAY_*`) và tài khoản Kubernetes để sửa ConfigMap của gateway (`KUBE_*`):
- MaaS chạy ngoài cụm: đặt `KUBE_API_SERVER`, `KUBE_NAMESPACE`, `KUBE_TOKEN` (token có thời hạn: `kubectl -n <ns> create token maas-key-sync --duration=720h`) và `KUBE_CA_DATA` (trường `certificate-authority-data` trong kubeconfig).
- MaaS chạy trong cụm bằng service account `maas-key-sync`: để trống `KUBE_TOKEN`, `KUBE_CA_DATA`; dùng `KUBE_TOKEN_FILE`, `KUBE_CA_FILE` gắn sẵn vào pod.
- `GATEWAY_SYNC_MODE=log` chỉ ghi log, không đụng cụm; đổi sang `kubernetes` để ghi ConfigMap thật.

Image phát hành: `make image` (distroless, một binary, đã kèm `config.yaml`). Truyền giá trị bằng biến môi trường hoặc gắn tệp `.env` rồi chạy với `-env /đường/dẫn/.env`.

## Giao diện co giãn theo màn hình

Nội dung trải hết chiều ngang (lề `page-x` trong `web/src/index.css`), lưới thẻ tăng số cột theo cỡ màn (1 cột ở điện thoại, tới 3–4 cột ở màn 2K). Dưới `lg` menu gập vào nút Menu; dưới `lg` bộ lọc Models gập lại; bảng phòng và bảng key chuyển thành thẻ trên màn hẹp, các bảng khác cuộn ngang trong khung (`DataTable`). Đã kiểm tra mọi trang chính ở 360, 390, 768, 1024, 1366, 1920, 2560px: không trang nào cuộn ngang.

## Chạy thử trọn vòng ở local: `make devmock`

`cmd/devmock` CHỈ DÙNG Ở LOCAL, giả lập các hệ thống bên ngoài:

| Cổng | Giả lập | Làm gì |
|---|---|---|
| 8090 | agentgateway | Xác thực API key bằng mã băm trong CSDL (như gateway đọc ConfigMap), chặn model đang tắt hoặc không có trong key, trả lời theo từng chuẩn API: OpenAI (`/v1/chat/completions` có streaming, `/v1/completions`, `/v1/embeddings`, `/v1/rerank`), Anthropic (`/v1/messages` có streaming), SystemOne decision API (`/v1/systemone`: choice, noul, score; lỗi 400, 413 như tài liệu), TurboOCR (`/turboocr/{model}/ocr/raw`), MinerU (`/mineru/{model}/v1/file_parse`, đếm trang PDF), rồi gửi access log OTLP về Ingester |
| 8092 | MCP server | Streamable HTTP ở `/mcp`, 3 tool chỉ đọc, 1 tool ghi, 1 tool không khai báo `readOnlyHint` |

```sh
make devmock     # chạy song song với ./bin/bemaas
```

Thử: cấp một key (Ngân sách & key → chi tiết phòng → Cấp key), dán vào Playground và gửi câu hỏi; vài giây sau số liệu xuất hiện ở Sử dụng & chi phí. Mỗi tab chuẩn của Playground có sẵn 1–2 ví dụ (tệp mẫu OCR ở `web/public/examples/`): mở tab, bấm Gửi hoặc Chạy. Thêm MCP server `localhost:8092` ở MCP & tools.

## Trạng thái so với spec

Đã làm (đã chạy thử ở local với Keycloak, PostgreSQL, Redis, S3 thật và gateway giả):
- **Models** (mục 5): danh mục lọc theo chuẩn API, nhà cung cấp, use-case, trạng thái, mức dữ liệu; sắp xếp; bật tắt từng model và hàng loạt; thêm, sửa model và đơn giá; model card có tab Model card, API, Phiên bản, Thảo luận, Sử dụng.
- **Chuẩn API** (5.4): mỗi model khai báo một chuẩn trong `internal/standard` (`GET /api/v1/standards`); tab API và mã mẫu dựng theo chuẩn. Thêm chuẩn: thêm một mục vào `standard.All`.
- **Playground** (mục 6): một tab mỗi chuẩn, mỗi tab 1–2 ví dụ mẫu; OpenAI (Chat streaming và Compare, Completion, Embedding, Rerank), Anthropic Messages (streaming, Compare), SystemOne decision API (form state, câu hỏi choice, noul, score và ảnh kèm cho model vision; hiện quyết định, xác suất, độ tin cậy), TurboOCR (gửi ảnh, hiện dòng chữ và bảng), MinerU (gửi PDF hoặc ảnh, hiện Markdown); độ trễ, token hoặc số trang, chi phí ước tính; `<> API` xuất cURL, Python, Node.js theo chuẩn.
- **Skill hub** (mục 7): khám phá, chi tiết, tệp, phiên bản (tác giả đăng phiên bản mới), góp ý, chia sẻ có kiểm tra tự động; bộ skill theo vai trò (tải cả bộ), skill đang cần (bình chọn, nhận viết, đóng khi skill được đăng).
- **Ngân sách và key** (mục 8): B3–B8, K2–K7, R1; gán quản trị phòng; vai trò Nền tảng và Kiểm soát; nhật ký thao tác có giá trị trước và sau.
- **Sử dụng & chi phí** (mục 9): thanh ngân sách của phạm vi, biểu đồ theo ngày (theo tuần khi xem 90 ngày) có dạng bảng, bảng theo model, key (kèm người được cấp, phòng, hạn mức), phòng.
- **Ingester** (10.2): nhận access log OTLP, chống đếm trùng theo `request_id`, cộng `usage_month`, ghi lượt gọi tool MCP.
- **Budget Enforcer** (10.3), **Gateway Sync** (10.7, cả key, `catalog.json` và cấu hình MCP).
- **MCP & tools** (mục 20): khai báo server (Streamable HTTP, SSE), quét `tools/list`, tool mới đóng, mở tool ghi phải xác nhận, phạm vi theo phòng, tạm dừng, gỡ; sinh `AgentgatewayBackend` và `AgentgatewayPolicy`; quét định kỳ và trạng thái kết nối.
- **Thông báo trong ứng dụng** (mục 13): chuông trên header cho mọi sự kiện ở bảng 13.
- **Ô tìm chung** (G3), giao diện co giãn 360–2560px (G6).

Tiêu chí nghiệm thu đã chạy thử: 7–19 (mục 16). Tiêu chí 17 thử bằng cách xoá số đã dùng thay vì chờ sang tháng.

Chưa làm hoặc chưa kiểm chứng được ở local:
- Các điểm phụ thuộc cụm agentgateway thật: định dạng `catalog.json`, ConfigMap key, tên trường của Backend/Policy MCP, tên thuộc tính access log, luật CEL đọc `apiKey.*` (luu-y-trien-khai.md mục 4, 4a). Tiêu chí 2, 20–26 cần cụm thật.
- Kênh gửi thông báo ngoài ứng dụng (email, chat nội bộ): chưa chốt (câu hỏi mở 7).
- Công cụ dòng lệnh `maas skills add` (câu hỏi mở 14): hiện tải `.zip`.
