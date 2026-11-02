# Portfolio & Orders API

REST service for an investment platform: portfolio, instrument search and order submission.
See `docs/spec.md` for the scope and roadmap, and `docs/decisions.md` for design decisions.

Current state: project skeleton (Phase 0) with `GET /health`. Business endpoints are not implemented yet.

## Requirements

- Node.js 24 LTS (`nvm use`)
- Docker with Compose

## Run locally

```bash
cp .env.example .env          # local defaults match docker-compose.yml
docker compose up -d --wait   # Postgres with schema and seed data
npm install
npm run start:dev
curl localhost:3000/health    # {"status":"ok","db":"up"}
```

The database init script runs only on the first start. To reset it: `docker compose down -v`.
The database is published on host port 5433 to avoid clashing with a local Postgres on 5432. Change it with `DB_PORT` (and update `DATABASE_URL` to match).

## Container image (deployment)

The `Dockerfile` builds the production image (multi-stage, runs as the non-root `node` user, runs
`node dist/main.js` so SIGTERM triggers a graceful shutdown). It contains no configuration or secrets:
everything comes from environment variables at runtime.

```bash
docker build -t portfolio-orders-api .
docker run -p 3000:3000 -e DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require' portfolio-orders-api
```

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | - | Hosted Postgres connection URL; inject from the platform's secret store |
| `PORT` | no | `3000` | |
| `LOG_LEVEL` | no | `info` | `fatal` to `trace`, or `silent` |
| `DATABASE_POOL_MAX` | no | `10` | Max pg connections per instance |

- Logs are JSON on stdout; each request carries an `x-request-id` (propagated if sent).
- `GET /health` returns 200 when the app and the database respond, and 503 when the database does not.
  The image `HEALTHCHECK` uses it.
- The API has no authentication or throttling yet (out of scope, see `docs/spec.md`): do not expose it publicly as is.
- The docker-compose Postgres is for local development and tests only, never for production.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm test` | Unit and e2e tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Configuration

Environment variables are validated at startup (see `.env.example`). Never commit `.env`.
