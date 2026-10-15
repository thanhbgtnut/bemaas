# Spec: Nền tảng MaaS nội bộ

Trạng thái: bản nháp để chuẩn bị code · Ngày: 11/10/2026
Prototype tham chiếu: `prototype/Model Catalog – Model Cards.html` (mã nguồn ở `prototype/src/`, đóng gói bằng `python3 prototype/src/build.py`).

**Cách đọc.** Mỗi yêu cầu có một nhãn nguồn gốc:
- **[YC]** là yêu cầu do chủ sản phẩm nêu trực tiếp.
- **[ĐX]** là phần prototype tự đề xuất để lấp chỗ trống, chưa được chủ sản phẩm xác nhận. Trước khi code phần có nhãn này cần hỏi lại.

Các con số trong prototype (đơn giá, lượt gọi, chi phí, lượt cài, lượt thích), tên người, tên phòng và câu trả lời của model đều là dữ liệu mẫu.

## 1. Tổng quan

**Sản phẩm.** Một web nội bộ để cả ngân hàng dùng chung các mô hình AI: xem danh mục model, thử model, lấy key để gọi qua API, theo dõi chi phí, và chia sẻ agent skill với nhau.

**Người dùng [YC].** Toàn bộ ngân hàng, gồm các khối nghiệp vụ và Khối CNTT. Đây không phải công cụ riêng của Trung tâm AI; nội dung, dữ liệu mẫu và vai trò không được lấy góc nhìn của đội AI làm trung tâm.

**Ba định hướng [YC]**
1. **Concept theo GreenNode MaaS** (`docs.greennode.ai/vn/ai-stack/model-as-a-service`): danh mục model, bật/tắt model, Playground, MaaS API, API key, tính phí theo mức dùng, trang Usage.
2. **Giao diện theo Hugging Face:** danh sách dạng lưới thẻ, bộ lọc dạng chip, trang chi tiết có dải tiêu đề và các tab.
3. **Màu theo MB, nhạt hơn màu logo;** chủ đạo xanh dương, xanh nhạt và trắng; phù hợp ngành ngân hàng.

**Model là dịch vụ [YC].** MaaS cung cấp **dịch vụ mô hình để gọi trực tiếp**, không phải kho weight để tải về tự host. Người dùng không tải, không triển khai, không vận hành model. Mọi dịch vụ model đều được **cung cấp qua agentgateway**. Giao diện theo Hugging Face chỉ là cách trình bày (lưới thẻ, tab, model card); không mang theo các khái niệm của kho weight như tệp model, lượt tải, cây model gốc/fine-tune, hạ tầng triển khai.

**Hạ tầng [YC].** Dùng **agentgateway** làm AI gateway: là điểm vào duy nhất để gọi model, cấp key và đo chi phí. Chi phí tính bằng **USD**.

**Công nghệ bắt buộc [YC].** Frontend, backend MaaS và mọi thành phần chạy nền (Gateway Sync, Ingester, Budget Enforcer) phải dùng đúng các công nghệ sau, không thay thế:

| Hạng mục | Công nghệ | Dùng cho |
|---|---|---|
| Frontend | **React** | Toàn bộ giao diện web (mục 4–9, 20) |
| CSS | **Tailwind CSS** | Toàn bộ style; màu và chữ ở mục 4.2 khai báo thành theme token của Tailwind |
| Đóng gói | **Fullstack một binary Go, nhúng frontend bằng `embed.FS`** | Bản build tĩnh của React được nhúng vào binary Go và phục vụ cùng cổng với API |
| Ngôn ngữ backend | **Go (golang)** | Toàn bộ backend và các thành phần chạy nền |
| Khung API | **Hertz** (CloudWeGo) | Mọi API dưới `/api/v1` (mục 12, 20.5) |
| CSDL | **PostgreSQL** | Toàn bộ mô hình dữ liệu ở mục 11 và 20.5 |
| Cache | **Redis** | Bộ nhớ đệm của backend |
| Lưu tệp | **Kho lưu trữ tương thích S3** | Gói skill, tệp đính kèm, mọi tệp khác; CSDL chỉ giữ tham chiếu (bucket, key) |
| Xác thực người dùng | **OIDC với Keycloak** | Đăng nhập web và xác thực mọi lời gọi `/api/v1` |
| Khoá và thông tin bí mật | **Đặt trong config** | Mật khẩu CSDL, Redis, access key/secret key S3, client secret Keycloak; không viết cứng trong mã, không lưu trong CSDL |

Chi tiết cách dùng [ĐX], cần xác nhận khi code:
- **Frontend và đóng gói:** mã React nằm trong thư mục `web/` của repo Go, build ra `web/dist` (ví dụ bằng Vite). Một package Go khai báo `//go:embed all:dist` để nhúng thư mục này. Hertz phục vụ `/api/v1/*` cho API, còn mọi đường dẫn khác trả tệp tĩnh từ `embed.FS`. Đường dẫn không khớp tệp nào thì trả `index.html` để React Router xử lý. Tệp có mã băm trong tên được cache lâu, riêng `index.html` không cache. Khi phát triển, chạy Vite dev server và proxy `/api` sang backend; bản phát hành chỉ có một binary và một image.
- **Đăng nhập trên frontend:** React chuyển hướng sang Keycloak, nhận token rồi gửi kèm mọi lời gọi `/api/v1`. Vì frontend và API cùng origin nên không cần cấu hình CORS.
- **Keycloak:** giao diện đăng nhập theo luồng Authorization Code + PKCE; backend kiểm tra access token (JWT) bằng JWKS của realm, kiểm `iss`, `aud`, `exp`. Định danh người dùng là claim `sub`; tên, email lấy từ claim chuẩn. Vai trò trong MaaS (mục 3) vẫn lưu ở PostgreSQL, không dùng role của Keycloak, để quản trị phòng tự thêm thành viên mà không cần quyền trên Keycloak.
- **Redis:** cache danh mục model và đơn giá, kết quả `GET /me` (vai trò, phòng), số liệu sử dụng đã tổng hợp; có thời hạn (TTL) và xoá khi dữ liệu nguồn đổi. Không lưu bí mật của key trong Redis. Có thể dùng Redis làm khoá phân tán để chỉ một bản sao chạy Budget Enforcer và Gateway Sync tại một thời điểm.
- **S3:** bucket riêng tư; tải xuống qua backend hoặc qua presigned URL có thời hạn ngắn. Endpoint, region, bucket, access key, secret key đều nằm trong config để chạy được với MinIO, Ceph hoặc dịch vụ S3 nội bộ.
- **Config [YC]:** làm như WeKnora. `config.yaml` chỉ giữ cấu trúc và chỗ giữ chỗ `${BIẾN}` hoặc `${BIẾN:-mặc định}`, được commit, không chứa giá trị thật. Giá trị nằm trong tệp `.env` (không commit; mẫu ở `.env.example`) và được nạp vào biến môi trường lúc khởi động; biến có sẵn trong môi trường (ví dụ gắn từ Secret trên Kubernetes) được ưu tiên. Gồm cả cấu hình kết nối agentgateway và tài khoản Kubernetes để sửa ConfigMap của gateway (API server, namespace, token, CA, tên ConfigMap). Giá trị bí mật không được in ra log khi khởi động (mục 15).

## 2. Bảng yêu cầu của chủ sản phẩm

| # | Yêu cầu | Mục trong spec |
|---|---|---|
| Y1 | ~~Trang dùng thử model nằm ở một tab riêng~~: thay bằng Y24 (dùng thử ở Playground) | 6 |
| Y2 | ~~Giao diện dùng thử dựng từ Gradio~~: bỏ theo Y24 | 17 |
| Y3 | Có kho skill; skill là agent skill (file markdown hoặc script) | 7 |
| Y4 | Bộ skill theo vai trò, để giữ năng lực cho tổ chức | 7.3 |
| Y5 | Tab Skills là skill hub để chia sẻ với mọi người, không phải công cụ quản trị | 7.1, 17 |
| Y6 | Màu xanh dương, xanh nhạt, trắng; giống MB nhưng nhạt hơn màu logo; hợp ngành ngân hàng | 4.2 |
| Y7 | Trải nghiệm đồng nhất giữa các phần | 4.1 |
| Y8 | Xây cho toàn ngân hàng, không riêng Trung tâm AI hay Khối CNTT | 1 |
| Y9 | Phần Models theo concept GreenNode | 5, 6, 9 |
| Y10 | Giao diện theo hướng Hugging Face | 4.3 |
| Y11 | Model OCR có nhiều chuẩn: chấp nhận endpoint tự đặt, không theo chuẩn OpenAI | 5.5 |
| Y12 | Không có mục Tài liệu | 17 |
| Y13 | Chi phí tính theo USD | 8, 9 |
| Y14 | agentgateway là AI gateway cấp key và đo chi phí | 10 |
| Y15 | Cấp key có giới hạn chi phí cho từng phòng | 8 |
| Y16 | Mỗi phòng tự tạo key cho thành viên của mình | 8 |
| Y17 | Cụ thể hoá các vai trò | 3 |
| Y18 | Bỏ khối "Dùng thử" có nút "Mở tab Dùng thử" ở cột phải model card | 17 |
| Y19 | Model là dịch vụ để gọi trực tiếp qua agentgateway, không phải weight để tải về tự host | 1, 5.3, 5.5, 17 |
| Y20 | Thêm cấu hình MCP server và tools xuống agentgateway; MaaS quản trị cấu hình và kiểm soát các tool này | 20 |
| Y21 | Công nghệ bắt buộc: React, Tailwind CSS, frontend nhúng vào binary Go bằng `embed.FS`, Go, Hertz, PostgreSQL, Redis, kho tệp tương thích S3, khoá đặt trong config, OIDC với Keycloak | 1, 11, 12, 15 |
| Y22 | Giao diện fit màn hình và responsive, không cố định theo khổ prototype | 4.1 (G6) |
| Y23 | Cấu hình qua `.env` ánh xạ vào `config.yaml` bằng `${BIẾN}` như WeKnora; cấu hình gateway và tài khoản Kubernetes cũng ở `.env` | 1 |
| Y24 | Bỏ trang dùng thử Gradio, chỉ giữ Playground; model card chuẩn hoá theo chuẩn API: OpenAI compatible, Anthropic compatible, SystemOne compatible, TurboOCR, MinerU OCR; thêm chuẩn sau | 5.4, 6 |
| Y25 | Mỗi tab của Playground có 1–2 ví dụ mẫu để thử nhanh | 6 (P10) |

