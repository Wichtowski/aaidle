# Copilot instructions for aAIdle

Start with the repository-level [AGENTS.md](../AGENTS.md). It is the concise working agreement for changes in this repository.

Use the durable technical references when a task crosses a boundary:

- [Architecture](../docs/architecture.md) for ownership, data flow, invariants, and the repository map.
- [Backend operations](../docs/backend/operations.md) for Rust, SQLite, configuration, Docker, backups, and deployment.
- [API v1 contract](../docs/backend/api-v1.md) for routes, JSON shapes, authentication, rate limits, and compatibility.

Implementation rules:

- Keep the answer server-side. Never expose `daily_challenges.answer_model_id` in responses, browser state, logs, or diagnostics.
- Keep completions and access decisions server-authoritative. Client localStorage is a cache for UI progress, not proof of completion.
- Preserve retry idempotency, sequential attempts, exact pool-based attempt limits, CSRF/origin checks, and role-based admin authorization.
- Keep frontend code in `src/` independent of Rust and SQLite. Keep API behavior in `/api/v1` and update its contract when it changes.
- Use additive SQLx migrations for schema changes and update tests for changed DTOs or domain rules.
- Do not reintroduce the removed migration-matrix documentation or generic legacy routes without an explicit, documented requirement.

Verification:

```bash
pnpm check
cd backend && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
```

Prefer the smallest relevant check during iteration, then run the full applicable checks before handing off.
