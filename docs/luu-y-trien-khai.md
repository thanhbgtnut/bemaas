# Lưu ý khi triển khai MaaS với agentgateway

Ngày ghi: 12/10/2026 · Thiết kế chi tiết: mục 10 của [spec-maas.md](spec-maas.md)

Ghi chú này gom những việc phải làm và phải kiểm chứng khi nối MaaS với agentgateway. Các mục "chưa kiểm chứng" lấy từ tài liệu agentgateway, chưa thử trên cụm thật.

## 1. Nguyên tắc đã chốt

- Model là **dịch vụ để gọi trực tiếp**, không phải weight để tải về tự host.
- Lời gọi đi thẳng `client → agentgateway → model`. MaaS **không đứng trên đường gọi** và **không sửa mã agentgateway**.
- agentgateway chạy trên **Kubernetes**. Bản này không có ngân sách USD theo key (chỉ bản standalone có), nên hạn mức USD theo tháng do MaaS cưỡng chế.
- MaaS quản lý key bằng cách ghi mã băm của key vào ConfigMap của gateway; database của MaaS là nguồn gốc, ConfigMap chỉ là bản sao.
- Số lượt gọi và chi phí lấy từ access log của gateway.

## 2. Việc phải xin đội quản trị cụm

- [ ] Tạo service account `maas-key-sync` trong namespace đặt policy của gateway.
- [ ] Tạo sẵn ConfigMap chứa key, có nhãn `agentgateway.dev/apikey: "true"`. Dùng **một ConfigMap chung** cho mọi key (tối đa 1 MiB, khoảng vài nghìn key); vượt thì tạo sẵn thêm vài cái đánh số.
- [ ] Cấp Role chỉ gồm `get`, `update`, `patch` trên đúng tên các ConfigMap đó. Không cấp `create`, `delete`, `list`; không cấp quyền trên Secret. Quyền trên policy chỉ có một ngoại lệ nêu tên ở mục 4a (MCP).
- [ ] Thống nhất cách MaaS dùng service account:
  - MaaS chạy cùng cụm: chạy pod bằng service account đó.
  - MaaS chạy ngoài cụm: cấp token có thời hạn, mở đường mạng tới API server, và có quy trình gia hạn token.
- [ ] Hỏi: ConfigMap key có đặt được ở namespace riêng, tách khỏi namespace của gateway không. Nếu được thì tách.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: maas-key-sync
  namespace: agentgateway-system
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["maas-keys"]
  verbs: ["get", "update", "patch"]
```

Lập luận để trình ATTT: với quyền này MaaS chỉ sửa được nội dung các ConfigMap đã nêu tên, không đọc hay sửa được bất kỳ thứ gì khác trên cụm.

## 3. Cấu hình gateway phải có

- [ ] Xác thực key: `traffic.apiKeyAuthentication`, `mode: Strict`, chọn ConfigMap theo nhãn.
- [ ] Mỗi key một dòng: `{"keyHash":"sha256:<hex>","metadata":{"key_id":…,"owner_id":…,"dept_id":…,"kind":"user|app"}}`.
- [ ] Metadata **chỉ chứa mã định danh**, không ghi họ tên hay email. Key ứng dụng ghi mã ứng dụng thay cho `owner_id`.
- [ ] Access log xuất OTLP, thêm các trường `apiKey.key_id`, `apiKey.owner_id`, `apiKey.dept_id` (`frontend.accessLog.attributes.add`).
- [ ] Đích OTLP/HTTP của access log là Ingester của MaaS: `POST http://<bemaas>:8080/ingest/otlp/v1/logs`, header `Authorization: Bearer <INGEST_TOKEN>` (protobuf hoặc JSON, có thể gzip). Tên thuộc tính trong log phải khớp các biến `INGEST_ATTR_*` trong `.env` của MaaS; mặc định: `request.id`, `apiKey.key_id`, `apiKey.dept_id`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.cache_read_input_tokens`, `gen_ai.usage.output_tokens`, `agw.ai.usage.pages`, `agw.ai.usage.cost.total`, `http.status`, `mcp.target`, `mcp.tool.name`. Log không có `agw.ai.usage.cost.total` thì MaaS tự tính theo bảng giá của mình.
- [ ] CORS trên gateway cho origin của MaaS (ví dụ `https://maas.mbai.local`), cho phép header `Authorization`, `Content-Type`, `anthropic-version`, `x-api-key`: Playground trên trình duyệt gọi thẳng gateway bằng key của người dùng.
- [ ] Bảng giá model (`catalog.json`) do MaaS sinh từ bảng giá của mình, để log có chi phí USD.
- [ ] Rate limit làm lưới an toàn:
  - theo key: token theo ngày, khoá `apiKey.key_id`;
  - theo phòng: token theo ngày dùng chung, khoá `apiKey.dept_id`;
  - theo request (đơn vị `requests`) cho model theo chuẩn OCR, vì loại này không có token.