## 3. Vai trò

| Vai trò | Ai | Phạm vi |
|---|---|---|
| **Quản trị nền tảng** | Nhóm vận hành nền tảng | Toàn ngân hàng |
| **Quản trị phòng** | Trưởng phòng hoặc người được uỷ quyền; một phòng có thể có nhiều người | Phòng mình |
| **Thành viên** | Nhân viên thuộc một phòng | Key của chính mình |
| **Kiểm soát** [ĐX], giai đoạn sau | Tài chính, kiểm toán nội bộ | Toàn ngân hàng, chỉ xem |

Một người có thể giữ nhiều vai trò. Danh tính lấy từ Keycloak qua OIDC; vai trò lưu trong CSDL PostgreSQL của MaaS.

### Ma trận quyền

| Thao tác | Quản trị nền tảng | Quản trị phòng | Thành viên | Kiểm soát |
|---|---|---|---|---|
| Xem danh mục model, model card; dùng Playground | Có | Có | Có | Có |
| Bật, tắt model cho toàn ngân hàng; sửa bảng giá [ĐX] | Có | Không | Không | Không |
| Xem, cài, thích, góp ý, đăng skill; đề xuất và bình chọn skill | Có | Có | Có | Có |
| Thêm, sửa, tạm dừng, gỡ MCP server; mở, đóng tool; đặt phạm vi theo phòng [ĐX] | Có | Không | Không | Không |
| Xem MCP server và tool được dùng, hướng dẫn kết nối | Tất cả | Của phòng mình | Của phòng mình | Tất cả |
| Tạo phòng, chỉ định quản trị phòng | Có | Không | Không | Không |
| Đặt, sửa ngân sách phòng | Có | Không (gửi yêu cầu) | Không | Không |
| Thêm, bớt thành viên của phòng | Có | Phòng mình | Không | Không |
| Cấp key cho thành viên hoặc ứng dụng | Mọi phòng | Phòng mình | Không | Không |
| Sửa hạn mức, model được dùng, thời hạn của key | Mọi phòng | Phòng mình | Không (gửi yêu cầu) | Không |
| Thu hồi key | Mọi key | Key của phòng mình | Key của mình | Không |
| Xem key đầy đủ (bí mật) | Không bao giờ | Một lần, chỉ với key ứng dụng do mình tạo | Một lần, khi nhận key của mình | Không bao giờ |
| Đổi key (rotate) | Không | Key ứng dụng của phòng | Key của mình | Không |
| Xem chi phí | Toàn ngân hàng | Phòng mình | Key của mình | Toàn ngân hàng |
| Xem nhật ký thao tác | Tất cả | Phòng mình | Của mình | Tất cả |

Skill hub không phân quyền theo vai trò [YC]: mọi nhân viên có quyền như nhau.

Quy tắc chung: máy chủ kiểm tra quyền ở từng API theo `(vai trò, phòng, chủ key)`. Giao diện chỉ ẩn nút cho gọn, không phải lớp bảo vệ.

## 4. Khung chung và thiết kế giao diện

### 4.1 Khung ứng dụng
- G1 [YC]. Một ứng dụng duy nhất, một header và một bộ thành phần dùng chung cho mọi phần.
- G2. Menu chính: **Models · Playground · Skills · MCP & tools · Ngân sách & key · Sử dụng & chi phí**. Không có mục Tài liệu [YC] và không có mục Ứng dụng.
- G3 [ĐX]. Header có ô tìm chung (tìm model và skill) và tên người dùng kèm vai trò. Ô đổi vai trò trong prototype chỉ để trình diễn, không có trong sản phẩm.
- G4. Mọi màn hình chính có địa chỉ riêng để chia sẻ link (danh sách, chi tiết, tab đang mở).
- G6 [YC]. Giao diện trải hết chiều ngang màn hình và co giãn theo cỡ màn (responsive), không cố định theo khổ của prototype. Màn rộng: lưới thẻ tăng số cột, bảng hiện đủ cột. Màn hẹp (từ 360px): menu gập vào nút Menu, bộ lọc gập lại, bảng chính chuyển thành thẻ hoặc cuộn ngang trong khung; trang không được cuộn ngang.
- G5. Ngôn ngữ giao diện: tiếng Việt. Giữ nguyên các thuật ngữ quen dùng: Models, Playground, Skills, API key, Compare, system prompt, token.

### 4.2 Màu và chữ [YC]

| Vai trò | Giá trị |
|---|---|
| Màu chính (nút, link, tab đang chọn) | `#2F6BEA`, nhạt hơn xanh logo MB; tương phản 4,76:1 với chữ trắng |
| Hover, nhấn | `#141ED2` (xanh logo MB) |
| Nền xanh nhạt | `#F2F6FE`, `#E3ECFD`; viền `#C5D7FB` |
| Chữ | `#0B1342`; chữ phụ `#475569`, `#64748B` |
| Nền | trắng |
| Đỏ MB `#EB2D4B` | chỉ làm điểm nhấn ở logo, không dùng cho trạng thái |
| Trạng thái | xanh lá: tốt; vàng: cảnh báo; đỏ: lỗi hoặc đã thu hồi. Luôn kèm biểu tượng và chữ |

Phông: IBM Plex Sans cho chữ, IBM Plex Mono cho mã, ID và số liệu. Phong cách tối giản, không dùng emoji làm biểu tượng.

### 4.3 Mẫu giao diện theo Hugging Face [YC]
- **Danh sách** (Models, Skills): lưới thẻ; mỗi thẻ có ô màu với chữ viết tắt, tên, mô tả một dòng, hàng số liệu và nhãn. Cột trái là bộ lọc dạng chip bấm, có số đếm. Trên lưới có ô lọc theo tên, ô sắp xếp và nút hành động chính.
- **Trang chi tiết** (model, skill): dải tiêu đề nền nhạt gồm đường dẫn quay lại, tên dạng `đội / id`, nút thích, nút chép ID, hàng nhãn, các tab và nút hành động. Bên dưới là nội dung chính và cột phải gồm các thẻ thông tin.
- **Trang quản lý số liệu** (Ngân sách & key, Sử dụng & chi phí): tiêu đề và mô tả, hàng ô thống kê, bảng.

### 4.4 Khả năng tiếp cận
Tương phản chữ đạt AA; mọi thao tác dùng được bằng bàn phím và có viền focus; trường nhập có nhãn hiển thị, lỗi hiện ngay dưới trường kèm cách sửa; thao tác không hoàn tác được phải xác nhận; tôn trọng thiết lập giảm chuyển động; biểu đồ có bảng số liệu thay thế.

## 5. Models

### 5.1 Danh mục
- M1 [YC]. Danh mục model theo concept GreenNode: lọc theo **nhà cung cấp**, **chuẩn API** (thay cho loại model, Y24), **use-case**. [ĐX] Lọc thêm theo trạng thái (Production, Beta) và mức dữ liệu (Nội bộ, Mật).
- M2. Mỗi model thuộc đúng một chuẩn API (5.4). Chưa có model tạo ảnh.
- M3. Mỗi thẻ hiện: tên `đội/id`, mô tả, chuẩn API, **đơn giá**, lượt gọi 30 ngày, lượt thích, trạng thái, mức dữ liệu, công tắc bật/tắt.
- M4 [YC]. Đơn giá bằng USD theo đơn vị của chuẩn: chuẩn tính theo token (OpenAI, Anthropic, SystemOne) tính trên 1 triệu token (input, input đã cache, output); chuẩn OCR (TurboOCR, MinerU) tính theo trang.
- M5. Sắp xếp theo dùng nhiều nhất, được thích nhiều, giá thấp nhất, tên. Tab "Tất cả" và "Đang bật".

### 5.2 Bật, tắt model
- M6 [YC]. Bật, tắt từng model bằng công tắc, hoặc mở hộp "Bật/Tắt model" để tìm, lọc theo loại và trạng thái, bật tắt hàng loạt rồi Lưu.
- M7. Model đang tắt không nhận lời gọi API và không phát sinh chi phí.
- M8 [ĐX]. Chỉ quản trị nền tảng được bật, tắt; áp dụng cho toàn ngân hàng. GreenNode cho từng tài khoản tự bật; cần xác nhận ngân hàng muốn mức nào (câu hỏi mở 9).
- M9. Model ở mức dữ liệu Mật không cần xin duyệt riêng trong prototype. Cần xác nhận (câu hỏi mở 10).

### 5.3 Model card
- M10 [YC]. Trang chi tiết có các tab: **Model card · API · Phiên bản · Thảo luận · Sử dụng**. Không còn tab Dùng thử (Y24): mọi model dùng thử ở Playground. Link cũ `/models/{id}/try` mở tab Model card.
- M11. Tab Model card: mô tả, mục đích sử dụng và hạn chế (phù hợp, không dùng cho, cảnh báo), kết quả đánh giá, **xử lý dữ liệu khi gọi** (dữ liệu gửi lên có được lưu, ghi log, dùng để huấn luyện không; mức dữ liệu được phép gửi), đầu vào và đầu ra. Không có mục dữ liệu huấn luyện hay tệp model [Y19].
- M12. Cột phải: lượt gọi 30 ngày kèm biểu đồ đường nhỏ, đơn giá, thông số (ngữ cảnh, p95, SLA), **kết nối dịch vụ** (cổng agentgateway, base URL, endpoint, model id; dịch vụ nhận đầu vào từ và dịch vụ thường gọi tiếp trong chuỗi xử lý) [Y19], **skill dùng model này**, thông tin quản trị (nhà cung cấp, người phụ trách, người phê duyệt, ngày rà soát).
- M13. Nút chính: "Bật model" khi đang tắt; khi đang bật là "Mở Playground", mở đúng tab chuẩn và thao tác của model.

