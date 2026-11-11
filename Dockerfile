# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.27.3-bookworm AS go-toolchain

FROM --platform=$BUILDPLATFORM node:24.22.1-bookworm-slim AS frontend
COPY --from=go-toolchain /usr/local/go /usr/local/go
COPY --from=go-toolchain /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV PATH="/usr/local/go/bin:${PATH}"
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY shared ./shared
COPY packaging ./packaging
COPY tests ./tests
COPY examples ./examples
COPY backend ./backend
COPY cli ./cli
COPY eslint.config.mjs react-router.config.ts tsconfig.json vite.config.ts vite.public.config.ts ./
RUN npm run build:web

FROM go-toolchain AS build
WORKDIR /app
COPY backend/go.mod backend/go.sum ./backend/
COPY cli/go.mod ./cli/
COPY backend/third_party ./backend/third_party
RUN cd backend && go mod download
COPY backend ./backend
COPY cli ./cli
COPY --from=frontend /app/backend/internal/blog/openapi.json ./backend/internal/blog/openapi.json
COPY --from=frontend /app/cli/skills/margin-authoring/references ./cli/skills/margin-authoring/references
COPY --from=frontend /app/dist/client ./backend/assets/web
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
RUN --mount=type=cache,target=/root/.cache/go-build \
    cd backend && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o /margin ./cmd/margin-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 margin && mkdir -p /app/.data && chown -R margin:margin /app
WORKDIR /app
ENV MARGIN_ENV=production HOST=0.0.0.0 PORT=3001 SQLITE_PATH=/app/.data/margin.db
COPY --from=build /margin /usr/local/bin/margin
COPY backend/third_party/fused-open-core/LICENSE /usr/share/doc/margin/fused-open-core-LICENSE
USER margin
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["margin", "healthcheck"]
CMD ["margin", "serve"]
