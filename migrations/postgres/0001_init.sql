-- Mô hình dữ liệu theo mục 11 và 20.5 của spec-maas.md.
-- Tiền tệ: USD, kiểu numeric (B1), không dùng số thực.

-- Người dùng và vai trò ------------------------------------------------------
CREATE TABLE app_user (
    id            text PRIMARY KEY,             -- claim `sub` của Keycloak
    email         text NOT NULL DEFAULT '',
    name          text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_user_email_idx ON app_user (lower(email));

CREATE TABLE platform_admin (
    user_id    text PRIMARY KEY REFERENCES app_user(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Vai trò Kiểm soát (chỉ xem toàn ngân hàng) [ĐX]
CREATE TABLE auditor (
    user_id    text PRIMARY KEY REFERENCES app_user(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Models -------------------------------------------------------------------
CREATE TABLE model (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    provider_team   text NOT NULL,
    type            text NOT NULL CHECK (type IN ('chat','embedding','rerank','document')),
    modes           text[] NOT NULL DEFAULT '{}',
    use_cases       text[] NOT NULL DEFAULT '{}',
    status          text NOT NULL DEFAULT 'beta' CHECK (status IN ('production','beta')),
    data_level      text NOT NULL DEFAULT 'noi_bo' CHECK (data_level IN ('noi_bo','mat')),
    deploy          text NOT NULL DEFAULT '',
    endpoint        text NOT NULL DEFAULT '',
    context_length  integer,
    enabled         boolean NOT NULL DEFAULT false,
    gradio_app_url  text,
    base_model_id   text,
    description     text NOT NULL DEFAULT '',
    card            text NOT NULL DEFAULT '',
    governance      jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_price (
    model_id    text PRIMARY KEY REFERENCES model(id) ON DELETE CASCADE,
    provider_id text NOT NULL DEFAULT '',           -- provider khai báo với gateway, dùng trong catalog.json
    input       numeric(14,6) NOT NULL DEFAULT 0,   -- USD / 1 triệu token
    output      numeric(14,6) NOT NULL DEFAULT 0,
    cache_read  numeric(14,6) NOT NULL DEFAULT 0,
    per_page    numeric(14,6) NOT NULL DEFAULT 0,   -- USD / trang (model tài liệu)
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_like (
    model_id text NOT NULL REFERENCES model(id) ON DELETE CASCADE,
    user_id  text NOT NULL REFERENCES app_user(id),
    ts       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model_id, user_id)
);

-- Skill hub ----------------------------------------------------------------
CREATE TABLE skill (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain         text NOT NULL,
    name           text NOT NULL,
    title          text NOT NULL,
    kind           text NOT NULL CHECK (kind IN ('guide','script','tool')),
    description    text NOT NULL DEFAULT '',
    trigger        text NOT NULL DEFAULT '',
    author_user_id text NOT NULL REFERENCES app_user(id),
    owner_unit     text NOT NULL DEFAULT '',
    models         text[] NOT NULL DEFAULT '{}',
    tools          text[] NOT NULL DEFAULT '{}',
    verified       boolean NOT NULL DEFAULT false,
    latest_version text NOT NULL,
    installs       integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (domain, name)
);

CREATE TABLE skill_version (
    skill_id    uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
    version     text NOT NULL,
    changelog   text NOT NULL DEFAULT '',
    package_ref text NOT NULL,          -- object key trong bucket S3
    size_bytes  bigint NOT NULL DEFAULT 0,
    files       jsonb NOT NULL DEFAULT '[]',
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (skill_id, version)
);

CREATE TABLE skill_like (
    skill_id uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
    user_id  text NOT NULL REFERENCES app_user(id),
    ts       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (skill_id, user_id)
);

CREATE TABLE skill_install (
    id       bigserial PRIMARY KEY,
    skill_id uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
    version  text NOT NULL,
    user_id  text REFERENCES app_user(id),
    via      text NOT NULL CHECK (via IN ('cli','zip','set')),
    ts       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_comment (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id  uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
    user_id   text NOT NULL REFERENCES app_user(id),
    body      text NOT NULL,
    parent_id uuid REFERENCES skill_comment(id),
    ts        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_set (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name text NOT NULL,
    unit      text NOT NULL DEFAULT '',
    scope     text NOT NULL CHECK (scope IN ('nghiep_vu','cntt')),
    skill_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE TABLE skill_wish (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text NOT NULL,
    description  text NOT NULL DEFAULT '',
    skill_set_id uuid REFERENCES skill_set(id),
    proposed_by  text NOT NULL REFERENCES app_user(id),
    taker        text REFERENCES app_user(id),
    few_experts  boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_wish_vote (
    wish_id uuid NOT NULL REFERENCES skill_wish(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES app_user(id),
    PRIMARY KEY (wish_id, user_id)
);

-- Ngân sách và key -----------------------------------------------------------
CREATE TABLE department (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text NOT NULL UNIQUE,
    block              text NOT NULL DEFAULT '',
    monthly_budget_usd numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_budget_usd >= 0),
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE department_admin (
    department_id uuid NOT NULL REFERENCES department(id) ON DELETE CASCADE,
    user_id       text NOT NULL REFERENCES app_user(id),
    PRIMARY KEY (department_id, user_id)
);

CREATE TABLE member (
    department_id uuid NOT NULL REFERENCES department(id) ON DELETE CASCADE,
    user_id       text NOT NULL REFERENCES app_user(id),
    joined_at     timestamptz NOT NULL DEFAULT now(),
    left_at       timestamptz
);
CREATE UNIQUE INDEX member_active_uniq ON member (department_id, user_id) WHERE left_at IS NULL;

CREATE TABLE api_key (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id     uuid NOT NULL REFERENCES department(id),
    kind              text NOT NULL CHECK (kind IN ('member','app')),
    owner_user_id     text REFERENCES app_user(id),
    name              text NOT NULL,
    key_hash          text,                     -- "sha256:<hex>"; NULL khi key thành viên chưa nhận
    last4             text,
    monthly_limit_usd numeric(14,2) NOT NULL CHECK (monthly_limit_usd >= 0),
    allowed_models    text[] NOT NULL DEFAULT '{}',
    expires_at        timestamptz,
    status            text NOT NULL CHECK (status IN ('pending','active','blocked_key','blocked_dept','revoked','expired')),
    created_by        text NOT NULL REFERENCES app_user(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    claimed_at        timestamptz,
    revoked_at        timestamptz,
    last_used_at      timestamptz,
    CHECK (kind = 'app' OR owner_user_id IS NOT NULL)
);
-- Tên key duy nhất trong một phòng (với key chưa thu hồi).
CREATE UNIQUE INDEX api_key_name_uniq ON api_key (department_id, lower(name)) WHERE status NOT IN ('revoked','expired');
CREATE UNIQUE INDEX api_key_hash_uniq ON api_key (key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX api_key_owner_idx ON api_key (owner_user_id);

CREATE TABLE usage_event (
    request_id    text PRIMARY KEY,             -- duy nhất để nạp lại log không bị đếm trùng
    ts            timestamptz NOT NULL,
    key_id        uuid NOT NULL REFERENCES api_key(id),
    department_id uuid NOT NULL REFERENCES department(id),
    model_id      text NOT NULL,
    input_tokens  bigint NOT NULL DEFAULT 0,
    cache_tokens  bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    pages         integer NOT NULL DEFAULT 0,
    cost_usd      numeric(14,6) NOT NULL DEFAULT 0
);
CREATE INDEX usage_event_ts_idx ON usage_event (ts);
CREATE INDEX usage_event_key_ts_idx ON usage_event (key_id, ts);
CREATE INDEX usage_event_dept_ts_idx ON usage_event (department_id, ts);

CREATE TABLE usage_month (
    period        text NOT NULL,                -- YYYY-MM theo Asia/Ho_Chi_Minh
    key_id        uuid NOT NULL REFERENCES api_key(id),
    department_id uuid NOT NULL REFERENCES department(id),
    model_id      text NOT NULL,
    requests      bigint NOT NULL DEFAULT 0,
    input_tokens  bigint NOT NULL DEFAULT 0,
    cache_tokens  bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    pages         bigint NOT NULL DEFAULT 0,
    cost_usd      numeric(14,6) NOT NULL DEFAULT 0,
    PRIMARY KEY (period, key_id, model_id)
);
CREATE INDEX usage_month_dept_idx ON usage_month (period, department_id);

CREATE TABLE limit_request (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL CHECK (kind IN ('key_limit','dept_budget')),
    target_id     uuid NOT NULL,
    department_id uuid NOT NULL REFERENCES department(id),
    requested_usd numeric(14,2) NOT NULL CHECK (requested_usd >= 0),
    reason        text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
    requested_by  text NOT NULL REFERENCES app_user(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    decided_by    text REFERENCES app_user(id),
    decided_at    timestamptz,
    decision_note text
);

-- Nhật ký thao tác: chỉ thêm, không sửa, không xoá (mục 14).
CREATE TABLE audit_log (
    id            bigserial PRIMARY KEY,
    ts            timestamptz NOT NULL DEFAULT now(),
    actor_user_id text NOT NULL,                -- 'system' khi Enforcer thực hiện
    action        text NOT NULL,
    target_type   text NOT NULL,
    target_id     text NOT NULL,
    department_id uuid,
    before        jsonb,
    after         jsonb,
    reason        text
);
CREATE INDEX audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX audit_log_dept_idx ON audit_log (department_id, ts DESC);

CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log chỉ được thêm, không sửa hoặc xoá';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Ngưỡng cảnh báo đã gửi, để mỗi ngưỡng chỉ báo một lần mỗi tháng (10.3 bước 4).
CREATE TABLE threshold_notice (
    period      text NOT NULL,
    target_type text NOT NULL CHECK (target_type IN ('key','department')),
    target_id   uuid NOT NULL,
    threshold   integer NOT NULL,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (period, target_type, target_id, threshold)
);

-- MCP server và tools (mục 20.5) --------------------------------------------
CREATE TABLE mcp_server (
    id              text PRIMARY KEY,           -- tên trên gateway
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    owner_unit      text NOT NULL DEFAULT '',
    host            text NOT NULL,
    port            integer NOT NULL,
    protocol        text NOT NULL CHECK (protocol IN ('streamable_http','sse')),
    enabled         boolean NOT NULL DEFAULT true,
    scope           text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','departments')),
    health          text NOT NULL DEFAULT 'ok' CHECK (health IN ('ok','down')),
    last_scanned_at timestamptz,
    created_by      text NOT NULL REFERENCES app_user(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mcp_server_dept (
    server_id     text NOT NULL REFERENCES mcp_server(id) ON DELETE CASCADE,
    department_id uuid NOT NULL REFERENCES department(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, department_id)
);

CREATE TABLE mcp_tool (
    server_id     text NOT NULL REFERENCES mcp_server(id) ON DELETE CASCADE,
    name          text NOT NULL,
    description   text NOT NULL DEFAULT '',
    read_only     boolean NOT NULL DEFAULT true,
    enabled       boolean NOT NULL DEFAULT false,   -- tool mới mặc định đóng
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at   timestamptz,
    PRIMARY KEY (server_id, name)
);

CREATE TABLE mcp_tool_usage (
    period        date NOT NULL,
    server_id     text NOT NULL,
    tool_name     text NOT NULL,
    key_id        uuid NOT NULL,
    department_id uuid NOT NULL,
    calls         bigint NOT NULL DEFAULT 0,
    errors        bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (period, server_id, tool_name, key_id)
);