### 5.4 Chuẩn API của model [YC]
- M14. Model card được chuẩn hoá theo **chuẩn API**. Mỗi model khai báo đúng một chuẩn; tab API, Playground và mã mẫu đều dựng từ danh mục chuẩn, không viết riêng cho từng model. Danh mục hiện có:

| Chuẩn | Thao tác | Endpoint mặc định trên gateway | Đầu vào | Tính giá |
|---|---|---|---|---|
| OpenAI compatible | Chat, Completion, Embedding, Rerank | `/v1` + `/chat/completions`, `/completions`, `/embeddings`, `/rerank` | JSON, model trong body; Chat có streaming | Token |
| Anthropic compatible | Messages | `/v1` + `/messages` | JSON theo Messages API, model trong body, header `anthropic-version`; có streaming | Token |
| SystemOne compatible | Ra quyết định | `/v1` + `/systemone` | Decision API (`docs.ollama.com/api/systemone`): JSON gồm `model`, `state` (chuỗi, object hoặc mảng), `questions` (1–64 câu, loại `choice`, `noul`, `score`) và `images` tuỳ chọn (base64 PNG, JPEG, WebP; cần model vision họ `clef`); trả quyết định kèm xác suất và độ tin cậy, không sinh văn bản, không streaming; body tối đa 64 KiB, có ảnh tối đa 32 MiB | Token |
| TurboOCR | OCR ảnh | `/turboocr/{model}` + `/ocr/raw` | Byte ảnh (`Content-Type: image/*`); tham số `layout`, `tables`, `formulas` trên địa chỉ | Trang |
| MinerU OCR | Phân tích tài liệu | `/mineru/{model}` + `/v1/file_parse` | Multipart, trường `files` (PDF hoặc ảnh); tham số như `tier` trên địa chỉ | Trang |

- M15. Mỗi chuẩn trong danh mục gồm: tên, mô tả, link tài liệu chuẩn, endpoint mặc định, model nằm trong body hay trong đường dẫn, đơn vị tính giá, các thao tác (đường dẫn, cách gửi: JSON, byte tệp hay multipart) và 1–2 ví dụ mẫu cho mỗi thao tác.
- M16. Model khai báo: chuẩn, các thao tác của chuẩn mà model hỗ trợ (chuẩn OpenAI chọn trong Chat, Completion, Embedding, Rerank; chuẩn một thao tác thì tự có), endpoint trên gateway (để trống thì dùng endpoint mặc định của chuẩn). Endpoint là tiền tố đường dẫn; đường dẫn của thao tác nối sau.
- M17. Thêm chuẩn mới: thêm một mục vào danh mục chuẩn (`internal/standard`). Chuẩn mới dùng lại cách gửi đã có (JSON, byte tệp, multipart) thì giao diện tự hiện, không sửa frontend; cách gửi mới thì thêm bộ hiển thị ở Playground.
- M18. Chuẩn chưa có tài liệu định dạng gắn nhãn "định dạng tạm" ở tab API và Playground. Hiện mọi chuẩn đều đã có tài liệu.
- M18a. SystemOne: ba loại câu hỏi. `choice` có 2–255 phương án (`criteria` là object khoá → mô tả), trả `choice`, `probabilities`, `confidence`. `noul` (đúng/sai, `criteria` tuỳ chọn chỉ có `false`, `true`) trả `noul` là xác suất đúng, từ 0 đến 1. `score` (`criteria` là mảng 2–10 mức từ thấp đến cao) trả `score` (trung bình chỉ số mức theo xác suất), `legend`, `probabilities`, `confidence`. `confidence` = 1 − H(p)/ln(N), đo độ tập trung của phân phối, không phải xác suất đúng. Lỗi trả `{"error": "…"}` với mã 400, 404, 413, 500.
- M18b. SystemOne nhận ảnh: `images` là mảng base64 thuần (không nhận URL hay data URL), dùng chung cho mọi câu hỏi, chỉ model có thị giác xử lý được; model chỉ đọc văn bản trả lỗi 400. Ví dụ mẫu có ảnh ghi kèm model nên dùng, Playground tự chọn model đó khi bấm ví dụ.

### 5.5 API
- M19 [YC]. Mỗi model gọi theo đúng chuẩn đã khai báo (5.4). OpenAI và Anthropic dùng được thư viện chính thức (`openai`, `anthropic`) bằng cách đổi base URL.
- M20 [YC]. Chuẩn OCR (TurboOCR, MinerU) có model trong đường dẫn, không trong body: gateway phân quyền theo route của từng model (luu-y-trien-khai.md).
- M21. Tab API hiện chuẩn (kèm mô tả và link tài liệu), base URL của agentgateway, endpoint, cách xác thực (`Authorization: Bearer <API key>`), đơn vị tính giá; mỗi thao tác của model có mã mẫu cURL, Python, Node.js dựng từ ví dụ mẫu đầu tiên và link "Thử ở Playground".

## 6. Playground

- P1 [YC]. Một Playground dùng chung để thử model trước khi tích hợp, không cần viết mã.
- P2 [YC]. Mỗi chuẩn API là một tab (OpenAI, Anthropic, SystemOne, TurboOCR, MinerU); chuẩn nhiều thao tác có tab con (OpenAI: Chat, Completion, Embedding, Rerank). Mỗi tab chỉ liệt kê model theo chuẩn đó và hỗ trợ thao tác đó. Địa chỉ trang giữ tab đang mở (`?std=&op=&model=`).
- P3. Chat (OpenAI) và Messages (Anthropic): system prompt và các tham số theo GreenNode. Anthropic chỉ có Past messages, Maximum token output, Temperature (0–1).

| Tham số | Khoảng | Mặc định |
|---|---|---|
| Past messages included | 1–20 | 10 |
| Maximum token output | 1–10000 | 800 (Completion: 2048) |
| Temperature | 0–2 | 1 |
| Top P | 0–1 | 0,7 |
| Presence Penalty | −2 đến 2 | 0 |

- P4 [YC]. **Compare:** hai khung hội thoại cạnh nhau, gửi cùng một câu tới hai model cùng chuẩn (Chat, Messages).
- P5 [YC]. Nút **`<> API`** xuất đúng model, đầu vào, system prompt và tham số đang đặt thành mã cURL, Python, Node.js theo chuẩn của model (OCR: gửi tệp đúng cách của chuẩn).
- P6. Mỗi kết quả hiện độ trễ, số token vào và ra (hoặc số trang với chuẩn OCR), chi phí ước tính bằng USD.
- P7. Embedding trả số chiều và vài giá trị đầu; Rerank trả danh sách đoạn văn đã xếp hạng kèm điểm; TurboOCR trả các dòng chữ kèm độ tin cậy và bảng nhận dạng được; MinerU trả Markdown của từng tệp; SystemOne trả quyết định của từng câu hỏi: phương án được chọn, xác suất của mọi phương án dạng thanh, điểm trên thang, độ tin cậy. Mọi chuẩn có mục xem JSON trả về.
- P8. Model đang tắt hiện thông báo và nút bật (theo quyền ở M8).
- P9. Lời gọi từ Playground dùng key của người đang đăng nhập và tính vào hạn mức của key đó. [ĐX] Cần xác nhận (câu hỏi mở 11). Bản code: vì key đầy đủ chỉ hiện một lần (K2), người dùng dán key vào Playground; key chỉ giữ trong phiên trình duyệt, trình duyệt gọi thẳng agentgateway (gateway cần cho phép CORS từ origin của MaaS, gồm header `anthropic-version` và `x-api-key`).
- P10 [YC]. Mỗi tab có 1–2 **ví dụ mẫu**; mở tab là điền sẵn ví dụ đầu tiên, bấm ví dụ khác để đổi. Ví dụ của chuẩn OCR là tệp mẫu (ảnh ủy nhiệm chi, hoá đơn có bảng, hợp đồng PDF 2 trang) đã che thông tin, phục vụ cùng giao diện.
- P10a. Tab SystemOne: nhập state, danh sách câu hỏi (tên, loại, câu hỏi, tiêu chí) và ảnh tuỳ chọn (chọn nhiều ảnh, xem trước, bỏ từng ảnh, báo dung lượng sau mã hoá so với 32 MiB). Ví dụ 1 chỉ có văn bản; ví dụ 2 gửi ảnh ủy nhiệm chi mẫu với đủ ba loại câu hỏi. Mã `<> API` có ảnh đọc tệp rồi mã hoá base64.
- P11. Chuẩn OCR nhận tệp của người dùng (chọn tệp hoặc ví dụ mẫu), xem trước ảnh, đặt tham số trên địa chỉ; trang luôn nhắc chỉ dùng dữ liệu mẫu đã che thông tin khách hàng.

## 7. Skill hub

### 7.1 Nguyên tắc [YC]
- S1. Skill là agent skill: một thư mục gồm `SKILL.md` (frontmatter `name`, `description` và phần hướng dẫn) kèm script và tài liệu tham chiếu.
- S2. Hub để **chia sẻ**: ai cũng xem, cài, tải, góp ý và đăng skill được. Không phân quyền, không phê duyệt, không phân loại mức dữ liệu cho skill.
- S3. Hub chỉ chia sẻ file. Quyền dùng model và tool mà skill cần do hệ thống của model và tool đó quyết định.
- S4. Hub chỉ đếm những gì đi qua nó: **lượt cài, lượt tải, lượt thích**. Không hiển thị "lượt kích hoạt" hay "agent đang dùng", vì hub không đo được.

