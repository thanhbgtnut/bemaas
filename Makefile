# bemaas: một binary Go chứa API (Hertz) và giao diện React nhúng bằng embed.FS.
# Biến lấy từ .env (sao chép từ .env.example). config.yaml chỉ chứa ${BIẾN}.
ENV_FILE ?= .env
-include $(ENV_FILE)
COMPOSE = docker compose --env-file $(ENV_FILE) -f deploy/docker-compose.yml
PSQL = $(COMPOSE) exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) -v ON_ERROR_STOP=1

.PHONY: all env web build run devmock dev-web test infra-up infra-down migrate seed seed-demo image clean

all: build

env:            ## tạo .env từ .env.example nếu chưa có
	@test -f $(ENV_FILE) || (cp .env.example $(ENV_FILE) && echo "Đã tạo $(ENV_FILE) từ .env.example")

web:            ## build giao diện React vào web/dist
	cd web && npm ci && npm run build

build: web      ## build binary bin/bemaas (đã nhúng giao diện)
	CGO_ENABLED=0 go build -trimpath -o bin/bemaas ./cmd/bemaas

run: env        ## chạy backend (giao diện lấy từ bản build gần nhất trong web/dist)
	go run ./cmd/bemaas -env $(ENV_FILE)

devmock: env    ## CHỈ LOCAL: agentgateway giả :8090 (OpenAI, Anthropic, SystemOne, TurboOCR, MinerU), MCP server giả :8092
	go run ./cmd/devmock -env $(ENV_FILE)

dev-web:        ## Vite dev server ở :5173, proxy /api sang :8080
	cd web && npm run dev

test:
	go test ./...

infra-up: env   ## PostgreSQL, Redis, S3 (SeaweedFS), Keycloak cho local
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

migrate: env
	go run ./cmd/bemaas -env $(ENV_FILE) migrate

seed: migrate   ## danh mục model, bảng giá, phòng mẫu
	$(PSQL) < deploy/seed/01-catalog.sql

seed-demo:      ## chạy sau khi 3 tài khoản mẫu đã đăng nhập một lần
	$(PSQL) < deploy/seed/02-demo-after-login.sql

image:
	docker build -t bemaas:dev .

clean:
	rm -rf bin web/dist
