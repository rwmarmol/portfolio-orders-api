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

Resolutions of the twelve points in `docs/spec.md` ("Open questions"), confirmed by the project owner's delegate on 2026-11-03. The numbering matches the spec.

### Q1 — Cancellation

- **Decision:** implement an endpoint to cancel orders, only when `NEW` (becomes `CANCELLED`). Built after the core.
- **Why:** the rules are already defined and the cost is low; the roadmap marks it optional.

### Q2 — Return

- **Decision:** each position exposes two fields: `dailyReturnPct` (`close` vs `previousClose`) and `totalReturnPct` (against the average purchase cost).
- **Why:** daily return is the only formula the spec defines; total return answers what "total" suggests.
- **Average cost:** moving weighted average cost. Walk the instrument's `FILLED` orders in chronological order (`datetime`, then `id`). A purchase updates the average; a sale reduces the quantity without changing the average; if the quantity reaches 0 the average is reset.
- **Formula:** `totalReturnPct = (close - average) / average * 100`. It is `null` when the quantity is <= 0, which covers instrument 31 (F1).
- **Purchase while quantity is <= 0:** the purchase first covers the shortfall. If the resulting quantity is > 0, the average is the price of that purchase; if it is still <= 0, the average is `null`. With quantity > 0 the moving weighted average applies.

### Q3 — LIMIT orders and funds

- **Decision:** every new order, MARKET included, is validated against the balance net of commitments from `NEW` LIMIT orders. There is no reservations table.
  - Buyable pesos = `FILLED` cash minus the sum of `size * price` of `NEW` LIMIT BUY orders.
  - Sellable shares = `FILLED` holdings minus the sum of `size` of `NEW` LIMIT SELL orders.
  - The computation runs inside the order transaction, under the per-user lock.
- **Portfolio response:** `availablePesos` (`FILLED` cash) and `committedPesos` (committed by `NEW` LIMIT BUY orders).
- **Why:** there is no execution engine (Q5), so a `NEW` LIMIT is never executed; a physical reservation would lock funds forever, while discounting commitments still prevents over-committing. Applying it to MARKET orders too keeps a single rule.

### Q4 — Rejections

- **Decision:** a business rejection (funds or holdings) returns HTTP 201 with the order stored as `REJECTED` and the reason in the response body. Invalid input returns 400 and is not stored.
- **Why:** the order is persisted either way, and per D1 the response carries the final status. The reason is not stored (no column).

### Q5 — LIMIT execution

- **Decision:** out of scope. A LIMIT stays `NEW`. The `FILLED` LIMIT in the seed data is just data.
- **Why:** the spec excludes market simulation.

### Q6 — CASH_IN and CASH_OUT

- **Decision:** a separate, optional endpoint. `CASH_OUT` validates against the buyable balance (`FILLED` cash minus the pesos committed by `NEW` LIMIT BUY orders, see Q3).
- **Why:** keeps the orders endpoint limited to BUY/SELL on tradable instruments.

### Q7 — Identifying the user

- **Decision:** `userId` goes in the path: `/users/:userId/portfolio` and `/users/:userId/orders`.
- **Why:** explicit, and easy to replace by the authenticated identity later.

### Q8 — Amount that does not cover one share

- **Decision:** 400 when the amount yields quantity 0, and 400 when both quantity and amount are sent. Neither sent is also invalid.
- **Why:** these are invalid requests, not business rejections, so they are not stored.

### Q9 — Price stored on MARKET orders

- **Decision:** the `close` used for the execution is stored as `price`.
- **Why:** the cash and position formulas use `size × price`.

### Q10 — Negative position

- **Decision:** shown as computed. Documented as a seed-data anomaly (see "Findings and oddities"). New sales are prevented by validating against holdings.
- **Why:** hiding it would conceal a data problem.

### Q11 — ARS

- **Decision:** appears only as `availablePesos`, never as a position. BUY or SELL on ARS returns 400.
- **Why:** cash is already modeled as the balance.

### Q12 — Search

- **Decision:** `GET /instruments?q=`: partial, case-insensitive match on ticker or name, excluding ARS, with a result limit.
- **Limit:** 20 results by default, 50 at most.
- **Ordering:** exact ticker match, then ticker starting with the query, then name containing the query; alphabetical within each group.
- **Why:** simple and enough for 66 instruments.

## Findings and oddities

### F1 — Negative position in seed data

- **Finding:** user 1 has `FILLED` orders that buy 20 and sell 30 of instrument 31, giving a position of -10. The seed also has a `FILLED` LIMIT order (instrument 31) and MARKET prices that do not match `marketdata.close`.
- **Handling:** the position is shown as computed (Q10). Because SELL orders are validated against holdings, any new SELL on that instrument for that user is rejected.