### 7.2 Khám phá
- S5. Lưới thẻ skill: tên, `lĩnh vực/id`, phiên bản, mô tả, người chia sẻ và đơn vị, lượt cài, ngày cập nhật, lượt thích, loại skill, các model sử dụng.
- S6. Lọc theo lĩnh vực, loại skill (chỉ hướng dẫn, có script, gọi tool/API), model sử dụng, chất lượng. Sắp xếp theo cài nhiều nhất, được thích nhiều, mới cập nhật, tên. Tab Tất cả, Yêu thích, Tôi chia sẻ.
- S7. Lĩnh vực trong prototype trải cả nghiệp vụ và CNTT: Tín dụng, Thanh toán, Tuân thủ & rủi ro, Phát triển phần mềm, Vận hành CNTT, An toàn thông tin, Dùng chung.
- S8 [ĐX]. Nhãn "Đã kiểm chứng": đơn vị nghiệp vụ xác nhận nội dung đúng. Cần xác nhận có giữ không và ai được gắn nhãn (câu hỏi mở 12).

### 7.3 Bộ skill theo vai trò [YC]
- S9. Mỗi vai trò công việc (ví dụ cán bộ tín dụng, chuyên viên thanh toán, lập trình viên, kỹ sư vận hành) có một bộ skill gợi ý, cài cả bộ bằng một lệnh. Mục đích: người mới nhận ngay cách làm đã được đồng nghiệp đúc kết, năng lực không mất khi người chuyển việc.
- S10. Bộ skill là gợi ý, không phải phân quyền: ai cũng cài được.
- S11. Lọc theo phạm vi: toàn ngân hàng, khối nghiệp vụ, Khối CNTT.
- S12 [ĐX]. Ai là người phụ trách chọn skill vào bộ của một vai trò chưa được xác định (câu hỏi mở 13). Bản code tạm để Quản trị nền tảng thêm, sửa bộ skill.

### 7.4 Skill đang cần [ĐX]
- S13. Bảng đề xuất những việc cần skill mà chưa ai viết. Mọi người bình chọn, đề xuất thêm, hoặc bấm "Tôi sẽ viết" để nhận.
- S14. Việc chỉ vài người biết làm được gắn nhãn "Ít người nắm nghiệp vụ" để ưu tiên.

### 7.5 Chi tiết skill
- S15. Các tab: Tổng quan (khi nào agent dùng skill, các bước, đầu ra, lưu ý), Tệp (cây thư mục, xem và chép nội dung từng file), Phiên bản, Góp ý.
- S16. Hành động: thích, tải `.zip`, cài skill (chép lệnh cài).
- S17. Cột phải: lệnh cài; "Skill này cần" (model và tool); "Có trong bộ skill"; thông tin (người chia sẻ, đơn vị, cập nhật, lượt cài, kiểm chứng).
- S18. Model trong skill liên kết sang model card; model card liệt kê các skill dùng nó.

### 7.6 Chia sẻ skill
- S19. Ba bước: nguồn gói (tải `.zip` hoặc repo Git nội bộ) → thông tin (tên, ID, lĩnh vực, mô tả khi nào agent dùng, model sử dụng, gợi ý cho bộ skill nào) → kiểm tra và đăng.
- S20. Chỉ kiểm tra tự động: có `SKILL.md` hợp lệ; không chứa mật khẩu, khoá API, token; không chứa dữ liệu khách hàng. Đạt thì skill có trên hub ngay.
- S21 [ĐX]. Lệnh cài `maas skills add <lĩnh vực>/<id>` và `--set <vai trò>` là giả định; chưa có công cụ dòng lệnh thật (câu hỏi mở 14).

## 8. Ngân sách và API key

### 8.1 Mục tiêu [YC]
1. Quản trị nền tảng cấp **ngân sách tháng bằng USD** cho từng phòng.
2. Mỗi phòng **tự cấp key** cho thành viên và ứng dụng của mình; mỗi key có **hạn mức tháng bằng USD** nằm trong ngân sách phòng.
3. Key hoặc phòng dùng hết hạn mức thì lời gọi bị từ chối cho đến kỳ sau hoặc khi được cấp thêm.

### 8.2 Quy tắc ngân sách và hạn mức
- B1. Đơn vị là USD, lưu dạng số thập phân (không dùng số thực).
- B2 [ĐX]. Chu kỳ là tháng dương lịch, múi giờ `Asia/Ho_Chi_Minh`. Số đã dùng về 0 lúc 00:00 ngày 1. Ngân sách và hạn mức giữ nguyên sang tháng sau; phần chưa dùng không cộng dồn.
- B3. Tổng hạn mức các key còn hiệu lực của một phòng ≤ ngân sách phòng. Cấp key hoặc tăng hạn mức làm vượt thì từ chối, báo số còn chia được.
- B4. Không được giảm ngân sách phòng xuống dưới tổng hạn mức đã chia. Phải giảm hạn mức key trước.
- B5. Được đặt hạn mức key thấp hơn mức đã dùng trong tháng; key bị khoá ngay và giao diện phải cảnh báo trước khi lưu.
- B6 [ĐX]. Key bị khoá khi chi phí tháng của key ≥ hạn mức, hoặc chi phí tháng của phòng ≥ ngân sách phòng. Trường hợp sau khoá mọi key của phòng (câu hỏi mở 6).
- B7. Thu hồi key trả hạn mức của nó về phần còn chia được. Chi phí đã phát sinh vẫn tính cho phòng.
- B8. Sửa ngân sách hoặc hạn mức có hiệu lực ngay trong tháng hiện tại.

### 8.3 Quy tắc key
- K1. Hai loại: **key thành viên** (gắn một người) và **key ứng dụng** (gắn một hệ thống, quản trị phòng chịu trách nhiệm).
- K2 [ĐX]. Key đầy đủ chỉ hiển thị một lần. Key thành viên: hiển thị cho chính thành viên khi họ bấm "Nhận key"; quản trị phòng không thấy. Key ứng dụng: hiển thị cho người tạo ngay sau khi tạo.
- K3. Hệ thống chỉ lưu mã băm SHA-256 và 4 ký tự cuối để nhận diện.
- K4. Mỗi key có danh sách model được dùng, là tập con của các model đang bật.
- K5. Key có thời hạn (30, 90, 365 ngày hoặc không hết hạn). Hết hạn thì ngừng hoạt động như thu hồi.
- K6. Đổi key: key cũ mất hiệu lực ngay, key mới giữ nguyên hạn mức và số đã dùng trong tháng.
- K7. Thành viên rời phòng: mọi key thành viên của họ bị thu hồi.

### 8.4 Yêu cầu tăng hạn mức
- R1 [ĐX]. Thành viên gửi yêu cầu tăng hạn mức tới quản trị phòng. Quản trị phòng gửi yêu cầu tăng ngân sách tới quản trị nền tảng. Yêu cầu gồm mức đề nghị và lý do; người nhận duyệt hoặc từ chối kèm lý do.

### 8.5 Màn hình

| Màn | Vai trò | Nội dung chính |
|---|---|---|
| Danh sách phòng | Nền tảng | Ngân sách, thanh đã dùng, đã chia cho key, số key; thêm phòng; sửa ngân sách |
| Chi tiết phòng | Nền tảng, Quản trị phòng | 4 ô: ngân sách, đã dùng, đã chia, còn chia được. Tab Key và tab Thành viên. Cấp key, sửa hạn mức, thu hồi, xin thêm ngân sách |
| Hộp Cấp key | Nền tảng, Quản trị phòng | Loại key, thành viên, tên, hạn mức (hiện số còn chia được), model, thời hạn |
| Key của tôi | Thành viên | Thẻ từng key: trạng thái, thanh hạn mức, model, thời hạn. Nhận key, đổi key, xin tăng hạn mức |

Bốn trạng thái hiển thị của key: Hoạt động, Chờ nhận, Hết hạn mức, Đã thu hồi (gồm cả hết hạn).

## 9. Sử dụng & chi phí

- U1 [YC]. Chi phí bằng USD, tính theo mức dùng thực tế do gateway ghi nhận: model ngôn ngữ theo token input, input đã cache, output; model tài liệu theo số trang.
- U2. Phạm vi tự đổi theo vai trò: toàn ngân hàng, phòng mình, hoặc key của mình.
- U3. Chọn khoảng thời gian 7, 30, 90 ngày. Bốn ô: chi phí, lượt gọi, token input và output, số trang tài liệu.
- U4. Thanh ngân sách tháng của phạm vi đang xem.
- U5. Biểu đồ cột chi phí theo ngày (theo tuần khi xem 90 ngày), xem được dạng bảng.
- U6. Bảng chi tiết theo model (lượt gọi, token input, trong đó cache, token output, trang, chi phí) hoặc theo API key (cấp cho ai, phòng, lượt gọi, chi phí, hạn mức).
- U7. Không có trả trước, trả sau hay nạp quota như GreenNode; chi phí trừ vào ngân sách phòng.

## 10. Tích hợp agentgateway

### 10.1 Gateway làm được gì
Nội dung lấy từ tài liệu agentgateway bản Kubernetes (`agentgateway.dev/docs/kubernetes/latest`). Mục ghi "cần kiểm chứng" là điều tài liệu không nói rõ; phải thử trên đúng phiên bản đang chạy trước khi code phần phụ thuộc.

