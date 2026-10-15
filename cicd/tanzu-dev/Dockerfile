# Stage 1: build giao diện và binary.
# Base image (cicd/tanzu-dev/Dockerfile.base) đã có Go, Node, Go module cache và node_modules
# của frontend/, nên bước này không cần apt / npm.
ARG BASE_IMAGE=registry.internal/cicd-common/bemaas-base:1.0.0
ARG RUNTIME_IMAGE=registry.internal/cicd-common/debian:bookworm-slim

FROM ${BASE_IMAGE} AS builder

LABEL stage=gobuilder

# Go proxy nội bộ (Nexus/Athens); truyền --build-arg GOPROXY=... khi build.
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
ENV GOSUMDB=off

COPY . /app

# Giao diện: Vite build vào internal/webui/dist, được nhúng vào binary (internal/webui).
WORKDIR /app/frontend
RUN cmp -s package-lock.json /opt/web/package-lock.json \
    || { echo "frontend/package-lock.json khác base image: build lại cicd/tanzu-dev/Dockerfile.base"; exit 1; }
RUN cp -a /opt/web/node_modules ./node_modules && npm run build

WORKDIR /app

# Module đã có trong base image; chỉ module thêm sau đó mới tải từ Nexus.
RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/bemaas ./cmd/bemaas

# Stage 2: runtime
FROM ${RUNTIME_IMAGE}

WORKDIR /app

COPY --from=builder /out/bemaas /app/bemaas
# config.yaml chỉ chứa ${BIẾN}; giá trị lấy từ biến môi trường / ConfigMap app.env.
COPY --from=builder /app/configs/config.yaml /app/configs/config.yaml
# Tệp image slim thiếu, lấy từ base image thay vì apt.
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# BEMAAS_ENV: ConfigMap app.env được gắn dạng tệp ở /deployment/config (values.yaml).
# Không có tệp thì bỏ qua; biến môi trường có sẵn luôn được ưu tiên hơn tệp.
ENV BEMAAS_CONFIG=/app/configs/config.yaml \
    BEMAAS_ENV=/deployment/config/app.env \
    SERVER_ADDR=:8080

# Tạo group và user. /logs: thư mục ghi log khi LOG_FILE=/logs/bemaas.log (app.env).
RUN mkdir /logs && \
    addgroup --gid 10000 appadmin && \
    adduser --uid 10000 --ingroup appadmin --disabled-password --gecos "" appadmin && \
    chown -R appadmin:appadmin /app /logs

# User mặc định
USER appadmin

EXPOSE 8080

VOLUME /tmp /logs /home/appadmin

ENTRYPOINT ["/app/bemaas"]
