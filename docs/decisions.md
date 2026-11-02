# Technical decisions, open questions and findings

## Technical decisions

### D1 — Synchronous, transactional order flow (no events or queues)

- **Decision:** order submission is processed synchronously in a single database transaction: funds or holdings validation, order insert and position update. No message queue and no event publishing for now.
- **Why:** MARKET orders must be FILLED immediately and rejections must be stored as REJECTED, so the response has to carry the final status. There are no event consumers today, so an outbox would be speculative architecture.
- **Risk:** under heavy load the single primary database is the bottleneck, and a future consumer (notifications, audit, analytics) would need events that do not exist yet.
- **Revisit when:** a real consumer appears or the load target outgrows a single primary. The planned path is a transactional outbox written in the same transaction as the order, and partitioning by `userId` if write volume requires it.

### D2 — Deployment target: ECS Fargate (optional phase)

- **Decision:** if the AWS phase is reached, the API runs as a container on ECS Fargate behind an ALB, managed with Terraform.
- **Why:** sustained load, persistent database connections and in-memory caching fit long-running containers better than Lambda.
- **Risk:** ALB and Fargate have a fixed hourly cost, so the stack is destroyed between sessions. Outbound access to the hosted database needs public subnets or a NAT gateway.

### D3 — NestJS as the framework

- **Decision:** NestJS (v12) on Node.js 24 LTS with strict TypeScript.
- **Why:** modules and dependency injection give the http -> service -> repository layering and testability; first-class support for validation, filters and OpenAPI (needed in Phase 5).
- **Risk:** Nest 12 packages are ESM-only while the project compiles to CommonJS, so Jest runs with `--experimental-vm-modules` and relies on `require(esm)` (Node >= 24). Revisit by moving the project to native ESM if this becomes painful.

### D4 — Raw SQL with `pg`, no ORM

- **Decision:** repositories use `pg` with parameterized SQL; no ORM or query builder for now.
- **Why:** the schema is small, order flow needs explicit transactions and locks, and aggregations should run in SQL. Postgres lowercases unquoted identifiers, so explicit SQL avoids surprises.
- **Risk:** more hand-written SQL and mapping code. Revisit if the schema or query count grows substantially.

### D5 — Jest for tests

- **Decision:** Jest with ts-jest. Unit tests for pure domain functions; e2e tests with supertest. Anything touching the database runs only against the local docker-compose Postgres.
- **Why:** the Nest default, widely supported, enough for the spec's testing requirements.

### D6 — Environment validation, logging and decimals

- **Decision:** environment variables validated with `zod` at startup (error messages list variable names, never values); structured JSON logging with `pino` via `nestjs-pino`, with request ids and header redaction; `decimal.js` for money arithmetic in code.
- **Why:** fail fast on misconfiguration without leaking credentials; operable logs from day one; no floats for money.

### D7 — Dockerfile for deployment; compose is only the local test database

- **Decision:** the API is shipped as a production Dockerfile (multi-stage, non-root, `HEALTHCHECK` on `/health`) that is configured only through environment variables. `docker-compose.yml` has just the local Postgres used for development and tests; production uses a remote Postgres whose URL is injected as `DATABASE_URL`.
- **Why:** the SRE team deploys the image on their own platform; the compose file has no role there. Keeping the API out of compose avoids two ways of running the app and preserves hot reload locally.
- **Risk:** `/health` includes a database check, so an orchestrator using it as a liveness probe would restart every instance during a database outage. Use it as readiness, or add a separate liveness endpoint when SRE defines their probes.

## Open questions

_No entries yet._

## Findings and oddities

_No entries yet._