| Việc | agentgateway làm được gì | Hệ quả |
|---|---|---|
| Xác thực key | Policy `traffic.apiKeyAuthentication` (`mode: Strict`) đọc các ConfigMap có nhãn `agentgateway.dev/apikey: "true"`. Mỗi dòng: tên → `{"keyHash":"sha256:<hex>","metadata":{...}}`. Chỉ lưu mã băm; key thô bị từ chối. Client gửi `Authorization: Bearer <key>`. | Backend MaaS sinh key, băm, ghi ConfigMap. |
| Tạo, thu hồi, đổi, hết hạn key | Tài liệu không mô tả API hay giao diện nào. | Backend MaaS tự quản vòng đời bằng cách thêm, xoá dòng trong ConfigMap. |
| Gắn danh tính vào key | `metadata` tự do; đọc trong CEL bằng `apiKey.<trường>` (ví dụ `apiKey.user_id`). | Đặt `key_id`, `dept_id`, `owner_id` vào metadata. |
| Tính chi phí USD | Bảng giá model (`catalog.json` trong ConfigMap, gắn qua `AgentgatewayParameters.spec.modelCatalog`): USD trên 1 triệu token cho `input`, `output`, `cacheRead`…; model tính theo trang dùng `perPage`. Chi phí từng lời gọi có trong CEL `llm.cost` và access log `agw.ai.usage.cost.total`. | Không tự tính giá. Backend MaaS sinh `catalog.json` từ bảng giá của mình. |
| Ghi nhận sử dụng | Access log ra stdout dạng `key=value`, xuất OTLP qua `frontend.accessLog.otlp`. Thêm trường bằng `frontend.accessLog.attributes.add` (tên + biểu thức CEL). Metric `agentgateway_gen_ai_client_token_usage` chia theo `gen_ai_token_type`. | Lấy chi phí theo key từ access log, không từ metric (nhãn theo key làm phình Prometheus). |
| Giới hạn | Chỉ giới hạn theo **token**, qua rate limit server ngoài (`traffic.rateLimit.global`, `unit: Tokens`), cửa sổ `second`, `minute`, `hour`, `day`. Trừ sau khi có phản hồi, nên lời gọi vượt ngưỡng vẫn chạy xong. Trả `429`. | **Không có giới hạn theo USD và không có chu kỳ tháng.** Hạn mức USD theo tháng phải do backend MaaS cưỡng chế (10.3). |
| Chặn theo điều kiện | `traffic.authorization` với `matchExpressions` CEL; không khớp thì trả `403 authorization failed`. | **Cần kiểm chứng:** biểu thức có đọc được `apiKey.*` và tên model không. Quyết định cách khoá key (10.4) và cách giới hạn model theo key (K4). |
| Lưu ý vận hành | Hai `AgentgatewayPolicy` cùng nhắm một Gateway hoặc HTTPRoute thì một cái âm thầm ghi đè cái kia, dù cả hai báo `ACCEPTED`. | Gộp xác thực, rate limit, log vào **một** policy cho mỗi đích. |

**Chế độ chạy [YC]:** agentgateway chạy trên **Kubernetes**. Ngân sách USD theo từng key (`apiKey.keys[].budgets`, chu kỳ `1h`/`24h`/`30d`) và `allowedModels` chỉ có ở bản standalone, API Kubernetes không có các trường này; vì vậy hạn mức USD theo tháng do backend MaaS cưỡng chế như 10.3.

### 10.2 Luồng dữ liệu

**Hai đường tách nhau [YC].** Dịch vụ gọi thẳng vào agentgateway. Backend MaaS đứng bên cạnh gateway, không đứng trên đường gọi, và không sửa mã agentgateway: nó chỉ ghi cấu hình key xuống gateway và đọc log, metric mà gateway sinh ra cho từng lời gọi.

```
Đường gọi:      client ──Bearer key──▶ agentgateway ──▶ model
                                          ▲      │
Đường quản lý:      ghi cấu hình key ─────┘      └────▶ log / metric từng lời gọi
                          │                                   │
                     backend MaaS ◀───────────────────────────┘
```

Chi tiết đường quản lý:

```
client ──Bearer key──▶ agentgateway ──▶ model
                           │ access log (OTLP): key_id, dept_id, model, token, agw.ai.usage.cost.total
                           ▼
                    OTel Collector ──▶ Usage Ingester ──▶ usage_event / usage_month
                                                              │
                                             Budget Enforcer ◀┘ (mỗi ≤ 60 giây)
                                                    │ đổi trạng thái key
                                                    ▼
                                             Gateway Sync ──▶ ConfigMap key của gateway
```

### 10.3 Budget Enforcer
Chạy mỗi chu kỳ:
1. Cộng `cost_usd` tháng hiện tại theo key và theo phòng.
2. Key `active` có chi phí ≥ hạn mức → `blocked_key`. Phòng có chi phí ≥ ngân sách → mọi key `active` của phòng → `blocked_dept`.
3. Key đang khoá mà điều kiện không còn đúng (tăng hạn mức, sang tháng mới) → `active`.
4. Vượt 80% và 100% → gửi thông báo (mục 13), mỗi ngưỡng một lần mỗi tháng.

### 10.4 Cách khoá key trên gateway
Chọn một sau khi kiểm chứng:
- **Cách A (ưu tiên):** giữ dòng key trong ConfigMap, đặt `metadata.state`, và dùng `traffic.authorization` với điều kiện `apiKey.state == "active"`. Client nhận `403`, phân biệt được với key sai. Cần kiểm chứng authorization đọc được `apiKey.*`.
- **Cách B (chắc chắn chạy):** xoá dòng key khỏi ConfigMap. Client nhận `401` như key không tồn tại; kém rõ ràng hơn nhưng chỉ dùng cơ chế đã có trong tài liệu.

### 10.5 Độ trễ và mức vượt
Phân vai giữa gateway và MaaS:
- **Key của người dùng:** rate limit token theo ngày trên gateway, khoá `apiKey.key_id`, quy đổi từ hạn mức USD theo giá model đắt nhất mà key được dùng. Chặn ngay tại gateway.
- **Phòng:** một rate limit token theo ngày dùng chung cho mọi key của phòng, khoá `apiKey.dept_id`. **Cần kiểm chứng** một bể dùng chung theo nhóm chạy đúng; tài liệu chỉ có ví dụ theo từng user và theo tầng.
- **Hạn mức USD theo tháng dương lịch** của key và của phòng: Enforcer của MaaS (10.3), vì gateway chỉ đếm token và cửa sổ dài nhất là một ngày. Model tài liệu tính theo trang không có token nên chỉ Enforcer kiểm soát được.

Gateway trừ sau khi có phản hồi và Enforcer chạy theo chu kỳ, nên key có thể vượt hạn mức USD một khoản nhỏ trước khi bị khoá. Mục tiêu: khoá trong vòng 2 phút kể từ lời gọi làm vượt. Giới hạn token trên gateway là lưới an toàn cho khoảng trễ này, không thay cho Enforcer. Giới hạn dùng chung giữa nhiều bản sao gateway cần rate limit server ngoài và Redis (`traffic.rateLimit.global`); `rateLimit.local` đếm riêng trên từng bản sao.

### 10.6 Khi Enforcer hoặc Ingester ngừng
Key tiếp tục hoạt động theo trạng thái cuối (ưu tiên không làm gián đoạn dịch vụ). Phải có cảnh báo khi dữ liệu sử dụng chậm quá 5 phút. Khi chạy lại, Ingester nạp bù log và Enforcer xét lại toàn bộ.

### 10.7 Gateway Sync
- Một ConfigMap cho mỗi phòng, nhãn `agentgateway.dev/apikey: "true"`. Tên dòng = `api_key.id`. Giá trị:
  `{"keyHash":"sha256:…","metadata":{"key_id":"…","dept_id":"…","owner_id":"…","state":"active"}}`
- Đồng bộ theo kiểu khai báo: sinh nội dung ConfigMap từ CSDL rồi áp dụng; có tiến trình đối soát định kỳ để sửa lệch.
- Chỉ ghi key ở trạng thái được phép gọi (cách B) hoặc ghi kèm `state` (cách A). Key `pending`, `revoked`, `expired` không bao giờ có trong ConfigMap.
- Thêm vào access log các trường `key_id = apiKey.key_id`, `dept_id = apiKey.dept_id`.
- Sinh `catalog.json` từ bảng `model_price`. Model nội bộ khai báo như một lớp phủ (overlay). Model theo chuẩn OCR dùng `perPage`.
- Bật, tắt model (M6): model đang tắt phải bị gateway từ chối. Cách làm phụ thuộc cấu hình route của gateway; xác định ở bước kiểm chứng.
- Giới hạn model theo key (K4): cần kiểm chứng authorization có đọc được tên model trong lời gọi. Nếu không, tách HTTPRoute theo nhóm model và gắn policy theo route, hoặc tạm thời chỉ ghi nhận K4 ở giao diện.

## 11. Mô hình dữ liệu

```
-- Models
model             id, name, provider_team, standard(openai|anthropic|systemone|turboocr|mineru|…),
                  modes[] (thao tác của chuẩn), type (suy ra từ chuẩn, giữ cho tương thích), use_cases[],
                  status(production|beta), data_level(noi_bo|mat), deploy, endpoint (tiền tố trên gateway),
                  context_length, enabled, base_model_id?, card(markdown), governance(json)
model_price       model_id, provider_id, input, output, cache_read, per_page   (USD / 1 triệu token hoặc / trang)
model_like        model_id, user_id

-- Skill hub
skill             id, domain, name, kind(guide|script|tool), description, trigger, author_user_id, owner_unit,
                  models[], tools[], verified, latest_version, installs, created_at, updated_at
skill_version     skill_id, version, changelog, package_ref, created_at
skill_like        skill_id, user_id
skill_install     skill_id, version, user_id?, via(cli|zip|set), ts
skill_comment     id, skill_id, user_id, body, parent_id?, ts
skill_set         id, role_name, unit, scope(nghiep_vu|cntt), skill_ids[]
skill_wish        id, title, description, skill_set_id?, proposed_by, taker?, few_experts, created_at
skill_wish_vote   wish_id, user_id

-- Ngân sách và key
department        id, name, block, monthly_budget_usd, status(active|suspended), created_at
department_admin  department_id, user_id
member            department_id, user_id, joined_at, left_at
api_key           id, department_id, kind(member|app), owner_user_id?, name,
                  key_hash, last4, monthly_limit_usd, allowed_models[], expires_at?,
                  status(pending|active|blocked_key|blocked_dept|revoked|expired),
                  created_by, created_at, claimed_at?, revoked_at?, last_used_at?
usage_event       request_id (duy nhất), ts, key_id, department_id, model_id,
                  input_tokens, cache_tokens, output_tokens, pages, cost_usd
usage_month       period(YYYY-MM), key_id, department_id, model_id, requests, tokens..., cost_usd
limit_request     id, kind(key_limit|dept_budget), target_id, requested_usd, reason,
                  status(open|approved|rejected), decided_by, decided_at, decision_note
audit_log         id, ts, actor_user_id, action, target_type, target_id, before, after, reason
```

