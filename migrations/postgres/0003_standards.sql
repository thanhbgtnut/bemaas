-- Chuẩn hoá model theo chuẩn API (M14–M18): mỗi model khai báo một chuẩn trong danh mục internal/standard.
-- Bỏ trang dùng thử Gradio: mọi model dùng thử ở Playground.
ALTER TABLE model ADD COLUMN IF NOT EXISTS standard text NOT NULL DEFAULT 'openai';
-- endpoint từ nay là tiền tố đường dẫn của model trên gateway; thao tác của chuẩn nối sau tiền tố.
UPDATE model SET standard = 'turboocr', endpoint = '/turboocr/' || id, modes = '{ocr}' WHERE type = 'document';
UPDATE model SET endpoint = '/v1' WHERE standard = 'openai';
ALTER TABLE model DROP COLUMN IF EXISTS gradio_app_url;
CREATE INDEX IF NOT EXISTS model_standard_idx ON model (standard);
