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
If port 5432 is taken, use `DB_PORT=5433 docker compose up -d --wait` and update `DATABASE_URL`.

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
