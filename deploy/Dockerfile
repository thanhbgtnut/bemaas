# Bản phát hành: một image, một binary.
# Build từ thư mục gốc: docker build -f deploy/Dockerfile .
# Giao diện: Vite build vào internal/webui/dist (xem frontend/vite.config.ts).
FROM node:22-alpine AS ui
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN mkdir -p ../internal/webui/dist && npm run build

FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=ui /src/internal/webui/dist/ ./internal/webui/dist/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/bemaas ./cmd/bemaas

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/bemaas /bemaas
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY configs/config.yaml /etc/bemaas/config.yaml
EXPOSE 8080
# config.yaml chỉ chứa ${BIẾN}; giá trị truyền bằng biến môi trường (env_file, ConfigMap, Secret).
ENTRYPOINT ["/bemaas", "-config", "/etc/bemaas/config.yaml"]
