-- Dữ liệu mẫu: danh mục model, bảng giá, phòng, bộ skill. Số liệu là dữ liệu mẫu, lấy theo prototype.
-- Chạy được nhiều lần (ON CONFLICT DO NOTHING).

-- Mỗi chuẩn API (internal/standard) có 1–2 model mẫu để thử ở Playground.
INSERT INTO model (id, name, provider_team, type, standard, modes, use_cases, status, data_level, endpoint, context_length, enabled, description, card) VALUES
 -- OpenAI compatible
 ('llm-noi-bo', 'LLM nội bộ', 'nen-tang-ai', 'chat', 'openai', '{chat,completion}', '{Tiếng Việt,Tác vụ chung,Tài chính}', 'production', 'noi_bo', '/v1', 32768, true,
  'Mô hình ngôn ngữ dùng chung cho tác vụ tiếng Việt và nghiệp vụ ngân hàng.', E'## Mô tả\nMô hình ngôn ngữ dùng chung.\n\n## Mục đích sử dụng\n- Phù hợp: tóm tắt, soạn thảo, hỏi đáp nội bộ.\n- Không dùng cho: quyết định tín dụng tự động.\n\n## Xử lý dữ liệu khi gọi\nKhông lưu nội dung lời gọi, không dùng để huấn luyện.'),
 ('code-llm', 'Code LLM', 'nen-tang-ai', 'chat', 'openai', '{chat,completion}', '{Lập trình,Tác vụ chung}', 'production', 'noi_bo', '/v1', 65536, true,
  'Mô hình hỗ trợ lập trình, review code và viết test.', ''),
 ('embed-vi', 'Embed-VI', 'nen-tang-ai', 'embedding', 'openai', '{embedding}', '{Tiếng Việt,Tìm kiếm}', 'production', 'mat', '/v1', 8192, true,
  'Embedding tiếng Việt cho tìm kiếm ngữ nghĩa.', ''),
 ('rerank-vi', 'Rerank-VI', 'nen-tang-ai', 'rerank', 'openai', '{rerank}', '{Tiếng Việt,Tìm kiếm}', 'beta', 'mat', '/v1', 8192, true,
  'Xếp hạng lại kết quả tìm kiếm tiếng Việt.', ''),
 -- Anthropic compatible
 ('tro-ly-noi-bo', 'Trợ lý nội bộ', 'nen-tang-ai', 'chat', 'anthropic', '{messages}', '{Tiếng Việt,Tác vụ chung}', 'production', 'noi_bo', '/v1', 200000, true,
  'Trợ lý hội thoại gọi theo Messages API của Anthropic.', ''),
 ('phan-tich-hop-dong', 'Phân tích hợp đồng', 'phap-che-so', 'chat', 'anthropic', '{messages}', '{Tiếng Việt,Pháp chế}', 'beta', 'mat', '/v1', 200000, true,
  'Rà soát điều khoản hợp đồng, chỉ ra rủi ro cho ngân hàng.', ''),
 -- SystemOne compatible: decision API, trả quyết định kèm xác suất
 ('s1-phan-loai', 'SystemOne Phân loại yêu cầu', 'van-hanh-so', 'chat', 'systemone', '{decide}', '{Tiếng Việt,Chăm sóc khách hàng}', 'beta', 'noi_bo', '/v1', 8192, true,
  'Phân loại yêu cầu của khách hàng, trả nhóm kèm xác suất và độ tin cậy.', ''),
 ('s1-danh-gia-rui-ro', 'SystemOne Đánh giá rủi ro', 'phong-chong-gian-lan', 'chat', 'systemone', '{decide}', '{Tiếng Việt,Tài chính}', 'beta', 'mat', '/v1', 8192, true,
  'Chấm mức nghi ngờ gian lận và mức độ khẩn cấp của giao dịch.', ''),
 ('s1-chung-tu', 'SystemOne Kiểm tra chứng từ', 'ai-xu-ly-tai-lieu', 'chat', 'systemone', '{decide}', '{Tiếng Việt,Tài liệu & chứng từ}', 'beta', 'mat', '/v1', 8192, true,
  'Model vision (họ clef): ra quyết định trên ảnh chứng từ kèm state, ví dụ loại chứng từ, số tiền có khớp, ảnh có rõ.', E'## Mô tả\nModel SystemOne có thị giác: nhận `images` (base64 PNG, JPEG, WebP) cùng `state` và các câu hỏi.\n\n## Mục đích sử dụng\n- Phù hợp: phân loại chứng từ, đối chiếu thông tin trên ảnh, đánh giá chất lượng ảnh.\n- Không dùng cho: thay thế bước kiểm soát của giao dịch viên.\n\n## Xử lý dữ liệu khi gọi\nChỉ dùng ảnh mẫu đã che thông tin khách hàng khi thử.'),
 -- TurboOCR
 ('cppd-ocr', 'CPPD-OCR', 'ai-xu-ly-tai-lieu', 'document', 'turboocr', '{ocr}', '{Tiếng Việt,Tài liệu & chứng từ}', 'production', 'mat', '/turboocr/cppd-ocr', NULL, true,
  'OCR ảnh chứng từ sang văn bản (TurboOCR).', ''),
 ('turbo-ocr-bang', 'TurboOCR Bảng biểu', 'ai-xu-ly-tai-lieu', 'document', 'turboocr', '{ocr}', '{Tiếng Việt,Tài liệu & chứng từ,Tài chính}', 'beta', 'mat', '/turboocr/turbo-ocr-bang', NULL, true,
  'OCR có nhận dạng bố cục và bảng (layout, tables).', ''),
 -- MinerU OCR
 ('mineru-pipeline', 'MinerU Pipeline', 'ai-xu-ly-tai-lieu', 'document', 'mineru', '{parse}', '{Tiếng Việt,Tài liệu & chứng từ}', 'production', 'mat', '/mineru/mineru-pipeline', NULL, true,
  'Phân tích PDF và ảnh sang Markdown, chạy trên CPU.', ''),
 ('mineru-vlm', 'MinerU VLM', 'ai-xu-ly-tai-lieu', 'document', 'mineru', '{parse}', '{Tiếng Việt,Tài liệu & chứng từ,Pháp chế}', 'beta', 'mat', '/mineru/mineru-vlm', NULL, false,
  'Phân tích tài liệu phức tạp (bảng lồng, công thức) bằng VLM, chạy trên GPU.', '')
