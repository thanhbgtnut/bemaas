-- Bổ sung để hoàn chỉnh sản phẩm: thông báo (mục 13), phiên bản và thảo luận model (M10),
-- đóng đề xuất skill khi đã có skill (tiêu chí 10), lịch sử đồng bộ cấu hình gateway.

-- Thông báo trong ứng dụng. Kênh email/chat nội bộ chưa chốt (câu hỏi mở 7).
CREATE TABLE notification (
    id         bigserial PRIMARY KEY,
    user_id    text NOT NULL REFERENCES app_user(id),
    kind       text NOT NULL,          -- key.pending, key.threshold, dept.threshold, key.expiring, limit_request.*, skill.comment, wish.taken
    title      text NOT NULL,
    body       text NOT NULL DEFAULT '',
    link       text NOT NULL DEFAULT '',  -- đường dẫn trong giao diện
    dedup_key  text,                   -- tránh gửi trùng một sự kiện
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);
CREATE INDEX notification_user_idx ON notification (user_id, created_at DESC);
CREATE UNIQUE INDEX notification_dedup_uniq ON notification (user_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- Phiên bản dịch vụ model do đội cung cấp khai báo (tab Phiên bản).
CREATE TABLE model_version (
    id         bigserial PRIMARY KEY,
    model_id   text NOT NULL REFERENCES model(id) ON DELETE CASCADE,
    version    text NOT NULL,
    notes      text NOT NULL DEFAULT '',
    created_by text NOT NULL REFERENCES app_user(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (model_id, version)
);

-- Thảo luận trên model card (tab Thảo luận).
CREATE TABLE model_comment (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id  text NOT NULL REFERENCES model(id) ON DELETE CASCADE,
    user_id   text NOT NULL REFERENCES app_user(id),
    body      text NOT NULL,
    parent_id uuid REFERENCES model_comment(id),
    ts        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_comment_model_idx ON model_comment (model_id, ts);

-- Đề xuất skill đóng lại khi skill tương ứng được đăng.
ALTER TABLE skill_wish ADD COLUMN fulfilled_skill_id uuid REFERENCES skill(id);

-- Thời điểm đồng bộ cấu hình MCP xuống gateway và nội dung đã ghi (tab Cấu hình gateway).
CREATE TABLE gateway_sync_state (
    name       text PRIMARY KEY,       -- keys | catalog | mcp
    synced_at  timestamptz NOT NULL,
    content    jsonb NOT NULL DEFAULT '{}',
    error      text
);

-- Lượt gọi tool theo key: thêm chỉ mục tra theo server.
CREATE INDEX mcp_tool_usage_server_idx ON mcp_tool_usage (server_id, period);

-- Ingester: request id của lời gọi tool MCP đã nạp, để nạp lại log không cộng hai lần.
-- (Lời gọi model đã có khoá duy nhất usage_event.request_id.)
CREATE TABLE ingest_seen (
    request_id text PRIMARY KEY,
    seen_at    timestamptz NOT NULL DEFAULT now()
);

-- Đường dẫn MCP trên server (Streamable HTTP thường là /mcp, SSE thường là /sse).
ALTER TABLE mcp_server ADD COLUMN path text NOT NULL DEFAULT '/mcp';
ALTER TABLE mcp_server ADD COLUMN last_error text;
