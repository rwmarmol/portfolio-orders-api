# Portfolio & Orders API

REST service for an investment platform: portfolio, instrument search and order submission.
See `docs/spec.md` for the scope and roadmap, and `docs/decisions.md` for design decisions.
`docs/decisiones-y-consideraciones.md` explains those decisions in plain Spanish, split into business
and technical sections (including the database changes, the local-only database policy, and what was
considered but not implemented).

## API

| Endpoint | Description |
| --- | --- |
| `GET /health` | Liveness and database check |
| `GET /users/:userId/portfolio` | Available and committed pesos, total value (`totalIsPartial` when a position has no price) and positions with returns |
| `GET /instruments?q=&limit=` | Search by ticker or name (partial, case-insensitive; default 20, max 50) |
| `POST /users/:userId/orders` | Submit a BUY or SELL, MARKET or LIMIT, by `quantity` or `amount` |
| `POST /users/:userId/orders/:orderId/cancel` | Cancel an order that is still `NEW` (idempotent; 409 if it is `FILLED` or `REJECTED`) |

```bash
curl localhost:3000/users/1/portfolio
curl 'localhost:3000/instruments?q=pa'
curl -X POST localhost:3000/users/1/orders -H 'content-type: application/json' \
  -d '{"instrumentId":47,"side":"BUY","type":"MARKET","quantity":10}'
```

Rejected orders (insufficient funds or holdings, no market price) are stored and answered with 201,
`status: "REJECTED"` and a `reason`; invalid input is a 400 and is not stored. The API contract is in
`docs/decisions.md` (D11). Do not run the write examples against a shared database.

## Requirements

- Node.js 24 LTS (`nvm use`)
- Docker with Compose

## Run locally

```bash
cp .env.example .env          # local defaults match docker-compose.yml
docker compose up -d --wait   # Postgres with schema and seed data
npm install
npm run db:migrate            # constraints and indexes (see docs/decisions.md, D8)
npm run start:dev
curl localhost:3000/health    # {"status":"ok","db":"up"}
```

The database init script runs only on the first start. To reset it: `docker compose down -v`.
The database is published on host port 5433 to avoid clashing with a local Postgres on 5432. Change it with `DB_PORT` (and update `DATABASE_URL` to match).

## Postman

`docs/postman/` holds the collection (28 requests, one per case, with assertions) and a `local`
environment (`baseUrl`, `userId`, ...). Import both into Postman, or run them from the terminal:

```bash
npx newman@6.2.1 run docs/postman/portfolio-orders-api.postman_collection.json \
  -e docs/postman/local.postman_environment.json
```

The order requests **write** orders for user 1: use them only against an API connected to the local
docker-compose Postgres (reset with `docker compose down -v`). The assertions are relative, so the
collection can be run repeatedly.

## Database migrations

SQL files in `db/migrations/`, applied in order by `npm run db:migrate` and tracked in the
`schema_migrations` table. The runner only accepts a local `DATABASE_URL` (`localhost`, `127.0.0.1`,
`::1`). Before applying a migration to any remote database, run its read-only precheck (for
example `db/migrations/002-precheck.sql`; every query must return zero rows) and get an explicit
decision from the project owner.

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
| `npm test` | Unit and e2e tests (no database needed) |
| `npm run test:db` | Functional tests against a throwaway database in the local compose Postgres |
| `npm run db:migrate` | Apply pending SQL migrations (local database only) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Configuration

Environment variables are validated at startup (see `.env.example`). Never commit `.env`.