`api_key.name` là duy nhất trong một phòng. `usage_event.request_id` duy nhất để nạp lại log không bị đếm trùng. Mọi bảng nằm trong PostgreSQL. `user_id` là claim `sub` của Keycloak. Gói skill lưu ở kho tương thích S3; CSDL chỉ giữ tham chiếu (`package_ref` = bucket và object key).

## 12. API của backend MaaS

Viết bằng Go trên Hertz. Tất cả dưới `/api/v1`, xác thực bằng access token OIDC do Keycloak cấp (`Authorization: Bearer <token>`), trả JSON. Thiếu hoặc sai token trả `401`; không đủ quyền trả `403`. Lỗi nghiệp vụ trả `409` hoặc `422` kèm `code` để giao diện hiển thị đúng thông báo.

**Models và Playground**

| Phương thức và đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|
| `GET /models` · `GET /models/{id}` | Mọi người | Kèm đơn giá, trạng thái bật, lượt gọi 30 ngày, lượt thích |
| `PUT /models/enabled` | Nền tảng | Bật, tắt hàng loạt |
| `PUT/DELETE /models/{id}/like` | Mọi người | |
| `GET /standards` | Mọi người | Danh mục chuẩn API: thao tác, endpoint mặc định, đơn vị tính giá, ví dụ mẫu (5.4) |
| `GET/PUT /model-prices` | Nền tảng | `PUT` kích hoạt sinh lại `catalog.json` |

Playground gọi model qua gateway bằng key của người dùng, không qua backend MaaS.

**Skill hub**

| Phương thức và đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|
| `GET /skills` · `GET /skills/{id}` · `GET /skills/{id}/files` | Mọi người | Lọc, sắp xếp, tìm |
| `POST /skills` · `POST /skills/{id}/versions` | Mọi người; phiên bản mới chỉ người chia sẻ | Chạy kiểm tra tự động (S20) rồi đăng |
| `GET /skills/{id}/download` | Mọi người | Ghi `skill_install` |
| `PUT/DELETE /skills/{id}/like` · `GET/POST /skills/{id}/comments` | Mọi người | |
| `GET /skill-sets` · `GET /skill-sets/{id}` | Mọi người | |
| `GET/POST /skill-wishes` · `PUT/DELETE /skill-wishes/{id}/vote` · `POST /skill-wishes/{id}/take` | Mọi người | |

**Ngân sách, key, chi phí**

| Phương thức và đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|
| `GET /me` | Mọi người | Vai trò, phòng |
| `GET /departments` | Nền tảng, Kiểm soát | Kèm ngân sách, đã dùng, đã chia, số key |
| `POST /departments` · `PATCH /departments/{id}` | Nền tảng | `PATCH` ngân sách: lỗi `BUDGET_BELOW_ALLOCATED` (B4) |
| `GET /departments/{id}` | Nền tảng, Quản trị phòng đó | Chi tiết và số liệu tháng |
| `GET/POST/DELETE /departments/{id}/members` | Nền tảng, Quản trị phòng đó | Xoá thành viên kích hoạt K7 |
| `GET /departments/{id}/keys` | Nền tảng, Quản trị phòng đó | Không bao giờ trả bí mật |
| `POST /departments/{id}/keys` | Nền tảng, Quản trị phòng đó | Lỗi `LIMIT_EXCEEDS_UNALLOCATED` (B3). Key ứng dụng: trả `secret` một lần. Key thành viên: trạng thái `pending` |
| `PATCH /keys/{id}` | Nền tảng, Quản trị phòng của key | Hạn mức, model, thời hạn |
| `POST /keys/{id}/claim` | Chủ key | Sinh bí mật, trả một lần, chuyển `active` |
| `POST /keys/{id}/rotate` | Chủ key; Quản trị phòng với key ứng dụng | Trả bí mật mới một lần |
| `POST /keys/{id}/revoke` | Theo ma trận quyền | |
| `GET /me/keys` | Thành viên | Key của mình kèm số đã dùng |
| `GET /usage?from&to&group_by=model\|key\|department\|day` | Mọi người | Máy chủ tự giới hạn phạm vi theo vai trò |
| `POST /limit-requests` · `POST /limit-requests/{id}/approve\|reject` | Theo R1 | |
| `GET /audit-log` | Theo ma trận quyền | |

Định dạng key: `mk-<live|test>-<32 ký tự ngẫu nhiên an toàn>`. Băm: SHA-256 trên đúng chuỗi key, không có ký tự xuống dòng.

**API bổ sung khi code** [ĐX]

| Phương thức và đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|
| `POST /models` · `PATCH /models/{id}` | Nền tảng | Khai báo, sửa model |
| `GET/POST /models/{id}/versions` · `GET/POST /models/{id}/comments` | Mọi người; ghi phiên bản chỉ Nền tảng | Tab Phiên bản, Thảo luận (M10) |
| `GET /gateway/catalog` | Nền tảng | `catalog.json` đang sinh cho gateway |
| `POST/PUT/DELETE /skill-sets[/{id}]` · `GET /skill-sets/{id}/download` | Sửa: Nền tảng; tải: mọi người | Tải cả bộ dạng .zip, tăng lượt cài từng skill |
| `PUT /departments/{id}/admins` · `GET /users` | Nền tảng; tìm người: quản trị phòng | Gán quản trị phòng |
| `GET /roles` · `PUT /roles/{platform\|auditor}` | Nền tảng | Gán vai trò Quản trị nền tảng, Kiểm soát |
| `GET /notifications` · `POST /notifications/read` | Mọi người | Thông báo trong ứng dụng (mục 13) |
| `GET /search?q=` | Mọi người | Ô tìm chung (G3) |
| `POST /ingest/otlp/v1/logs` | agentgateway (bearer `INGEST_TOKEN`) | Ingester nhận access log OTLP |

## 13. Thông báo

| Sự kiện | Gửi tới |
|---|---|
| Key được cấp, chờ nhận | Chủ key |
| Key đạt 80% và 100% hạn mức | Chủ key, quản trị phòng |
| Phòng đạt 80% và 100% ngân sách | Quản trị phòng, quản trị nền tảng |
| Key sắp hết hạn (trước 7 ngày) | Chủ key, quản trị phòng |
| Có yêu cầu tăng hạn mức, tăng ngân sách; kết quả duyệt | Người duyệt; người gửi |
| Có góp ý mới trên skill; skill mình đề xuất có người nhận viết | Người chia sẻ; người đề xuất |

Bản code gửi thông báo trong ứng dụng (chuông trên header) cho mọi sự kiện ở bảng trên; kênh email hoặc chat nội bộ thêm sau khi chốt câu hỏi mở 7.

## 14. Nhật ký thao tác

Ghi mọi thay đổi về phòng, ngân sách, thành viên, key (cấp, nhận, sửa, đổi, thu hồi), bảng giá, bật tắt model, và mọi quyết định duyệt. Mỗi dòng có người thực hiện, thời điểm, giá trị trước và sau. Chỉ thêm, không sửa, không xoá. Thay đổi trạng thái do Enforcer thực hiện ghi người thực hiện là `system`. Skill hub không cần nhật ký quản trị; lịch sử phiên bản của skill là đủ.

## 15. Yêu cầu phi chức năng

- Bí mật của key không được ghi vào log, CSDL, Redis hay nhật ký dưới bất kỳ dạng nào ngoài mã băm.
- Thông tin bí mật của hệ thống (mật khẩu CSDL, Redis, khoá S3, client secret Keycloak) chỉ nằm trong config; không có trong mã nguồn, CSDL hay log.
- Redis ngừng thì backend vẫn chạy đúng bằng cách đọc thẳng PostgreSQL, chỉ chậm hơn; cache không phải nguồn dữ liệu gốc.
- Thu hồi hoặc khoá key có hiệu lực trên gateway trong vòng 60 giây.
- Số liệu sử dụng trên giao diện chậm tối đa 2 phút so với thực tế; giao diện hiển thị thời điểm cập nhật gần nhất.
- Gateway Sync không được làm mất key đang hoạt động khi backend MaaS gặp lỗi: áp dụng thay đổi theo từng ConfigMap, có đối soát.
- Playground không được hỏng khi model trả kết quả không đúng dạng mong đợi: luôn hiện được JSON trả về.
- Gói skill tải lên được quét trước khi đăng; không chạy script của skill trên máy chủ hub.
- Giao diện theo mục 4.4.

## 16. Tiêu chí nghiệm thu

**Models và Playground**
1. Lọc danh mục theo chuẩn API và use-case cho kết quả đúng; thẻ hiện đơn giá USD đúng đơn vị (1 triệu token hoặc trang).
2. Quản trị nền tảng tắt một model: trong 60 giây gateway từ chối lời gọi tới model đó; thành viên không bật lại được.
3. Mỗi tab chuẩn của Playground có 1–2 ví dụ mẫu; mở tab rồi bấm Gửi hoặc Chạy với ví dụ có sẵn cho ra kết quả, số token hoặc số trang, và chi phí ước tính.
4. Trong Playground, đặt system prompt và Temperature rồi bấm `<> API`: mã xuất ra chứa đúng model, system prompt và tham số đó.
5. Compare gửi một câu tới hai model và hiện hai câu trả lời kèm độ trễ, token, chi phí riêng.
6. Tab API hiện đúng chuẩn của model, endpoint và mã mẫu theo chuẩn đó; thêm một chuẩn mới dùng lại cách gửi đã có chỉ cần sửa danh mục chuẩn.

