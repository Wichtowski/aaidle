# aAIdle agent guide

This file is the repository-level instruction set for coding agents. Keep it short, factual, and synchronized with the implementation.

## Project shape

- Frontend: Vite + React + TypeScript in `src/`; built assets are served by Caddy in production.
- Backend: Rust + Axum + SQLx in `backend/`; SQLite is the application database.
- API: versioned under `/api/v1`; public JSON uses camelCase.
- Data: canonical catalogs are in `data/`; SQLx migrations are in `backend/migrations/`.
- Tests: frontend/API Playwright and Vitest tests are in `tests/`; Rust integration tests are in `backend/tests/`.

Read [docs/architecture.md](docs/architecture.md) for the detailed system map and invariants. Read [docs/backend/api-v1.md](docs/backend/api-v1.md) before changing an API boundary.

## Non-negotiable invariants

- `daily_challenges.answer_model_id` is secret. Never return, persist in browser state, log, or include it in diagnostics.
- The server decides whether a guess is valid, whether a completion exists, and whether Hardcore access is allowed.
- Guess retries must remain idempotent; attempts must remain sequential and bounded by the eligible pool size.
- Authenticated browser mutations must preserve exact-origin and CSRF checks.
- Never expose passwords, session values, bearer tokens, OAuth secrets, health keys, or GitHub tokens.

## Working rules

1. Inspect the existing implementation and current worktree before editing.
2. Make the smallest change that satisfies the request; preserve unrelated user changes.
3. Keep UI, client domain logic, API handlers, Rust domain logic, repositories, migrations, and seed data in their existing boundaries.
4. For schema changes, add an additive migration and cover the repository/domain behavior with tests.
5. For API changes, update the API contract, frontend validation, and relevant tests together.
6. Do not edit generated `dist/` or `backend/target/` output.
7. Do not restore removed legacy migration documentation or unversioned compatibility routes without an explicit requirement.

## Useful commands

```bash
pnpm check
pnpm test:e2e
pnpm db:validate-seed
cd backend && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
```

For local setup and deployment, use the commands and configuration documented in [README.md](README.md) and [docs/backend/operations.md](docs/backend/operations.md).

## Handoff expectations

Describe what changed, what checks ran, and any checks blocked by missing services or credentials. Include documentation updates whenever behavior, routes, schema, or operational procedures change.
