# bemaas: một binary Go chứa API (Hertz) và giao diện React nhúng (internal/webui).
# Biến lấy từ .env (sao chép từ .env.example). configs/config.yaml chỉ chứa ${BIẾN}.
# Windows: chạy make trong Git Bash (cần bash, như bepaylot).
SHELL := /bin/bash
ENV_FILE ?= .env
# Chỉ để make đọc DB_USER, DB_NAME…; không export: bemaas tự nạp .env, compose dùng --env-file.
-include $(ENV_FILE)

EXE     := $(if $(filter Windows_NT,$(OS)),.exe,)
CONFIG  := configs/config.yaml
COMPOSE := docker compose --env-file $(ENV_FILE) -f deploy/docker-compose.yml
PSQL    := $(COMPOSE) exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) -v ON_ERROR_STOP=1

.DEFAULT_GOAL := help

.PHONY: help
help: ## Liệt kê các lệnh
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: env
env: ## Tạo .env từ .env.example nếu chưa có
	@test -f $(ENV_FILE) || (cp .env.example $(ENV_FILE) && echo "Đã tạo $(ENV_FILE) từ .env.example")

.PHONY: tidy
tidy: ## go mod tidy
	go mod tidy

.PHONY: build
build: ## Build mọi package Go
	go build ./...

.PHONY: ui
ui: ## Build giao diện React vào internal/webui/dist (được nhúng vào binary)
	cd frontend && npm ci && npm run build

.PHONY: build-server
build-server: ui ## Build bin/bemaas đã nhúng giao diện
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/bemaas$(EXE) ./cmd/bemaas

.PHONY: docker
docker: ## Build image bemaas:dev (deploy/Dockerfile)
	docker build -f deploy/Dockerfile -t bemaas:dev .

.PHONY: vet
vet: ## go vet
	go vet ./...

.PHONY: test
test: ## Chạy test Go
	go test ./...

.PHONY: up
up: env ## Bật PostgreSQL, Redis :6380, S3 (SeaweedFS) :9000, Keycloak :8180
	$(COMPOSE) up -d
	@echo "chờ postgres..." && until $(COMPOSE) exec -T postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do sleep 1; done
	@echo "postgres sẵn sàng ở localhost:$(DB_PORT)"

.PHONY: down
down: ## Tắt hạ tầng local
	$(COMPOSE) down

.PHONY: reset-db
reset-db: ## Xoá volume dữ liệu rồi bật lại hạ tầng
	$(COMPOSE) down -v && $(MAKE) up

.PHONY: migrate
migrate: ## Chạy migration (migrations/postgres) rồi thoát
	go run ./cmd/bemaas -config $(CONFIG) -env $(ENV_FILE) migrate

.PHONY: seed
seed: migrate ## Nạp danh mục model, bảng giá, phòng mẫu
	$(PSQL) < deploy/seed/01-catalog.sql

.PHONY: seed-demo
seed-demo: ## Dữ liệu minh hoạ; chạy sau khi 3 tài khoản mẫu đã đăng nhập một lần
	$(PSQL) < deploy/seed/02-demo-after-login.sql

.PHONY: run
run: ## Chạy backend :8080 (giao diện lấy từ bản build gần nhất)
	go run ./cmd/bemaas -config $(CONFIG) -env $(ENV_FILE)

.PHONY: dev
dev: up migrate ## Bật hạ tầng, migration rồi chạy backend
	$(MAKE) run

.PHONY: run-web
run-web: ## Chạy cùng lúc backend :8080 và Vite dev server :5173
	./scripts/run-web.sh

.PHONY: devmock
devmock: ## CHỈ LOCAL: agentgateway giả :8090, MCP server giả :8092
	go run ./cmd/devmock -config $(CONFIG) -env $(ENV_FILE)

.PHONY: clean
clean: ## Xoá bin/ và bản build giao diện
	rm -rf bin
	find internal/webui/dist -mindepth 1 ! -name .gitkeep -delete
