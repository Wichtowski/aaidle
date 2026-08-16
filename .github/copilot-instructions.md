# Aidle repository context

Use the root [README](../README.md) for the project overview and quick-start instructions.
Read the following documentation when the task touches the corresponding area:

- [Architecture](../docs/architecture.md): system boundaries, answer secrecy, state ownership, and game invariants.
- [Backend operations](../docs/backend/operations.md): Rust service setup, configuration, SQLite behavior, Docker, backups, and validation commands.
- [API v1 contract](../docs/backend/api-v1.md): public route behavior, authentication, progress synchronization, and admin constraints.
- [Legacy migration matrix](../docs/migrations/legacy-migration-matrix.md): migration decisions, intentionally dropped aliases, and deferred features.

Preserve answer secrecy: do not expose `daily_challenges.answer_model_id` through public API responses, client state, or logs. Keep server-authoritative game completions and access controls backed by accepted server-side events.
