# Portfolio & Orders API — Specification and roadmap

## Scope

REST service in Node.js that lets a user view their portfolio, search market instruments and submit buy or sell orders, on top of an existing Postgres database.

| Endpoint | What it does |
| --- | --- |
| Portfolio | Returns total account value, available pesos and positions (quantity, market value in $, return %) |
| Instrument search | Returns instruments matching the query, by ticker and/or name |
| Submit order | Accepts BUY or SELL, MARKET or LIMIT, by quantity or by amount in pesos; stores the order in `orders` with its status |

### Out of scope

- Authentication and authorization: `userId` is received as a parameter and assumed to be resolved upstream.
- Market simulation: there is no matching engine.

### Non-functional requirements

- Exact decimals for money, never floats.
- Funds or holdings validation and order insertion in a single transaction.
- Runs locally with Docker Compose, using a local Postgres loaded with the initial data.
- Functional test for order submission and unit tests for the calculations.
- Postman collection with one request per case.
- CI with GitHub Actions.
- AWS deployment with Terraform as an optional layer, kept separate from the core.
- Every design decision and assumption is recorded in `docs/decisions.md`; schema changes are justified in writing.

## Business rules

Pesos and positions are derived only from the `orders` table (`size` column), and prices come from the latest `close` in `marketdata`, always in pesos.

### What happens to each order

| Case | Result |
| --- | --- |
| Valid MARKET | Executes immediately at the latest `close` and ends up FILLED |
| Valid LIMIT | Stored with the user's price in status NEW |
| BUY without enough pesos | Stored as REJECTED |
| SELL without enough shares | Stored as REJECTED |
| Cancellation | Only allowed when NEW; becomes CANCELLED |
| CASH_IN and CASH_OUT | Transfers modeled as orders on the ARS instrument (type MONEDA) |

### Quantity

- The user sends either an exact number of shares or a total amount in pesos.
- With an amount, quantity is the maximum whole number of shares that fits; fractions are not allowed.

### Calculations

These formulas are the interpretation of the specification and are validated during implementation.

- **Available pesos:** sum of FILLED movements. CASH_IN adds, CASH_OUT subtracts, BUY subtracts `size × price`, SELL adds `size × price`.
- **Position per instrument:** BUY adds `size`, SELL subtracts `size`, FILLED orders only.
- **Market value of a position:** quantity × the instrument's latest `close`.
- **Total account value:** available pesos plus the market value of all positions.
- **Daily return:** `close` versus `previousClose` in `marketdata`.
- When an order is executed, the user's position is updated.

## Data model and initial data

The initial schema defines four tables with no enums, checks or indexes (only primary and foreign keys), and with looser types than the specification suggests.

| Table | Columns |
| --- | --- |
| users | `id` SERIAL PK, `email` VARCHAR(255), `accountNumber` VARCHAR(20) |
| instruments | `id` SERIAL PK, `ticker` VARCHAR(10), `name` VARCHAR(255), `type` VARCHAR(10) |
| orders | `id` SERIAL PK, `instrumentId` INT FK, `userId` INT FK, `size` INT, `price` NUMERIC(10,2), `type` VARCHAR(10), `side` VARCHAR(10), `status` VARCHAR(20), `datetime` TIMESTAMP |
| marketdata | `id` SERIAL PK, `instrumentId` INT FK, `high`, `low`, `open`, `close`, `previousClose` NUMERIC(10,2), `date` DATE |

### Initial data

- 4 users (ids 1 to 4).
- 66 instruments: 65 of type ACCIONES and ARS (id 66, type MONEDA).
- `marketdata` covering two days, 2023-07-13 and 2023-07-14; ARS has no rows.
- 11 orders, all from user 1.

### Differences and oddities

- The original specification mentioned `datetime` in `marketdata`; the SQL defines `date` (DATE type).
- camelCase identifiers are unquoted, so Postgres stores them in lowercase (`instrumentid`, `userid`, `accountnumber`, `previousclose`).
- `side`, `type`, `status` and instrument type are free VARCHAR; nothing prevents invalid values.
- `marketdata` is loaded with 8 decimals but the column is NUMERIC(10,2), so values are rounded (for example, 1047.166 becomes 1047.17).
- Instruments 12 and 53 have `open`, `high` and `low` as NULL on 2023-07-13.
- CASH_IN and CASH_OUT rows use `instrumentId` 66, `price` 1 and an always-positive `size`; the sign comes from `side`.
- The initial data includes a FILLED LIMIT order (instrument 31), although a LIMIT starts as NEW and there is no market simulation.
- User 1 bought 20 and sold 30 of instrument 31 in FILLED orders, which gives a position of -10.
- Prices of the MARKET orders in the initial data do not match the `close` in `marketdata`.

### Reference values for validation

Computed by hand from user 1's FILLED orders; to be checked against the code.

| Concept | Value |
| --- | --- |
| Available pesos | 753,000 |
| Position, instrument 47 | 40 |
| Position, instrument 31 | -10 |
| Position, instrument 54 | 500 |

## Open questions

There are twelve points the specification does not define; each is resolved with product or with a decision recorded in `docs/decisions.md`.