ON CONFLICT DO NOTHING;

INSERT INTO model_price (model_id, provider_id, input, output, cache_read, per_page) VALUES
 ('llm-noi-bo',         'noi-bo', 0.30, 0.90, 0.08, 0),
 ('code-llm',           'noi-bo', 0.45, 1.35, 0.11, 0),
 ('embed-vi',           'noi-bo', 0.06, 0,    0,    0),
 ('rerank-vi',          'noi-bo', 0.08, 0,    0,    0),
 ('tro-ly-noi-bo',      'noi-bo', 0.50, 1.50, 0.05, 0),
 ('phan-tich-hop-dong', 'noi-bo', 0.80, 2.40, 0.08, 0),
 ('s1-phan-loai',       'noi-bo', 0.10, 0.20, 0,    0),
 ('s1-danh-gia-rui-ro', 'noi-bo', 0.12, 0.30, 0,    0),
 ('s1-chung-tu',        'noi-bo', 0.20, 0.40, 0,    0),
 ('cppd-ocr',           'noi-bo', 0,    0,    0,    0.006),
 ('turbo-ocr-bang',     'noi-bo', 0,    0,    0,    0.009),
 ('mineru-pipeline',    'noi-bo', 0,    0,    0,    0.004),
 ('mineru-vlm',         'noi-bo', 0,    0,    0,    0.012)
ON CONFLICT DO NOTHING;

-- CSDL đã nạp bản mẫu cũ: đưa model cũ về đúng chuẩn; bỏ model mẫu cũ không còn dùng nếu chưa có dữ liệu dùng.
UPDATE model SET description = 'OCR ảnh chứng từ sang văn bản (TurboOCR).' WHERE id = 'cppd-ocr' AND standard = 'turboocr';
UPDATE model SET modes = '{chat,completion}', type = 'chat' WHERE id IN ('llm-noi-bo', 'code-llm') AND standard = 'openai' AND modes = '{}';
UPDATE model SET description = 'Phân loại yêu cầu của khách hàng, trả nhóm kèm xác suất và độ tin cậy.', context_length = 8192
  WHERE id = 's1-phan-loai' AND context_length IS NULL;
DELETE FROM model m WHERE m.id IN ('doc-kie', 'doc-classify', 's1-tom-tat')
  AND NOT EXISTS (SELECT 1 FROM usage_event u WHERE u.model_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM usage_month u WHERE u.model_id = m.id);

INSERT INTO department (name, block, monthly_budget_usd) VALUES
 ('Phòng Phát triển Kênh số',    'Khối CNTT',       400),
 ('Phòng Thanh toán',            'Khối Vận hành',   300),
 ('Phòng Thẩm định tín dụng',    'Khối Tín dụng',   150),
 ('Văn phòng Chuyển đổi số',     'Khối Chiến lược', 120),
 ('Phòng Phòng chống rửa tiền',  'Khối Tuân thủ',    60)
ON CONFLICT DO NOTHING;

INSERT INTO skill_set (role_name, unit, scope)
SELECT * FROM (VALUES
 ('Cán bộ tín dụng',        'Khối Tín dụng', 'nghiep_vu'),
 ('Chuyên viên thanh toán', 'Khối Vận hành', 'nghiep_vu'),
 ('Lập trình viên',         'Khối CNTT',     'cntt'),
 ('Kỹ sư vận hành (SRE)',   'Khối CNTT',     'cntt')) v(role_name, unit, scope)
WHERE NOT EXISTS (SELECT 1 FROM skill_set);