**Skill hub**
7. Bất kỳ nhân viên nào cũng đăng được skill: gói thiếu `SKILL.md` hoặc chứa khoá API bị từ chối kèm lý do; gói hợp lệ có trên hub ngay.
8. Cài hoặc tải một skill làm tăng lượt cài của skill đó đúng 1.
9. Cài một bộ skill theo vai trò lấy về đủ các skill trong bộ.
10. Đề xuất một skill, người khác bình chọn và bấm "Tôi sẽ viết": đề xuất hiện tên người nhận; khi skill được đăng thì đề xuất đóng lại.

**Ngân sách và key**
11. Quản trị nền tảng đặt ngân sách phòng 400 USD; quản trị phòng cấp các key tổng hạn mức 300 USD; cấp thêm key 150 USD bị từ chối và báo còn chia được 100 USD.
12. Giảm ngân sách phòng xuống 250 USD khi đã chia 300 USD bị từ chối.
13. Thành viên nhận key: thấy key đầy đủ đúng một lần; gọi model thành công; quản trị phòng không có cách nào xem lại key đó.
14. Key hạn mức 25 USD đã dùng 25 USD: trong 2 phút chuyển "Hết hạn mức", lời gọi tiếp theo bị từ chối, chủ key và quản trị phòng nhận thông báo.
15. Tăng hạn mức key đó lên 40 USD: trong 60 giây gọi lại được.
16. Phòng dùng hết ngân sách: mọi key của phòng bị khoá, kể cả key chưa chạm hạn mức riêng.
17. 00:00 ngày 1 theo giờ Việt Nam: số đã dùng về 0, key bị khoá do hạn mức hoạt động lại.
18. Thu hồi key: gateway từ chối trong 60 giây; hạn mức trả về phần còn chia được.
19. Thành viên chỉ xem được chi phí key của mình; quản trị phòng chỉ xem được phòng mình; gọi thẳng API ngoài phạm vi trả `403`.
20. Tổng chi phí trên trang Sử dụng & chi phí khớp tổng `agw.ai.usage.cost.total` trong log gateway cùng kỳ.

## 17. Đã loại bỏ theo quyết định của chủ sản phẩm

Những thứ sau từng có trong prototype và đã bị bỏ; không đưa lại nếu không có yêu cầu mới.

| Đã bỏ | Lý do |
|---|---|
| Mục **Tài liệu** trên menu | Chủ sản phẩm yêu cầu bỏ |
| Khối "Dùng thử" có nút "Mở tab Dùng thử" ở cột phải model card | "Không có ý nghĩa" |
| Tab **Dùng thử** và giao diện dùng thử dựng từ **Gradio** app (mục 5.4 cũ, M14–M18 cũ) | Chủ sản phẩm yêu cầu chỉ giữ Playground; model chuẩn hoá theo chuẩn API (Y24) |
| **Quản trị skill:** bảng phân quyền vai trò × skill, ngoại lệ cấp riêng và chặn riêng từng người, yêu cầu truy cập skill, nhật ký thay đổi quyền skill, phê duyệt QLRR/ATTT cho skill, mức dữ liệu của skill, trạng thái đang rà soát và bản nháp | Skills là hub chia sẻ, không phải công cụ quản trị |
| Số liệu "lượt kích hoạt", "agent đang dùng" của skill | Skill chỉ là file; hub không đo được việc agent dùng skill |
| Góc nhìn Trung tâm AI, và sau đó là góc nhìn riêng Khối CNTT | Sản phẩm phục vụ toàn ngân hàng |
| Kho tri thức và trợ lý hỏi đáp như các dịch vụ đóng gói | Không phải hướng của sản phẩm; concept theo GreenNode |
| Nút "Xin quyền truy cập" theo từng model | Theo GreenNode: bật, tắt model thay cho xin quyền |
| Trả trước, trả sau, nạp quota | Chi phí trừ vào ngân sách phòng |
| Chi phí bằng đồng | Chi phí tính theo USD |
| Danh sách dạng bảng cho Models và Skills | Giao diện theo Hugging Face: lưới thẻ |
| Mục Ứng dụng trên menu | GreenNode không có khái niệm này |
| Khối **Cây model** (base model, model phía sau), nhãn hạ tầng triển khai (On-prem GPU/CPU) trên model, mục **Dữ liệu huấn luyện**, biểu tượng tải về cho lượt gọi | Model là dịch vụ để gọi qua agentgateway, không phải weight để tải về tự host |

## 18. Câu hỏi mở

**Gateway và hạ tầng**
1. agentgateway chạy trên Kubernetes (đã xác nhận). Phiên bản nào?
2. `traffic.authorization` có đọc được `apiKey.*` và tên model không? (Chọn cách A hay B ở 10.4; cách làm K4.)
3. Đã có rate limit server và Redis cho gateway chưa? (Lưới an toàn ở 10.5.)
4. Đăng nhập dùng Keycloak (đã xác nhận). Realm và client nào? Keycloak có liên kết với AD/LDAP hoặc hệ thống nhân sự không, và có claim nào cho biết phòng của người dùng để gợi ý thành viên phòng không?
5. Model nội bộ được khai báo với gateway dưới provider nào, để định giá trong `catalog.json`?

**Ngân sách và key**
6. Khi phòng hết ngân sách, khoá cứng mọi key (B6) hay cho chạy tiếp và chỉ cảnh báo?
7. Kênh thông báo: email, chat nội bộ, hay chỉ trong ứng dụng?
8. Có cần vai trò Kiểm soát ngay từ đầu không?

**Models và Playground**
9. Bật, tắt model áp dụng cho toàn ngân hàng do quản trị nền tảng làm (M8), hay từng phòng tự bật như GreenNode?
10. Model ở mức dữ liệu Mật có cần bước duyệt trước khi một phòng được dùng không?
11. Lời gọi từ Playground tính vào key nào khi người dùng có nhiều key, và người chưa có key có được thử không?

**Skill hub**
12. Có giữ nhãn "Đã kiểm chứng" không; nếu có thì ai được gắn?
13. Ai phụ trách chọn skill vào bộ skill của từng vai trò?
14. Công cụ cài skill: dùng công cụ dòng lệnh riêng, hay chỉ tải `.zip` và sao chép thủ công?
15. Danh sách vai trò công việc và lĩnh vực chính thức của ngân hàng (prototype đang dùng danh sách mẫu).

**MCP và tools**
16. Ai được thêm MCP server và mở tool: chỉ quản trị nền tảng (T1), hay đội sở hữu server tự khai báo rồi nền tảng duyệt? Mở tool "Ghi dữ liệu" có cần ATTT hoặc QLRR duyệt không?
17. Access log của gateway có ghi tên server và tên tool cho từng lời gọi MCP không, tên trường là gì? (Nguồn cho lượt gọi theo tool, T12.)
18. Phạm vi theo phòng đã đủ chưa, hay cần mở tool tới từng key (ví dụ chỉ key ứng dụng mới được gọi tool ghi dữ liệu)?
19. Có cần giới hạn số lượt gọi tool theo key hoặc theo tool không? Gateway đếm theo từng request HTTP; giới hạn riêng từng tool cần rate limit server ngoài.
20. MCP server có tự xác thực người gọi không (ví dụ cần token của hệ thống phía sau)? Nếu có, gateway chuyển danh tính xuống server bằng cách nào.
21. Các kiểm chứng kỹ thuật ở 20.4.

**Chuẩn API**
22. ~~Tài liệu định dạng của chuẩn SystemOne~~: đã có (decision API, `docs.ollama.com/api/systemone`). Còn hỏi: SystemOne có chạy sau agentgateway được không (tài liệu ghi chỉ chạy local); model vision (`clef`, `clef-flash`) nào được triển khai.
23. Phiên bản MinerU đang chạy (API V1 của bản 4.x hay `/file_parse` cũ) và tham số cần dùng (`tier`, `ocr_mode`, `response_format`).
24. Gateway có đếm được số trang của lời gọi OCR để ghi vào access log không? Nếu không, ai cung cấp số trang (U1).

## 19. Thứ tự triển khai đề xuất

1. **Kiểm chứng gateway** (câu hỏi 1–3, 5): dựng một key thử, thêm trường log, xác nhận `agw.ai.usage.cost.total` có giá trị với model nội bộ.
2. **Khung ứng dụng và Models:** dựng khung fullstack (React + Tailwind nhúng vào Go bằng `embed.FS`, Hertz), PostgreSQL, Redis, S3, config; đăng nhập OIDC với Keycloak, vai trò, danh mục model, model card, bật tắt, bảng giá.
3. **Lõi ngân sách và key:** phòng, thành viên, key, nhật ký; Gateway Sync để cấp, nhận, thu hồi, đổi key chạy thật.
4. **Đo chi phí:** OTLP → Ingester → `usage_event`, `usage_month`; trang Sử dụng & chi phí.
5. **Budget Enforcer** và thông báo ngưỡng.
6. **Playground** theo chuẩn API (5.4), kèm ví dụ mẫu cho từng tab.
7. **Skill hub:** khám phá, chi tiết, chia sẻ, bộ skill theo vai trò; sau đó Skill đang cần.
8. Yêu cầu tăng hạn mức và ngân sách; lưới an toàn bằng giới hạn token; vai trò Kiểm soát.
9. **MCP và tools** (mục 20): làm sau bước 3 vì dùng lại key, `dept_id` và Gateway Sync. Kiểm chứng 20.4 làm cùng bước 1.

## 20. MCP server và tools

Bổ sung ngày 14/10/2026. Prototype: menu **MCP & tools** (`prototype/src/mcp.js`).

