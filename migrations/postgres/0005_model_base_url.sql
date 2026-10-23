-- Base URL agentgateway riêng của model; rỗng = GATEWAY_BASE_URL.
ALTER TABLE model ADD COLUMN IF NOT EXISTS base_url text NOT NULL DEFAULT '';
