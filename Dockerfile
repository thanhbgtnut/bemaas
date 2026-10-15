# Bản phát hành: một image, một binary.
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/bemaas ./cmd/bemaas

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/bemaas /bemaas
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY config.yaml /etc/bemaas/config.yaml
EXPOSE 8080
# config.yaml chỉ chứa ${BIẾN}; giá trị truyền bằng biến môi trường (env_file, ConfigMap, Secret).
ENTRYPOINT ["/bemaas", "-config", "/etc/bemaas/config.yaml"]