### 20.1 Mục tiêu [YC]
MaaS là nơi **quản trị cấu hình và kiểm soát** các tool của MCP server; cấu hình được **ghi xuống agentgateway**, gateway là nơi thực thi. Agent không nối thẳng tới từng MCP server mà nối một endpoint `/mcp` trên agentgateway bằng API key của MaaS.

Giống key và model, MaaS đứng bên cạnh đường gọi: ghi cấu hình, đọc log; không làm proxy cho lời gọi tool và không sửa mã agentgateway.

### 20.2 Quy tắc [ĐX]
- T1. Quản trị nền tảng khai báo MCP server: tên server trên gateway, tên hiển thị, mô tả, đội sở hữu, địa chỉ (host, cổng), giao thức (Streamable HTTP hoặc SSE).
- T2. Tên server chỉ gồm chữ thường, số, gạch ngang; duy nhất; không đổi được sau khi tạo. Gateway ghép nó vào trước tên tool: `<server>_<tool>`.
- T3. Danh sách tool lấy từ chính server (`tools/list`), không nhập tay. MaaS quét khi thêm server, theo lịch, và khi quản trị bấm "Quét lại tool".
- T4. **Mặc định đóng.** Server mới thêm chưa phòng nào dùng được; tool mới quét được ở trạng thái đóng. Chỉ tool được quản trị mở mới gọi được.
- T5. Mỗi tool có công tắc mở/đóng. Tool có thể ghi hoặc thay đổi dữ liệu (theo `readOnlyHint` server khai báo) mang nhãn "Ghi dữ liệu" và phải xác nhận khi mở.
- T6. Phạm vi sử dụng đặt theo server: mọi phòng, hoặc danh sách phòng. Áp dụng cho cả key thành viên và key ứng dụng của phòng, vì gateway nhận ra phòng qua `dept_id` trong metadata của key.
- T7. Tạm dừng server: gỡ server khỏi cấu hình gateway, giữ nguyên thiết lập trong MaaS để bật lại. Gỡ server: xoá hẳn, phải xác nhận.
- T8. Tool không được phép bị gateway **ẩn khỏi `tools/list`** và bị từ chối khi gọi thẳng. Agent chỉ thấy đúng những tool mình được dùng.
- T9. Lời gọi tool cần một API key đang hoạt động; key bị thu hồi hoặc bị khoá do hạn mức cũng không gọi được tool. Lời gọi tool không tính chi phí USD.
- T10. Quản trị phòng và thành viên chỉ xem: thấy các server và tool phòng mình được dùng, cùng hướng dẫn kết nối. Không thấy địa chỉ server phía sau và cấu hình gateway.
- T11. Mỗi server có trạng thái kết nối do MaaS kiểm tra định kỳ. Một server hỏng không làm rớt các server khác (`failureMode: FailOpen`).
- T12. Lượt gọi theo tool lấy từ log của gateway (cần kiểm chứng tên trường, câu hỏi mở 17).

### 20.3 Màn hình

| Màn | Vai trò | Nội dung chính |
|---|---|---|
| Danh sách server | Nền tảng | 4 ô: số server, tool đang mở / tổng, lượt gọi tool 30 ngày, trạng thái đồng bộ gateway. Lưới thẻ server có công tắc tạm dừng. Tab "Cấu hình gateway" |
| Danh sách server | Quản trị phòng, Thành viên | Chỉ các server phòng mình được dùng, không có công tắc |
| Chi tiết server · Tools | Mọi vai trò | Bảng tool: công tắc (chỉ Nền tảng), tên tool và tên trên gateway, mô tả, loại (Chỉ đọc / Ghi dữ liệu), lượt gọi 30 ngày. Nền tảng: "Quét lại tool", "Mở mọi tool chỉ đọc" |
| Chi tiết server · Phạm vi sử dụng | Nền tảng | Mọi phòng hoặc chọn phòng; hiện số key đang hoạt động gọi được |
| Chi tiết server · Kết nối | Mọi vai trò | Endpoint, xác thực, cấu hình mẫu cho agent/IDE, mã Python |
| Chi tiết server · Cấu hình gateway | Nền tảng | Phần target và luật cho phép của riêng server này |
| Hộp Thêm MCP server | Nền tảng | Các trường ở T1; sau khi thêm chuyển sang bảng tool để mở |

### 20.4 Ghi cấu hình xuống agentgateway
Theo tài liệu agentgateway bản Kubernetes (`documentation/mcp/`: static MCP, virtual MCP, tool access). Tên trường phải đối chiếu lại với đúng phiên bản đang chạy.

| Việc | Tài nguyên trên gateway | Ai ghi |
|---|---|---|
| Danh sách server | Một `AgentgatewayBackend` tên `maas-mcp`; mỗi server là một phần tử `spec.mcp.targets[]` (`name`, `static.host`, `static.port`, `static.protocol`). `prefixMode: Always`, `failureMode: FailOpen` | MaaS |
| Tool và phòng được phép | Một `AgentgatewayPolicy` tên `maas-mcp-tools`, `targetRefs` trỏ vào Backend trên, `backend.mcp.authorization` với `action: Allow` | MaaS |
| Đường vào `/mcp` | Một `HTTPRoute` trỏ `PathPrefix /mcp` tới Backend | Đội quản trị cụm, tạo một lần |
| Xác thực key | Policy API key sẵn có của gateway (mục 10), áp dụng cho cả route `/mcp` | Như mục 10 |

Mỗi server đang bật, có ít nhất một tool mở và ít nhất một phòng được phép sinh ra một dòng `matchExpressions`; các dòng là "hoặc" với nhau:

```
mcp.tool.target == "ho-so-tin-dung"
&& mcp.tool.name in ["tim_ho_so", "lay_ho_so", "tai_san_bao_dam"]
&& apiKey.dept_id in ["thamdinh"]
```

Server mở cho mọi phòng thì bỏ vế `apiKey.dept_id`. Không có dòng nào thì ghi một dòng `false` để từ chối tất cả.

Đồng bộ theo kiểu khai báo như Gateway Sync (10.7): sinh toàn bộ nội dung hai tài nguyên từ CSDL rồi áp dụng, có đối soát định kỳ. Vì toàn bộ luật nằm trong **một** policy cho một đích, không vướng lỗi hai policy ghi đè nhau (10.1).

**Cần kiểm chứng trên cụm:**
- `backend.mcp.authorization` có đọc được `apiKey.*` không. Tài liệu chỉ có ví dụ với `jwt.*`. Nếu không đọc được thì không giới hạn theo phòng bằng key được (phương án dự phòng: tách mỗi nhóm phòng một Backend và một route riêng).
- `mcp.tool.name` trong luật là tên gốc hay tên đã ghép tiền tố server.
- Nhiều dòng `matchExpressions` là "hoặc" (theo hướng dẫn) hay "và" (theo tài liệu API). Hai chỗ trong tài liệu nói khác nhau.
- Giá trị `protocol` cho Streamable HTTP; server ngoài cụm có cần TLS policy riêng không.
- Sửa Backend và Policy thì bao lâu gateway áp dụng, phiên MCP đang mở có nhận danh sách tool mới không.

### 20.5 Mô hình dữ liệu, API, nhật ký

```
mcp_server        id (tên trên gateway), name, description, owner_unit, host, port, protocol(streamable_http|sse),
                  enabled, scope(all|departments), health(ok|down), last_scanned_at, created_by, created_at
mcp_server_dept   server_id, department_id
mcp_tool          server_id, name, description, read_only, enabled, first_seen_at, reviewed_at?
mcp_tool_usage    period(YYYY-MM-DD), server_id, tool_name, key_id, department_id, calls, errors
```

| Phương thức và đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|
| `GET /mcp-servers` · `GET /mcp-servers/{id}` | Mọi người | Máy chủ tự lọc theo phòng; người không phải Nền tảng không nhận `host`, `port` và tool đang đóng |
| `POST /mcp-servers` | Nền tảng | Kết nối thử và quét tool; lỗi `MCP_UNREACHABLE`, `MCP_NAME_TAKEN` |
| `PATCH /mcp-servers/{id}` · `DELETE /mcp-servers/{id}` | Nền tảng | Bật/tạm dừng, mô tả, địa chỉ |
| `POST /mcp-servers/{id}/scan` | Nền tảng | Quét lại `tools/list`; tool mới ở trạng thái đóng |
| `PUT /mcp-servers/{id}/tools` | Nền tảng | Mở, đóng một hoặc nhiều tool |
| `PUT /mcp-servers/{id}/scope` | Nền tảng | Mọi phòng hoặc danh sách phòng |
| `GET /mcp-gateway-config` | Nền tảng | Nội dung Backend và Policy đang áp dụng, thời điểm đồng bộ |

Nhật ký thao tác (mục 14) ghi thêm: thêm, sửa, tạm dừng, gỡ server; mở, đóng tool; đổi phạm vi. Tool mới do lần quét phát hiện ghi người thực hiện là `system`.

### 20.6 Tiêu chí nghiệm thu
21. Thêm một MCP server: MaaS liệt kê đúng các tool của server; trước khi mở tool nào, agent nối `/mcp` không thấy tool nào của server đó.
22. Mở một tool cho Phòng Thẩm định: trong 60 giây key của phòng đó thấy tool trong `tools/list` và gọi được; key của phòng khác không thấy và gọi thẳng bị từ chối.
23. Đóng tool hoặc tạm dừng server: trong 60 giây tool biến mất khỏi `tools/list` của mọi key.
24. Server có thêm tool mới sau lần quét: tool xuất hiện trong MaaS ở trạng thái đóng, agent chưa gọi được.
25. Một MCP server ngừng chạy: tool của các server khác vẫn gọi được; MaaS hiện "Không kết nối được".
26. Nội dung ở tab "Cấu hình gateway" khớp đúng tài nguyên đang có trên cụm.
