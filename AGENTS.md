# AGENTS.md

Tool-neutral source of truth for anyone (human or AI agent) working on this repository.

## Project overview

Portfolio & Orders API: a REST service for an investment platform. Users view their portfolio,
search market instruments and submit buy/sell orders. It is treated as a production service:
correctness, security, maintainability and operability matter from day one.

- Full scope, business rules, data model, open questions and roadmap: `docs/spec.md`
- Confirmed decisions: `docs/decisions.md`
- Stack: Node.js 24 LTS, TypeScript (strict), NestJS, raw SQL with `pg` (no ORM), Jest, ESLint, Prettier, npm
- Language: everything written in the repo (code, comments, docs, commit messages) is in English.

## Commands

| Command | What it does |
| --- | --- |
| `docker compose up -d --wait` | Start the local Postgres (loads `db/init/*.sql` on first start only) |
| `docker compose down -v` | Stop and delete the local database volume (forces a re-seed) |
| `docker build -t portfolio-orders-api .` | Build the production image (configuration only via env vars) |
| `npm run db:migrate` | Apply pending migrations from `db/migrations/` (runner refuses non-local hosts) |
| `npm run start:dev` | Run the API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run unit and e2e tests (Jest, no database needed) |
| `npm run test:db` | Functional tests through the real app against `portfolio_test`, created inside the local compose Postgres (refuses non-local hosts) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

`docker-compose.yml` contains only the local test database; production uses a remote Postgres.
Set `DB_PORT` to publish the compose Postgres on a different host port (default 5433) and use the
same port in `DATABASE_URL`.

## Structure and layers

```
src/
  main.ts          bootstrap (env validated first, then Nest)
  app.module.ts
  config/          zod env schema + APP_CONFIG provider
  common/          errors/ (AppError hierarchy), http/ (exception filter, zod pipe), presentation/ (number formatting)
  database/        pg Pool provider (PG_POOL token in tokens.ts), TransactionRunner, pg type parsers
  users/ instruments/ market-data/ orders/ portfolio/   feature modules: controller -> service -> repository
  health/          GET /health
  domain/          pure functions only (no I/O, no Nest, no pg)
test/              e2e tests (*.e2e-spec.ts, no DB) and database-backed tests (*.db-spec.ts)
db/init/           baseline schema and seed, loaded by docker compose on first start
db/migrations/     versioned SQL migrations (+ read-only prechecks); scripts/migrate.mjs applies them
scripts/           operational scripts (migration runner)
docs/              spec and decisions
```

Feature modules follow `src/<feature>/` with three layers; dependencies only point down:

1. **http** (controllers, DTO validation) -> calls services only.
2. **services / use cases** (orchestration, transactions) -> call repositories and domain functions.
3. **repositories** (SQL via `pg`) -> the only code that talks to the database.

Domain logic (weights, positions, returns) is pure functions in `src/domain/` so it can be tested in
isolation. No events, queues or outbox for now (see D1 in `docs/decisions.md`).

Errors: throw `AppError` subclasses from services; the global filter produces
`{ statusCode, error, message, requestId }`. Logs are structured JSON (pino) on stdout.

## Hard rules

- **Money:** `NUMERIC` in the database and never `float`/`number` for money in code. Use `decimal.js`
  (or do the arithmetic in SQL). The `pg` driver returns `NUMERIC` as strings.
- **Postgres identifiers:** unquoted identifiers are lowercased (`instrumentid`, `userid`,
  `previousclose`, `accountnumber`). Use double quotes or explicit aliases whenever you want camelCase.
- **Orders:** validate funds or holdings and insert the order in a single transaction, with a
  per-user lock.
- **Databases:** tests and migrations run only against the local docker-compose Postgres. Never
  write to or migrate a shared or remote database unless the user explicitly asks.
- **Secrets:** never read, print or commit `.env` files or credentials, and never ask the user to
  paste them in chat. `.env.example` holds placeholders only.
- **Open questions:** business ambiguities (the "Open questions" section of `docs/spec.md`) are not
  decided by the agent. Propose options, and record the outcome in `docs/decisions.md` only after the
  user confirms.
- **Commits:** small, using Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