- [ ] Rate limit dùng chung giữa nhiều bản sao gateway cần **rate limit server + Redis**. Không có thì mỗi bản sao đếm riêng và giới hạn thực tế bị nhân lên.
- [ ] Gộp xác thực, rate limit và log vào **một** `AgentgatewayPolicy` cho mỗi đích. Hai policy cùng đích sẽ âm thầm ghi đè nhau dù đều báo `ACCEPTED`.

## 3a. Route theo chuẩn API của model (bổ sung 14/10/2026)

Mỗi model khai báo một chuẩn API (spec 5.4); MaaS không làm proxy, nên gateway phải có route cho từng chuẩn:

- [ ] **OpenAI compatible:** `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/rerank`; model nằm trong body.
- [ ] **Anthropic compatible:** `/v1/messages`; model nằm trong body. Thư viện `anthropic` gửi key ở `x-api-key` khi khởi tạo bằng `api_key`, ở `Authorization: Bearer` khi dùng `auth_token`: xác thực key của gateway phải nhận được ít nhất cách mã mẫu đang dùng (`auth_token`), nên nhận cả hai.
- [ ] **TurboOCR:** `/turboocr/{model}/…` chuyển tới server TurboOCR của model (bỏ tiền tố, giữ `/ocr/raw` và query). Body là byte ảnh, có thể tới vài chục MB: nâng giới hạn body của route.
- [ ] **MinerU OCR:** `/mineru/{model}/…` chuyển tới `mineru-api` của model (giữ `/v1/file_parse`). MinerU không tự xác thực: chỉ cho truy cập qua gateway. Yêu cầu đồng bộ có thể chạy tới 300 giây: nâng timeout của route.
- [ ] **SystemOne compatible:** `POST /v1/systemone` (decision API của Ollama, từ v0.35.0); model nằm trong body. Tài liệu ghi API chỉ chạy local, chưa có bản cloud: gateway trỏ tới Ollama nội bộ. Không streaming. Body tối đa 64 KiB; có `images` (ảnh base64, model vision `clef`) thì tối đa 32 MiB: nâng giới hạn body của route này lên ít nhất 32 MiB. Lỗi dạng `{"error": "…"}`. Access log cần ghi `usage.input_tokens`, `usage.output_tokens` của phản hồi để tính chi phí.
- [ ] Chuẩn có model trong đường dẫn (TurboOCR, MinerU): bật, tắt model (M7) và giới hạn model theo key (K4) làm theo route của từng model, không đọc từ body.
- [ ] Số trang của lời gọi OCR phải có trong access log (`agw.ai.usage.pages`) thì MaaS mới tính được chi phí. Gateway không tự biết số trang: cần backend OCR trả header số trang để gateway ghi vào log, hoặc phương án khác (câu hỏi mở 24).

## 4. Phải kiểm chứng trên cụm trước khi code

- [ ] Access log có trường `agw.ai.usage.cost.total` với model nội bộ. Đây là nguồn cho toàn bộ phần USD.
- [ ] Access log có đủ `key_id`, `owner_id`, `dept_id` cho từng lời gọi.
- [ ] Sửa ConfigMap thì bao lâu gateway áp dụng (mục tiêu ≤ 60 giây), và không cần khởi động lại.
- [ ] Thu hồi key bằng cách xoá dòng, đổi key bằng cách thay `keyHash`: có chạy đúng không. Tài liệu không mô tả.
- [ ] Một bể token dùng chung cho cả phòng với khoá `apiKey.dept_id` có chạy đúng không. Tài liệu chỉ có ví dụ theo từng user.
- [ ] Policy chặn (`traffic.authorization`) có đọc được `apiKey.*` và tên model không. Quyết định cách khoá key (trả 403 hay 401) và cách giới hạn model theo key.
- [ ] Phiên bản agentgateway đang chạy; đối chiếu tên trường trong tài liệu API của đúng phiên bản đó.

## 4a. MCP server và tools (bổ sung 14/10/2026)

Thiết kế: mục 20 của spec. MaaS ghi danh sách MCP server và luật cho phép tool xuống gateway; agent nối `/mcp` trên gateway bằng API key.

