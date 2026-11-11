# Developing Margin

Use Go 1.26+ and Node.js 22+ for development. Node is frontend build tooling only.

```sh
npm ci
cp .env.example .env
```

Configure the storage credentials and set `PUBLIC_URL=http://127.0.0.1:5173` in `.env`.

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build s3 create-bucket
npm run dev
```

Missing startup keys are generated in `.data` and reused on restart. Read `.data/setup-token.secret` for the first-owner setup token. Open `http://127.0.0.1:5173/admin`. Vite proxies requests to Go on port 3001. Restart development after Go source changes. The browser origin must match `PUBLIC_URL`.

| Command | Purpose |
| --- | --- |
| `npm run build` | Check Go and frontend code, build assets and server |
| `npm run build:binary` | Build the server with embedded frontend and CLI |
| `npm test` | Frontend, Go race, CLI, and HTTP contract tests |
| `npm run lint` | Frontend and Go checks |
| `npm run test:binary` | Test the packaged application without Node on PATH |
| `npm run test:runtime-path` | Test the same packaged binary at root, `/blog`, and a nested mount inferred from `PUBLIC_URL` |
| `npm run test:deploy` | Test generated proxy configurations with Docker |

Margin initializes fresh and already-migrated databases from `backend/internal/blog/schema.sql`. The SQLite and PostgreSQL tests cover the current schema and reopening a populated database.

To run the whole stack from source, use `docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d`. The source-build override is only needed for code changes; every image supports a runtime `MARGIN_BASE_PATH`.

For a source build outside Docker, run `npm run build`, set `PUBLIC_URL=http://localhost:3001`, then start `./artifacts/margin-server serve --web-dir dist/client`.

The workspace uses React Router framework mode. Go renders public HTML and serves compiled assets; public articles remain readable without JavaScript. Interactive content uses client-side enhancement. Feature UI lives in `src`, shared content types and parsers in `shared`, and the Go application in `backend`. The CLI is a separate Go module in `cli`.

Functions are limited to cyclomatic complexity 10. Build checks include lint, route generation, TypeScript and Go vet. Provider tests use mocks and make no paid AI calls.

Release snapshots require Go 1.27, Node 24, GoReleaser 2.18.3 and Docker Buildx:

```sh
export GITHUB_REPOSITORY=WritingMargin/margin
goreleaser check
goreleaser release --snapshot --clean
```

Add `--skip=docker` to build archives only. Use the root Dockerfile for source builds; `packaging/Dockerfile.release` expects GoReleaser's generated binary context.

On a push to main, CI builds and checks the archives and multi-platform image before publication. Only the job that writes release tags, GitHub releases and GHCR images shares the stable publish lock. Manual snapshots run independently. Each mainline commit advances the patch version from its last stable ancestor, so a push containing multiple commits can leave unused patch numbers. If an older build finishes last, it publishes its own version while the newer release keeps both latest pointers.