| # | Topic | What is unclear |
| --- | --- | --- |
| 1 | Cancellation | The CANCELLED status and the "NEW only" rule are defined, but there is no cancellation endpoint. Should it be implemented? |
| 2 | Total return (%) | No formula is given. Daily return is defined (`close` vs `previousClose`), but "total" suggests average purchase cost. |
| 3 | Fund reservation on LIMIT | Does a NEW LIMIT BUY lock pesos? Are funds validated at creation, at execution, or both? |
| 4 | Rejection response | HTTP 201 with the order as REJECTED, or a 4xx? The order is stored either way. |
| 5 | LIMIT execution | There is no market simulation, yet the initial data has a FILLED LIMIT. What executes it? |
| 6 | CASH_IN and CASH_OUT | Are they sent through the orders endpoint? Does CASH_OUT validate the available balance? |
| 7 | Identifying the user | Without authentication, does `userId` go in the path, query, header or body? |
| 8 | Amount yielding zero quantity | If the amount does not cover one share, is the order rejected? What if both quantity and amount are sent? |
| 9 | Price stored on MARKET | Is the `close` used at execution stored as `price`? |
| 10 | Negative positions | The initial data yields -10 for instrument 31. Are such positions shown, excluded, or treated as invalid data? |
| 11 | ARS in the portfolio | Does it appear in the instrument list or only as available pesos? Can BUY or SELL be placed on ARS? |
| 12 | Search | Partial, case-insensitive match? Does it include ARS? Is there a result limit or ordering? |

## Roadmap

There are nine phases (0 to 8); the core (phases 0 to 5) is the priority and AWS is optional: if time is short, phase 7 is cut, never the core.

### Phase 0 — Repo foundation and agent context

- [ ] Choose framework, data access approach and test tooling, and record them in `docs/decisions.md`
- [ ] Create the repo with `.gitignore`, `.env` out of git and `.env.example` with placeholders
- [ ] `AGENTS.md` with project overview, commands, architecture and hard rules
- [ ] Short `CLAUDE.md` that imports `AGENTS.md`
- [ ] Versioned `.claude/settings.json`: permissions, deny reading `.env`, allowed commands
- [ ] Project skeleton with `dev`, `test` and `lint` scripts and a health endpoint
- [ ] Environment-based configuration validated at startup, and structured logging

### Phase 1 — Database

- [ ] `docker-compose.yml` with a local Postgres loaded with the schema and initial data
- [ ] Compare the real database's schema and data against the initial SQL (including the -10 on instrument 31)
- [ ] Confirm real column names (Postgres lowercases unquoted identifiers)
- [ ] Decide and justify schema changes (indexes, constraints, types)
- [ ] Keep the changes in a versioned script or migration

### Phase 2 — Domain core

- [ ] Available pesos from FILLED orders
- [ ] Net position per instrument from FILLED orders
- [ ] Latest price per instrument from `marketdata`
- [ ] Return per position, once the formula is defined
- [ ] Order validations: funds, holdings, whole quantity, valid instrument

### Phase 3 — Endpoints

- [ ] Portfolio
- [ ] Instrument search by ticker and/or name
- [ ] Order submission (MARKET and LIMIT, BUY and SELL, by quantity or by amount)
- [ ] Input validation and consistent error handling
- [ ] Optional: cancellation of NEW orders
- [ ] Optional: CASH_IN and CASH_OUT

### Phase 4 — Tests

- [ ] Functional test for order submission against the local Postgres: MARKET to FILLED, LIMIT to NEW, rejection for funds, rejection for holdings, amount converted to quantity
- [ ] Unit tests for the cash, position and return calculations
- [ ] Never test against the shared database

### Phase 5 — Documentation and Postman

- [ ] README with how to run locally (with and without Docker), endpoints and examples
- [ ] Assumptions, design decisions and schema changes documented
- [ ] Postman collection exported to `docs/postman/`, with an environment (`baseUrl`, `userId`)
- [ ] One request per case (MARKET, LIMIT, by amount, rejection for funds, rejection for holdings, search) with basic assertions
- [ ] If NestJS: OpenAPI via `@nestjs/swagger` and import into Postman

### Phase 6 — CI with GitHub Actions

- [ ] Workflow on every PR: lint and tests, with Postgres as a service container
- [ ] Pipeline secrets stored as GitHub Actions Secrets, never in the repo

### Phase 7 — AWS with Terraform (optional)

- [ ] Production Dockerfile (multi-stage build, non-root user, health check)
- [ ] Terraform in `/infra`: ECR, ECS cluster and Fargate service behind an ALB, with autoscaling and the DB secret in SSM or Secrets Manager
- [ ] Decide outbound access to the hosted database (public subnets or NAT gateway)
- [ ] Remote Terraform backend in S3 with locking, before enabling the pipeline
- [ ] GitHub Actions authentication to AWS via OIDC, no access keys
- [ ] Workflow: `terraform fmt`, `validate` and `plan` on every PR; build and push the image to ECR and `apply` on push to `main`
- [ ] Budget alert on the AWS account, and destroy the stack between sessions to cap ALB and Fargate costs
- [ ] "Optional deploy" section in the README

### Phase 8 — Release

- [ ] Check that no credentials exist in the repo or its history
- [ ] Verify the project runs from scratch following only the README

## Technical notes

The highest risks are concurrency when validating funds, handling money with decimals, and database credentials.

- **Concurrency:** validating funds or holdings and inserting the order must be atomic (a transaction with a per-user lock). Two simultaneous orders could both pass validation and leave the balance negative.
- **Precision:** `price` is NUMERIC(10,2) and the Postgres driver returns it as a string. Do not use floats for money; use a decimal library or do the arithmetic in the database.
- **Value range:** NUMERIC(10,2) goes up to 99,999,999.99; check whether that is enough for large amounts.
- **Credentials:** the database URL contains a username and password. They live in `.env` outside git, with a `.env.example` of placeholders. If leaked, rotate the password.
- **Performance:** there are no indexes besides primary keys. Candidates: `orders(userId, status)` and `marketdata(instrumentId, date)`. Do aggregations in SQL, not in memory.
- **Schema changes:** each one is justified in writing in `docs/decisions.md`.
- **Tests:** the functional test needs a test database or a rolled-back transaction, to avoid polluting shared data.
- **Public endpoint:** with no authentication and order writes, a public deployment needs throttling and should not stay permanently open.