Việc xin đội quản trị cụm:
- [ ] Tạo sẵn `AgentgatewayBackend` `maas-mcp` (danh sách target rỗng) và `AgentgatewayPolicy` `maas-mcp-tools` trỏ vào Backend đó.
- [ ] Tạo `HTTPRoute` trỏ `PathPrefix /mcp` tới Backend `maas-mcp`. MaaS không sửa route này.
- [ ] Mở rộng Role của MaaS: chỉ `get`, `update`, `patch` trên đúng hai tài nguyên trên. Không cấp `create`, `delete`, `list`.
- [ ] Mở đường mạng từ gateway tới từng MCP server; từ MaaS tới MCP server để quét `tools/list` và kiểm tra kết nối.

```yaml
- apiGroups: ["agentgateway.dev"]
  resources: ["agentgatewaybackends"]
  resourceNames: ["maas-mcp"]
  verbs: ["get", "update", "patch"]
- apiGroups: ["agentgateway.dev"]
  resources: ["agentgatewaypolicies"]
  resourceNames: ["maas-mcp-tools"]
  verbs: ["get", "update", "patch"]
```

Kiểm chứng trên cụm trước khi code:
- [ ] `backend.mcp.authorization` đọc được `apiKey.dept_id`. Tài liệu chỉ có ví dụ với `jwt.*`. Đây là điều kiện để giới hạn tool theo phòng.
- [ ] `mcp.tool.name` trong luật là tên gốc hay tên đã ghép `<server>_`.
- [ ] Nhiều dòng `matchExpressions` là "hoặc" hay "và": hướng dẫn và tài liệu API nói khác nhau.
- [ ] Tool không được phép có bị ẩn khỏi `tools/list` và trả lỗi `unauthorized tool call` khi gọi thẳng.
- [ ] Policy API key đặt ở Gateway có áp dụng cho route `/mcp`; key sai bị từ chối trước khi tới MCP server.
- [ ] Sửa Backend, Policy thì bao lâu gateway áp dụng; phiên MCP đang mở có thấy thay đổi không.
- [ ] `failureMode: FailOpen`: tắt một MCP server, các server khác vẫn phục vụ.
- [ ] Access log có tên server và tên tool cho từng lời gọi.

Lưu ý:
- Target chọn theo nhãn Service chỉ hỗ trợ Streamable HTTP; server SSE phải khai báo địa chỉ tĩnh. MaaS dùng địa chỉ tĩnh cho mọi server để một kiểu khai báo dùng được cho cả hai.
- Tên server không chứa gạch dưới, vì gateway nối tên server và tên tool bằng `_`.
- Rate limit của gateway đếm theo request HTTP; một lần dùng tool tốn khoảng 3–5 request. Giới hạn riêng từng tool cần rate limit server ngoài.

## 5. Điều cần nhớ khi vận hành

- Gateway trừ hạn mức **sau** khi có phản hồi, MaaS khoá key theo chu kỳ: một key có thể vượt hạn mức USD một khoản nhỏ. Mục tiêu khoá trong 2 phút.
- Token chỉ được đếm cho lời gọi thành công. Access log thì ghi cả lời gọi bị từ chối.
- Khi tiến trình thu log hoặc tiến trình khoá key của MaaS ngừng, lời gọi vẫn chạy nhưng không ai chặn hạn mức USD; chỉ còn lưới an toàn của gateway.
- Không sửa tay ConfigMap key trên cụm; mọi thay đổi đi từ MaaS.

## 6. Quyết định còn mở

- [ ] Lời gọi lỗi có tính vào "lượt gọi" không. Đề xuất: chỉ đếm lời gọi thành công, tách lời gọi lỗi thành số riêng.
- [ ] Có đặt giới hạn số request theo key và theo phòng không, mức bao nhiêu.

## 7. Phương án dự phòng nếu không được cấp quyền ConfigMap

Chuyển xác thực sang **external auth** của gateway (`traffic.extAuth`): gateway hỏi một dịch vụ xác thực của MaaS ở mỗi lời gọi, key nằm hoàn toàn trong database của MaaS, MaaS không cần quyền gì trên cụm.

- Dịch vụ xác thực nằm trên đường gọi: nó ngừng thì mọi lời gọi bị từ chối, nên phải chạy nhiều bản sao.
- Đặt cache 30–60 giây; cache càng dài thì thu hồi key càng chậm.
- Phải kiểm chứng trước: thông tin dịch vụ xác thực trả về (mã key, mã phòng) có dùng được trong access log và làm khoá rate limit không. Nếu không thì mất nguồn định danh để đếm chi phí.
- Không chọn JWT thay cho key: token đã phát không thu hồi được trước hạn.
